import { Env } from '../types';

export async function handleMain(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  
  // Main landing page routes
  if (url.pathname === '/') {
    return new Response(
      JSON.stringify({
        site: 'Mission Control',
        environment: env.ENVIRONMENT || 'production',
        message: 'Welcome to Mission Control - Your Developer Domain',
        endpoints: {
          main: 'https://misson-control.com',
          hub: 'https://hub.misson-control.com',
          api: 'https://api.misson-control.com',
          staging: 'https://staging.misson-control.com'
        }
      }, null, 2),
      {
        headers: {
          'content-type': 'application/json',
          'x-site': 'main'
        }
      }
    );
  }
  
  // About page
  if (url.pathname === '/about') {
    return new Response(
      JSON.stringify({
        name: 'Mission Control',
        version: '1.0.0',
        description: 'Monorepo for all Mission Control services'
      }, null, 2),
      {
        headers: { 'content-type': 'application/json' }
      }
    );
  }
  
  // 404 for unknown routes
  return new Response('Not Found', { status: 404 });
}