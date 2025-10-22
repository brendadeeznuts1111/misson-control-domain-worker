import { Env } from '../types';

export async function handleStaging(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  
  // Health check endpoint
  if (url.pathname === '/health') {
    return new Response('ok', { status: 200 });
  }
  
  // Staging environment info
  if (url.pathname === '/') {
    return new Response(
      JSON.stringify({
        site: 'Mission Control Staging',
        environment: 'staging',
        message: 'Staging Environment - Test features before production',
        warning: 'This is a staging environment. Data may be reset.',
        features: {
          experimental: true,
          debugMode: true,
          verboseLogging: true
        },
        version: 'latest',
        timestamp: new Date().toISOString()
      }, null, 2),
      {
        headers: {
          'content-type': 'application/json',
          'x-site': 'staging',
          'x-robots-tag': 'noindex, nofollow' // Don't index staging
        }
      }
    );
  }
  
  // Debug endpoint (staging only)
  if (url.pathname === '/debug') {
    return new Response(
      JSON.stringify({
        headers: Object.fromEntries(request.headers),
        cf: request.cf,
        url: url.toString(),
        method: request.method,
        env: {
          ENVIRONMENT: env.ENVIRONMENT,
          hasApiKey: !!env.API_KEY,
          hasDatabase: !!env.DATABASE_URL
        }
      }, null, 2),
      {
        headers: { 'content-type': 'application/json' }
      }
    );
  }
  
  // Test endpoint for trying new features
  if (url.pathname === '/test') {
    return new Response(
      JSON.stringify({
        message: 'Test endpoint for experimental features',
        timestamp: Date.now(),
        random: crypto.randomUUID()
      }, null, 2),
      {
        headers: { 'content-type': 'application/json' }
      }
    );
  }
  
  return new Response('Not Found', { status: 404 });
}