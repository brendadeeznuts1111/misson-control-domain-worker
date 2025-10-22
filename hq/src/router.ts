import { Router } from 'itty-router';

export function createRouter() {
  const router = Router();

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
    .get('/api/health', () => 
      new Response(JSON.stringify({ 
        status: 'healthy', 
        service: 'mission-control-hq',
        timestamp: new Date().toISOString() 
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    )
    .get('/api/openapi.json', () => {
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
      return new Response(JSON.stringify(spec), {
        headers: { 'Content-Type': 'application/json' }
      });
    })
    .all('/api/*', () => 
      new Response(JSON.stringify({ error: 'API endpoint not implemented yet' }), { 
        status: 501,
        headers: { 'Content-Type': 'application/json' }
      })
    )
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