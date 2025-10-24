import { z } from 'zod';

export const PagerDutyConfigSchema = z.object({
  integrationKey: z.string(),
  serviceId: z.string().optional(),
  escalationPolicyId: z.string().optional(),
  checkInterval: z.number().default(30000), // 30 seconds
  alertThreshold: z.number().default(4), // 4 failures = 2 minutes
});

export type PagerDutyConfig = z.infer<typeof PagerDutyConfigSchema>;

export interface PagerDutyEnv {
  PAGERDUTY_INTEGRATION_KEY: string;
  PAGERDUTY_SERVICE_ID?: string;
  HEALTH_CHECK?: KVNamespace;
}

export interface HealthCheckResult {
  success: boolean;
  status?: number;
  signature?: string;
  verified?: boolean;
  error?: string;
  timestamp: number;
}

export interface PagerDutyIncident {
  incident_key: string;
  event_type: 'trigger' | 'acknowledge' | 'resolve';
  description: string;
  details?: Record<string, any>;
  client?: string;
  client_url?: string;
  contexts?: Array<{
    type: string;
    href?: string;
    text?: string;
  }>;
}

export class PagerDutyMonitor {
  private config: PagerDutyConfig;
  
  constructor(
    private env: PagerDutyEnv,
    config?: Partial<PagerDutyConfig>
  ) {
    this.config = PagerDutyConfigSchema.parse({
      integrationKey: env.PAGERDUTY_INTEGRATION_KEY,
      serviceId: env.PAGERDUTY_SERVICE_ID,
      ...config,
    });
  }

  /**
   * Check Ghost Recon heartbeat endpoint
   */
  async checkHeartbeat(url: string): Promise<HealthCheckResult> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'PagerDuty-Monitor/1.0',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        return {
          success: false,
          status: response.status,
          error: `HTTP ${response.status}`,
          timestamp: Date.now(),
        };
      }

      const data = await response.json() as any;
      
      // Verify signature exists and is valid
      if (!data.signature || !data.verified) {
        return {
          success: false,
          status: response.status,
          signature: data.signature,
          verified: false,
          error: 'Invalid signature',
          timestamp: Date.now(),
        };
      }

      return {
        success: true,
        status: response.status,
        signature: data.signature,
        verified: true,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Get recent health check history
   */
  async getHealthHistory(identifier: string): Promise<HealthCheckResult[]> {
    if (!this.env.HEALTH_CHECK) return [];

    const key = `health:${identifier}`;
    const data = await this.env.HEALTH_CHECK.get(key);
    
    if (!data) return [];
    
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  /**
   * Store health check result
   */
  async storeHealthResult(identifier: string, result: HealthCheckResult): Promise<void> {
    if (!this.env.HEALTH_CHECK) return;

    const key = `health:${identifier}`;
    const history = await this.getHealthHistory(identifier);
    
    // Keep last 10 results
    history.push(result);
    if (history.length > 10) {
      history.shift();
    }

    await this.env.HEALTH_CHECK.put(key, JSON.stringify(history), {
      expirationTtl: 3600, // 1 hour TTL
    });
  }

  /**
   * Check if we should alert based on failure threshold
   */
  async shouldAlert(identifier: string): Promise<boolean> {
    const history = await this.getHealthHistory(identifier);
    
    if (history.length < this.config.alertThreshold) {
      return false;
    }

    // Check if last N checks all failed
    const recentChecks = history.slice(-this.config.alertThreshold);
    return recentChecks.every(check => !check.success);
  }

  /**
   * Send alert to PagerDuty
   */
  async triggerIncident(
    incidentKey: string,
    description: string,
    details?: Record<string, any>
  ): Promise<boolean> {
    const incident: PagerDutyIncident = {
      incident_key: incidentKey,
      event_type: 'trigger',
      description,
      details,
      client: 'Ghost Recon Monitor',
      client_url: 'https://mission-control.com/api/ghost/proof',
      contexts: [
        {
          type: 'link',
          href: 'https://mission-control.com/api/ghost/heartbeat',
          text: 'Heartbeat Endpoint',
        },
        {
          type: 'link',
          href: 'https://dash.cloudflare.com',
          text: 'Cloudflare Dashboard',
        },
      ],
    };

    try {
      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token token=${this.config.integrationKey}`,
        },
        body: JSON.stringify({
          routing_key: this.config.integrationKey,
          event_action: incident.event_type,
          dedup_key: incident.incident_key,
          payload: {
            summary: incident.description,
            severity: 'critical',
            source: 'mission-control-ghost-recon',
            component: 'heartbeat-monitor',
            custom_details: incident.details,
          },
          client: incident.client,
          client_url: incident.client_url,
          links: incident.contexts?.filter(c => c.type === 'link'),
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to trigger PagerDuty incident:', error);
      return false;
    }
  }

  /**
   * Resolve an existing incident
   */
  async resolveIncident(incidentKey: string): Promise<boolean> {
    try {
      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token token=${this.config.integrationKey}`,
        },
        body: JSON.stringify({
          routing_key: this.config.integrationKey,
          event_action: 'resolve',
          dedup_key: incidentKey,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to resolve PagerDuty incident:', error);
      return false;
    }
  }

  /**
   * Main monitoring loop - should be called periodically
   */
  async monitor(url: string): Promise<void> {
    const identifier = new URL(url).hostname;
    const incidentKey = `ghost-recon-${identifier}`;

    // Check heartbeat
    const result = await this.checkHeartbeat(url);
    await this.storeHealthResult(identifier, result);

    if (!result.success) {
      // Check if we should alert
      if (await this.shouldAlert(identifier)) {
        await this.triggerIncident(
          incidentKey,
          `Ghost Recon heartbeat failed for ${identifier}`,
          {
            status: result.status,
            error: result.error,
            signature: result.signature,
            verified: result.verified,
            timestamp: new Date(result.timestamp).toISOString(),
            threshold: `${this.config.alertThreshold} consecutive failures`,
          }
        );
      }
    } else {
      // If previously failing, resolve the incident
      const history = await this.getHealthHistory(identifier);
      const wasFailingBefore = history.slice(-this.config.alertThreshold - 1, -1)
        .some(check => !check.success);
      
      if (wasFailingBefore) {
        await this.resolveIncident(incidentKey);
      }
    }
  }
}

/**
 * Scheduled handler for Cloudflare Workers Cron Triggers
 */
export async function handleScheduled(
  env: PagerDutyEnv,
  ctx: ExecutionContext
): Promise<void> {
  const monitor = new PagerDutyMonitor(env);
  
  const endpoints = [
    'https://mission-control-hq-production.utahj4754.workers.dev/api/ghost/heartbeat',
    'https://mission-control-hq-staging.utahj4754.workers.dev/api/ghost/heartbeat',
  ];

  // Monitor all endpoints
  await Promise.all(
    endpoints.map(endpoint => monitor.monitor(endpoint))
  );
}

/**
 * Manual health check endpoint
 */
export async function handleHealthCheck(
  request: Request,
  env: PagerDutyEnv
): Promise<Response> {
  const url = new URL(request.url);
  const target = url.searchParams.get('target');
  
  if (!target) {
    return new Response(JSON.stringify({ error: 'Missing target parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const monitor = new PagerDutyMonitor(env);
  const result = await monitor.checkHeartbeat(target);
  
  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
  });
}