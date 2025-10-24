import { createRouter } from './router';
import { handleScheduled } from './pagerduty';
import { StructuredLogger, logResponse } from './logger';

export interface Env {
  CONFIG?: KVNamespace;
  ASSETS?: R2Bucket;
  RATE_LIMITS: KVNamespace;
  ENVIRONMENT: string;
  JWT_SECRET: string;
  API_KEY_SECRET: string;
  GHOST_SIGNATURE?: string;
  GHOST_PUBLIC_KEY?: string;
  DEPLOYMENT_ID?: string;
  REGION_ID?: string;
  CANARY_PERCENT?: string;
  AUDIT_LOG?: KVNamespace;
  DEAD_MAN_FUSE?: KVNamespace;
  HEALTH_CHECK?: KVNamespace;
  PAGERDUTY_INTEGRATION_KEY?: string;
  PAGERDUTY_SERVICE_ID?: string;
  INTERNAL_API_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const router = createRouter(env);
    const startTime = Date.now();
    
    try {
      const response = await router.fetch(request);
      // Add logging to response
      return logResponse(request, response);
    } catch (err) {
      // Create logger for error handling
      const logger = StructuredLogger.fromRequest(request, env);
      
      if (err instanceof Error) {
        logger.error('Worker error', err, {
          path: new URL(request.url).pathname,
          method: request.method,
          duration: Date.now() - startTime
        });
      } else {
        logger.error('Unknown worker error', undefined, {
          error: String(err),
          path: new URL(request.url).pathname,
          method: request.method,
          duration: Date.now() - startTime
        });
      }
      
      // Return error response with correlation ID
      const headers = new Headers();
      headers.set('X-Correlation-ID', logger['context'].correlationId);
      headers.set('Content-Type', 'application/json');
      
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          correlationId: logger['context'].correlationId,
          timestamp: new Date().toISOString()
        }),
        { 
          status: 500,
          headers
        }
      );
    }
  },
  
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Run PagerDuty health checks every 30 seconds
    if (env.PAGERDUTY_INTEGRATION_KEY) {
      await handleScheduled(env as any, ctx);
    }
  },
};