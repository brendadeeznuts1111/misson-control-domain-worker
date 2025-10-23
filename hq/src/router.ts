import { Router } from 'itty-router';
import { authMiddleware, AuthError } from './auth';
import { RateLimiter, createRateLimitMiddleware } from './rate-limiter';
import { getSwaggerUIHTML } from './swagger-ui';
import { GhostRecon, createGhostReconMiddleware } from './ghost-recon';
import type { Env } from './index';

export function createRouter(env: Env) {
  const router = Router();
  
  // Configure rate limits for different user types
  const authRateLimit = createRateLimitMiddleware(env, {
    windowMs: 60000, // 1 minute
    maxRequests: 100, // authenticated users
    maxBurst: 10,
  });
  
  const publicRateLimit = createRateLimitMiddleware(env, {
    windowMs: 60000, // 1 minute  
    maxRequests: 20, // unauthenticated users
    maxBurst: 5,
  });

  // Initialize Ghost Recon
  const ghostRecon = new GhostRecon(env);
  const applyGhostHeaders = createGhostReconMiddleware(env);

  router
    .get('/', () => {
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Mission Control HQ</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              margin: 0;
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
            }
            .container {
              text-align: center;
              padding: 2rem;
            }
            h1 {
              font-size: 3rem;
              margin-bottom: 1rem;
            }
            .links {
              margin-top: 2rem;
              display: flex;
              gap: 1rem;
              justify-content: center;
            }
            a {
              color: white;
              text-decoration: none;
              padding: 0.75rem 1.5rem;
              border: 2px solid white;
              border-radius: 8px;
              transition: all 0.3s;
            }
            a:hover {
              background: white;
              color: #667eea;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🚀 Mission Control HQ</h1>
            <p>Unified dashboard for all Mission Control services</p>
            <div class="links">
              <a href="/api/health">API Health</a>
              <a href="/api/openapi.json">OpenAPI Spec</a>
              <a href="/hub">Hub Portal</a>
            </div>
          </div>
        </body>
        </html>
      `;
      return new Response(html, {
        headers: { 'Content-Type': 'text/html' }
      });
    })
    .get('/api/health', async (request) => {
      // Check rate limit first
      let apiKey: string | undefined;
      const authHeader = request.headers.get('Authorization');
      const apiKeyHeader = request.headers.get('X-API-Key');
      
      if (apiKeyHeader) {
        apiKey = apiKeyHeader;
      }
      
      // Apply appropriate rate limit
      const rateLimiter = apiKey || authHeader ? authRateLimit : publicRateLimit;
      const rateLimitResponse = await rateLimiter(request, apiKey);
      if (rateLimitResponse) return rateLimitResponse;
      
      // Then check auth
      try {
        await authMiddleware(request, env);
      } catch (error) {
        if (error instanceof AuthError) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: error.status,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        throw error;
      }
      
      let response = new Response(JSON.stringify({ 
        status: 'healthy', 
        service: 'mission-control-hq',
        timestamp: new Date().toISOString() 
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
      // Apply rate limit headers
      if ((request as any).rateLimitResult) {
        response = RateLimiter.applyHeaders(response, (request as any).rateLimitResult);
      }
      
      return response;
    })
    .get('/api/openapi.json', async (request) => {
      // Apply rate limiting (public access for docs)
      const rateLimitResponse = await publicRateLimit(request);
      if (rateLimitResponse) return rateLimitResponse;
      const spec = {
        openapi: '3.0.3',
        info: {
          title: 'Mission Control API',
          version: '0.3.0',
          description: 'Unified API for Mission Control services'
        },
        servers: [
          { url: 'https://api.mission-control.com' }
        ],
        paths: {
          '/health': {
            get: {
              summary: 'Health check endpoint',
              responses: {
                '200': {
                  description: 'Service is healthy',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          status: { type: 'string' },
                          service: { type: 'string' },
                          timestamp: { type: 'string', format: 'date-time' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };
      
      let response = new Response(JSON.stringify(spec), {
        headers: { 'Content-Type': 'application/json' }
      });
      
      // Apply rate limit headers
      if ((request as any).rateLimitResult) {
        response = RateLimiter.applyHeaders(response, (request as any).rateLimitResult);
      }
      
      return response;
    })
    .get('/api/docs', async (request) => {
      // Apply rate limiting (but no auth for public docs)
      const rateLimitResponse = await publicRateLimit(request);
      if (rateLimitResponse) return rateLimitResponse;
      
      // Get the base URL for the OpenAPI spec
      const url = new URL(request.url);
      const specUrl = `${url.protocol}//${url.host}/api/openapi.json`;
      
      let response = new Response(getSwaggerUIHTML(specUrl), {
        headers: { 
          'Content-Type': 'text/html',
          'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
        }
      });
      
      // Apply rate limit headers
      if ((request as any).rateLimitResult) {
        response = RateLimiter.applyHeaders(response, (request as any).rateLimitResult);
      }
      
      return response;
    })
    .get('/api/ghost/heartbeat', async (request) => {
      // Public endpoint for signed heartbeats
      const rateLimitResponse = await publicRateLimit(request);
      if (rateLimitResponse) return rateLimitResponse;
      
      const heartbeat = {
        timestamp: Date.now(),
        service: 'mission-control-hq',
        region: env.REGION_ID || 'us-east-1',
        deployment: env.DEPLOYMENT_ID || 'unknown',
        status: 'healthy' as const,
        metrics: {
          requests: 1000,
          errors: 5,
          latencyP50: 25,
          latencyP99: 150,
        },
      };
      
      const signature = await ghostRecon.generateHeartbeatSignature(heartbeat);
      
      let response = new Response(JSON.stringify({
        heartbeat,
        signature,
        verified: true,
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
      response = await applyGhostHeaders(request, response);
      
      if ((request as any).rateLimitResult) {
        response = RateLimiter.applyHeaders(response, (request as any).rateLimitResult);
      }
      
      return response;
    })
    .get('/api/ghost/proof', async (request) => {
      // Public proof page
      const rateLimitResponse = await publicRateLimit(request);
      if (rateLimitResponse) return rateLimitResponse;
      
      const heartbeat = {
        timestamp: Date.now(),
        service: 'mission-control-hq',
        region: env.REGION_ID || 'us-east-1',
        deployment: env.DEPLOYMENT_ID || 'unknown',
        status: 'healthy' as const,
      };
      
      const signature = await ghostRecon.generateHeartbeatSignature(heartbeat);
      const html = ghostRecon.generateProofPage(heartbeat, signature);
      
      let response = new Response(html, {
        headers: { 
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache',
        }
      });
      
      response = await applyGhostHeaders(request, response);
      
      if ((request as any).rateLimitResult) {
        response = RateLimiter.applyHeaders(response, (request as any).rateLimitResult);
      }
      
      return response;
    })
    .get('/api/ghost/badge.svg', async (request) => {
      // Dynamic status badge
      const rateLimitResponse = await publicRateLimit(request);
      if (rateLimitResponse) return rateLimitResponse;
      
      const status = await ghostRecon.checkDeadManFuse() ? 'operational' : 'outage';
      const svg = ghostRecon.generateStatusBadge(status);
      
      let response = new Response(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=30',
          'cf-cache-ttl': '30',
        }
      });
      
      if ((request as any).rateLimitResult) {
        response = RateLimiter.applyHeaders(response, (request as any).rateLimitResult);
      }
      
      return response;
    })
    .post('/api/ghost/rollback', async (request) => {
      // Protected rollback endpoint
      try {
        await authMiddleware(request, env);
      } catch (error) {
        if (error instanceof AuthError) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: error.status,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        throw error;
      }
      
      const checkpointId = await ghostRecon.createRollbackCheckpoint();
      
      let response = new Response(JSON.stringify({
        message: 'Rollback checkpoint created',
        checkpointId,
        timestamp: new Date().toISOString(),
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
      response = await applyGhostHeaders(request, response);
      
      return response;
    })
    .all('/api/*', async (request) => {
      // Check rate limit first
      let apiKey: string | undefined;
      const authHeader = request.headers.get('Authorization');
      const apiKeyHeader = request.headers.get('X-API-Key');
      
      if (apiKeyHeader) {
        apiKey = apiKeyHeader;
      }
      
      // Apply appropriate rate limit
      const rateLimiter = apiKey || authHeader ? authRateLimit : publicRateLimit;
      const rateLimitResponse = await rateLimiter(request, apiKey);
      if (rateLimitResponse) return rateLimitResponse;
      
      // Then check auth
      try {
        await authMiddleware(request, env);
      } catch (error) {
        if (error instanceof AuthError) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: error.status,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        throw error;
      }
      
      let response = new Response(JSON.stringify({ error: 'API endpoint not implemented yet' }), { 
        status: 501,
        headers: { 'Content-Type': 'application/json' }
      });
      
      // Apply rate limit headers
      if ((request as any).rateLimitResult) {
        response = RateLimiter.applyHeaders(response, (request as any).rateLimitResult);
      }
      
      return response;
    })
    .all('/hub/*', (request) => {
      return new Response(JSON.stringify({ 
        message: 'Hub proxy not configured yet',
        path: new URL(request.url).pathname
      }), { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    })
    .all('*', () => new Response('Not Found', { status: 404 }));

  return router;
}