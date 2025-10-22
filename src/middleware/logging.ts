import { Env, Middleware } from '../types';

export const loggingMiddleware: Middleware = async (request, env, ctx) => {
  const start = Date.now();
  const url = new URL(request.url);
  
  // Log request details
  console.log({
    timestamp: new Date().toISOString(),
    method: request.method,
    path: url.pathname,
    hostname: url.hostname,
    environment: env.ENVIRONMENT || 'production',
    cf: {
      country: request.cf?.country,
      city: request.cf?.city,
      colo: request.cf?.colo
    }
  });
  
  // Add request ID for tracing
  const requestId = crypto.randomUUID();
  
  // Clone request to add header
  const newRequest = new Request(request);
  newRequest.headers.set('X-Request-Id', requestId);
  
  // Wait for response and log it
  ctx.waitUntil(
    (async () => {
      const duration = Date.now() - start;
      console.log({
        requestId,
        duration: `${duration}ms`,
        completed: true
      });
    })()
  );
  
  // Continue to next middleware
  return null;
};