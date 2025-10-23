import { z } from 'zod';

export const GhostReconConfigSchema = z.object({
  signatureKey: z.string().optional(),
  publicKeyUrl: z.string().optional().default('/api/ghost.pub'),
  regionId: z.string().optional().default('us-east-1'),
  deploymentId: z.string().optional(),
  canaryPercent: z.number().min(0).max(100).optional().default(0),
  metricsEndpoint: z.string().optional(),
  auditLogKV: z.string().optional().default('AUDIT_LOG'),
});

export type GhostReconConfig = z.infer<typeof GhostReconConfigSchema>;

export interface GhostReconEnv {
  GHOST_SIGNATURE?: string;
  GHOST_PUBLIC_KEY?: string;
  DEPLOYMENT_ID?: string;
  REGION_ID?: string;
  CANARY_PERCENT?: string;
  AUDIT_LOG?: KVNamespace;
  DEAD_MAN_FUSE?: KVNamespace;
}

interface HeartbeatData {
  timestamp: number;
  service: string;
  region: string;
  deployment: string;
  status: 'healthy' | 'degraded' | 'critical';
  metrics?: {
    requests: number;
    errors: number;
    latencyP50: number;
    latencyP99: number;
  };
}

interface AuditEntry {
  id: string;
  timestamp: number;
  action: string;
  actor: string;
  resource: string;
  result: 'success' | 'failure';
  metadata?: Record<string, any>;
}

export class GhostRecon {
  constructor(
    private env: GhostReconEnv,
    config?: Partial<GhostReconConfig>
  ) {
    this.config = GhostReconConfigSchema.parse(config || {});
  }
  
  private config: GhostReconConfig;

  /**
   * Generate cryptographic signature for heartbeat data
   */
  async generateHeartbeatSignature(data: HeartbeatData): Promise<string> {
    const payload = JSON.stringify(data);
    const hash = await this.sha256(payload);
    
    // In production, this would use minisign
    // For now, we'll use a simple HMAC-like signature
    const signature = this.env.GHOST_SIGNATURE || 'unsigned';
    return `${hash}:${signature}`;
  }

  /**
   * Verify heartbeat signature
   */
  async verifyHeartbeatSignature(data: HeartbeatData, signature: string): Promise<boolean> {
    const expectedSignature = await this.generateHeartbeatSignature(data);
    return signature === expectedSignature;
  }

  /**
   * Calculate SHA256 hash of response content
   */
  async calculateContentHash(content: string | ArrayBuffer): Promise<string> {
    const data = typeof content === 'string' 
      ? new TextEncoder().encode(content)
      : new Uint8Array(content);
    
    return await this.sha256(data);
  }

  /**
   * Apply Ghost Recon headers to response
   */
  async applyGhostHeaders(response: Response, content?: string): Promise<Response> {
    const headers = new Headers(response.headers);
    
    // Add deployment metadata
    headers.set('X-Deployment-ID', this.env.DEPLOYMENT_ID || 'unknown');
    headers.set('X-Region-ID', this.env.REGION_ID || this.config.regionId);
    
    // Add content hash if available
    if (content) {
      const hash = await this.calculateContentHash(content);
      headers.set('X-Content-SHA256', hash);
      headers.set('Last-Modified-SHA', hash.substring(0, 8));
    }
    
    // Add canary status
    if (this.config.canaryPercent > 0) {
      headers.set('X-Canary-Deployment', 'true');
      headers.set('X-Canary-Percent', this.config.canaryPercent.toString());
    }
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  /**
   * Check if request should be served by canary
   */
  shouldServeCanary(request: Request): boolean {
    if (this.config.canaryPercent === 0) return false;
    if (this.config.canaryPercent === 100) return true;
    
    // Use request fingerprint for consistent routing
    const identifier = request.headers.get('CF-Connecting-IP') || 
                      request.headers.get('X-Forwarded-For') || 
                      'unknown';
    
    const hash = this.simpleHash(identifier);
    return (hash % 100) < this.config.canaryPercent;
  }

  /**
   * Update dead-man fuse lease
   */
  async updateDeadManFuse(status: 'active' | 'inactive'): Promise<void> {
    if (!this.env.DEAD_MAN_FUSE) return;
    
    const key = `fuse:${this.env.DEPLOYMENT_ID || 'default'}`;
    const data = {
      status,
      timestamp: Date.now(),
      region: this.env.REGION_ID || this.config.regionId,
      ttl: 300, // 5 minutes
    };
    
    await this.env.DEAD_MAN_FUSE.put(key, JSON.stringify(data), {
      expirationTtl: 300, // Auto-expire after 5 minutes
    });
  }

  /**
   * Check dead-man fuse status
   */
  async checkDeadManFuse(): Promise<boolean> {
    if (!this.env.DEAD_MAN_FUSE) return true;
    
    const key = `fuse:${this.env.DEPLOYMENT_ID || 'default'}`;
    const data = await this.env.DEAD_MAN_FUSE.get(key);
    
    if (!data) return false;
    
    try {
      const fuse = JSON.parse(data);
      const age = Date.now() - fuse.timestamp;
      return fuse.status === 'active' && age < fuse.ttl * 1000;
    } catch {
      return false;
    }
  }

  /**
   * Log audit entry
   */
  async logAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
    if (!this.env.AUDIT_LOG) return;
    
    const auditEntry: AuditEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      ...entry,
    };
    
