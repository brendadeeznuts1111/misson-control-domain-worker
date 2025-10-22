export interface Env {
  // Environment variables
  ENVIRONMENT: string;
  API_HOST?: string;
  
  // Secrets (added via wrangler secret)
  API_KEY?: string;
  DATABASE_URL?: string;
  JWT_SECRET?: string;
  
  // KV Namespaces
  CACHE?: KVNamespace;
  SESSIONS?: KVNamespace;
  
  // Durable Objects
  // RATE_LIMITER?: DurableObjectNamespace;
  
  // R2 Buckets
  // ASSETS?: R2Bucket;
}

export type Middleware = (
  request: Request,
  env: Env,
  ctx: ExecutionContext
) => Promise<Response | null>;

export type RouteHandler = (
  request: Request,
  env: Env,
  ctx: ExecutionContext
) => Promise<Response>;