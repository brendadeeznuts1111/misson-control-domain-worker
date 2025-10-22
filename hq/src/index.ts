import { createRouter } from './router';

export interface Env {
  CONFIG: KVNamespace;
  ASSETS: R2Bucket;
  ENVIRONMENT: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const router = createRouter();
    
    return router.handle(request).catch((err) => {
      console.error('Worker error:', err);
      return new Response('Internal Server Error', { status: 500 });
    });
  },
};