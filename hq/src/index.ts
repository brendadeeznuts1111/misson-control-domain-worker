import { createRouter } from './router';

export interface Env {
  CONFIG?: KVNamespace;
  ASSETS?: R2Bucket;
  RATE_LIMITS: KVNamespace;
  ENVIRONMENT: string;
  JWT_SECRET: string;
  API_KEY_SECRET: string;
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