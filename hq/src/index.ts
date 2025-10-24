import { createRouter } from './router';
import { handleScheduled } from './pagerduty';

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
    
    return router.fetch(request).catch((err) => {
      console.error('Worker error:', err);
      return new Response('Internal Server Error', { status: 500 });
    });
  },
  
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Run PagerDuty health checks every 30 seconds
    if (env.PAGERDUTY_INTEGRATION_KEY) {
      await handleScheduled(env as any, ctx);
    }
  },
};