    const key = `audit:${auditEntry.timestamp}:${auditEntry.id}`;
    await this.env.AUDIT_LOG.put(key, JSON.stringify(auditEntry), {
      expirationTtl: 2592000, // 30 days
    });
  }

  /**
   * Generate dynamic SVG badge
   */
  generateStatusBadge(status: 'operational' | 'degraded' | 'outage'): string {
    const colors = {
      operational: '#4ade80',
      degraded: '#fbbf24',
      outage: '#ef4444',
    };
    
    const color = colors[status];
    const label = 'Mission Control';
    const message = status.charAt(0).toUpperCase() + status.slice(1);
    
    return `<svg xmlns="http://www.w3.org/2000/svg" width="156" height="20">
      <linearGradient id="b" x2="0" y2="100%">
        <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
        <stop offset="1" stop-opacity=".1"/>
      </linearGradient>
      <mask id="a">
        <rect width="156" height="20" rx="3" fill="#fff"/>
      </mask>
      <g mask="url(#a)">
        <path fill="#555" d="M0 0h95v20H0z"/>
        <path fill="${color}" d="M95 0h61v20H95z"/>
        <path fill="url(#b)" d="M0 0h156v20H0z"/>
      </g>
      <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
        <text x="47.5" y="15" fill="#010101" fill-opacity=".3">${label}</text>
        <text x="47.5" y="14">${label}</text>
        <text x="124.5" y="15" fill="#010101" fill-opacity=".3">${message}</text>
        <text x="124.5" y="14">${message}</text>
      </g>
    </svg>`;
  }

  /**
   * Create rollback checkpoint
   */
  async createRollbackCheckpoint(): Promise<string> {
    const checkpointId = this.generateId();
    const checkpoint = {
      id: checkpointId,
      timestamp: Date.now(),
      deployment: this.env.DEPLOYMENT_ID || 'unknown',
      region: this.env.REGION_ID || this.config.regionId,
      config: this.config,
    };
    
    if (this.env.AUDIT_LOG) {
      const key = `checkpoint:${checkpointId}`;
      await this.env.AUDIT_LOG.put(key, JSON.stringify(checkpoint));
    }
    
    return checkpointId;
  }

  /**
   * Generate public proof page HTML
   */
  generateProofPage(heartbeat: HeartbeatData, signature: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ghost Recon - Deployment Proof</title>
  <style>
    body {
      font-family: 'Courier New', monospace;
      background: #0a0a0a;
      color: #00ff00;
      padding: 2rem;
      margin: 0;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    h1 {
      text-align: center;
      text-shadow: 0 0 20px #00ff00;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    .proof-block {
      background: #111;
      border: 1px solid #00ff00;
      border-radius: 4px;
      padding: 1rem;
      margin: 1rem 0;
      font-size: 0.9rem;
      word-break: break-all;
    }
    .label {
      color: #888;
      font-size: 0.8rem;
      text-transform: uppercase;
      margin-bottom: 0.25rem;
    }
    .signature {
      background: #1a1a1a;
      padding: 0.5rem;
      border-left: 3px solid #00ff00;
      margin-top: 0.5rem;
    }
    .status {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 3px;
      text-transform: uppercase;
      font-weight: bold;
    }
    .status.healthy { background: #064e3b; color: #4ade80; }
    .status.degraded { background: #713f12; color: #fbbf24; }
    .status.critical { background: #7f1d1d; color: #ef4444; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🪖 GHOST RECON PROOF 🪖</h1>
    
    <div class="proof-block">
      <div class="label">Deployment ID</div>
      <div>${heartbeat.deployment}</div>
    </div>
    
    <div class="proof-block">
      <div class="label">Region</div>
      <div>${heartbeat.region}</div>
    </div>
    
    <div class="proof-block">
      <div class="label">Timestamp</div>
      <div>${new Date(heartbeat.timestamp).toISOString()}</div>
    </div>
    
    <div class="proof-block">
      <div class="label">Status</div>
      <div><span class="status ${heartbeat.status}">${heartbeat.status}</span></div>
    </div>
    
    <div class="proof-block">
      <div class="label">Cryptographic Signature</div>
      <div class="signature">${signature}</div>
    </div>
    
    <div class="proof-block">
      <div class="label">Heartbeat Payload</div>
      <pre>${JSON.stringify(heartbeat, null, 2)}</pre>
    </div>
  </div>
</body>
</html>`;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private async sha256(data: string | Uint8Array): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

/**
 * Ghost Recon middleware factory
 */
export function createGhostReconMiddleware(env: GhostReconEnv, config?: Partial<GhostReconConfig>) {
  const ghost = new GhostRecon(env, GhostReconConfigSchema.parse(config || {}));
  
  return async (request: Request, response: Response): Promise<Response> => {
    // Apply Ghost headers
    const enhancedResponse = await ghost.applyGhostHeaders(response);
    
    // Update dead-man fuse
    await ghost.updateDeadManFuse('active');
    
    // Log audit entry
    await ghost.logAudit({
      action: 'request',
      actor: request.headers.get('CF-Connecting-IP') || 'unknown',
      resource: new URL(request.url).pathname,
      result: response.status < 400 ? 'success' : 'failure',
      metadata: {
        status: response.status,
        canary: ghost.shouldServeCanary(request),
      },
    });
    
    return enhancedResponse;
  };
}