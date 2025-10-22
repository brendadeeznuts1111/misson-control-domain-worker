import { Env, Middleware } from '../types';

export const authMiddleware: Middleware = async (request, env, ctx) => {
  const url = new URL(request.url);
  
  // Skip auth for health checks
  if (url.pathname === '/health' || url.pathname === '/') {
    return null;
  }
  
  // Check for API key in header
  const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');
  
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'API key required. Please provide X-API-Key header or Authorization: Bearer token'
      }),
      {
        status: 401,
        headers: {
          'content-type': 'application/json',
          'WWW-Authenticate': 'Bearer realm="Mission Control API"'
        }
      }
    );
  }
  
  // Validate API key against environment secret
  if (env.API_KEY && apiKey !== env.API_KEY) {
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        message: 'Invalid API key'
      }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' }
      }
    );
  }
  
  // Auth passed, continue to handler
  return null;
};

// Helper for JWT validation (for future use)
export async function validateJWT(token: string, secret: string): Promise<boolean> {
  // Implement JWT validation logic here
  // For now, just a placeholder
  return true;
}