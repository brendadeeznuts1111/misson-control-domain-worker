import { createRouter } from './router';

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
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const router = createRouter(env);
    
    return router.fetch(request).catch((err) => {
      console.error('Worker error:', err);
      return new Response('Internal Server Error', { status: 500 });
    });
  },
};