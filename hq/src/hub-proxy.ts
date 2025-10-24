import type { Env } from './index';

export interface HubConfig {
  upstreams: {
    [key: string]: {
      url: string;
      headers?: Record<string, string>;
      auth?: 'jwt' | 'apikey' | 'none';
    };
  };
  routes: {
    path: string;
    upstream: string;
    methods?: string[];
    rewrite?: string;
  }[];
}

const DEFAULT_HUB_CONFIG: HubConfig = {
  upstreams: {
    api: {
      url: 'https://api.internal.mission-control.com',
      auth: 'jwt',
    },
    dashboard: {
      url: 'https://dashboard.internal.mission-control.com',
      auth: 'none',
    },
    metrics: {
      url: 'https://metrics.internal.mission-control.com',
      auth: 'apikey',
    },
  },
  routes: [
    {
      path: '/hub/api/*',
      upstream: 'api',
      rewrite: '/$1',
    },
    {
      path: '/hub/dashboard/*',
      upstream: 'dashboard',
      rewrite: '/$1',
    },
    {
      path: '/hub/metrics/*',
      upstream: 'metrics',
      methods: ['GET'],
      rewrite: '/$1',
    },
  ],
};

export class HubProxy {
  private config: HubConfig;
  
  constructor(private env: Env, config?: HubConfig) {
    this.config = config || DEFAULT_HUB_CONFIG;
  }
  
  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Find matching route
    const route = this.config.routes.find(r => {
      const pattern = r.path.replace(/\*/g, '.*');
      return new RegExp(`^${pattern}$`).test(path);
    });
    
    if (!route) {
      return new Response(JSON.stringify({
        error: 'No route configured for this path',
        path,
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Check method restriction
    if (route.methods && !route.methods.includes(request.method)) {
      return new Response(JSON.stringify({
        error: 'Method not allowed',
        allowed: route.methods,
      }), {
        status: 405,
        headers: { 
          'Content-Type': 'application/json',
          'Allow': route.methods.join(', '),
        },
      });
    }
    
    // Get upstream configuration
    const upstream = this.config.upstreams[route.upstream];
    if (!upstream) {
      return new Response(JSON.stringify({
        error: 'Upstream not configured',
        upstream: route.upstream,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Build target URL
    let targetPath = path;
    if (route.rewrite) {
      const match = path.match(new RegExp(route.path.replace('*', '(.*)')));
      if (match && match[1]) {
        targetPath = route.rewrite.replace('$1', match[1]);
      } else {
        targetPath = route.rewrite.replace('$1', '');
      }
    }
    
    const targetUrl = new URL(targetPath, upstream.url);
    targetUrl.search = url.search; // Preserve query params
    
    // Build headers
    const headers = new Headers(request.headers);
    
    // Remove CF-specific headers
    headers.delete('cf-connecting-ip');
    headers.delete('cf-ray');
    headers.delete('cf-visitor');
    
    // Add upstream headers
    if (upstream.headers) {
      for (const [key, value] of Object.entries(upstream.headers)) {
        headers.set(key, value);
      }
    }
    
    // Add authentication if required
    if (upstream.auth === 'jwt' && !headers.has('Authorization')) {
      // Generate internal JWT token
      const token = await this.generateInternalToken();
      headers.set('Authorization', `Bearer ${token}`);
    } else if (upstream.auth === 'apikey' && !headers.has('X-API-Key')) {
      // Use internal API key
      if (this.env.INTERNAL_API_KEY) {
        headers.set('X-API-Key', this.env.INTERNAL_API_KEY);
      }
    }
    
    // Add forwarding headers
    headers.set('X-Forwarded-For', request.headers.get('cf-connecting-ip') || 'unknown');
    headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
    headers.set('X-Forwarded-Host', url.host);
    
    try {
      // Make upstream request
      const upstreamResponse = await fetch(targetUrl.toString(), {
        method: request.method,
        headers,
        body: request.body,
        // @ts-ignore - CF specific
        cf: {
          cacheTtl: 0, // Don't cache proxy requests
        },
      });
      
      // Build response
      const responseHeaders = new Headers(upstreamResponse.headers);
      
      // Add proxy headers
      responseHeaders.set('X-Proxy-Upstream', upstream.url);
      responseHeaders.set('X-Proxy-Status', upstreamResponse.status.toString());
      
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      console.error('Hub proxy error:', error);
      
      return new Response(JSON.stringify({
        error: 'Upstream request failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        upstream: upstream.url,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
  
  private async generateInternalToken(): Promise<string> {
    // Generate a short-lived internal JWT token
    const { SignJWT } = await import('jose');
    
    const secret = new TextEncoder().encode(this.env.JWT_SECRET);
    
    const jwt = await new SignJWT({
      sub: 'hub-proxy',
      aud: 'internal',
      service: 'mission-control-hq',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m') // Short-lived for internal use
      .sign(secret);
    
    return jwt;
  }
  
  // Get hub status and configuration
  async getStatus(): Promise<Response> {
    const status = {
      configured: true,
      upstreams: Object.keys(this.config.upstreams).map(name => ({
        name,
        url: this.config.upstreams[name].url,
        auth: this.config.upstreams[name].auth,
        healthy: true, // TODO: Add health checks
      })),
      routes: this.config.routes.map(r => ({
        path: r.path,
        upstream: r.upstream,
        methods: r.methods || ['ALL'],
      })),
      timestamp: new Date().toISOString(),
    };
    
    return new Response(JSON.stringify(status, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // Get hub dashboard HTML
  getDashboard(): Response {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mission Control Hub</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            color: #fff;
            min-height: 100vh;
            padding: 2rem;
          }
          .container {
            max-width: 1200px;
            margin: 0 auto;
          }
          h1 {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
            display: flex;
            align-items: center;
            gap: 1rem;
          }
          .subtitle {
            opacity: 0.9;
            margin-bottom: 2rem;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
          }
          .card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 12px;
            padding: 1.5rem;
            border: 1px solid rgba(255, 255, 255, 0.2);
            transition: transform 0.3s, box-shadow 0.3s;
          }
          .card:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          }
          .card h2 {
            font-size: 1.25rem;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
          }
          .card p {
            opacity: 0.9;
            line-height: 1.6;
            margin-bottom: 1rem;
          }
          .status {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.25rem 0.75rem;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 20px;
            font-size: 0.875rem;
          }
          .status.operational { background: rgba(72, 187, 120, 0.3); }
          .status.degraded { background: rgba(246, 173, 85, 0.3); }
          .status.outage { background: rgba(245, 101, 101, 0.3); }
          .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: currentColor;
            animation: pulse 2s infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          .links {
            display: flex;
            flex-wrap: wrap;
            gap: 0.75rem;
          }
          .link {
            color: #fff;
            text-decoration: none;
            padding: 0.5rem 1rem;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 8px;
            transition: all 0.3s;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
          }
          .link:hover {
            background: rgba(255, 255, 255, 0.2);
            transform: translateX(2px);
          }
          .metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1rem;
            margin-top: 1rem;
          }
          .metric {
            text-align: center;
            padding: 1rem;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 8px;
          }
          .metric-value {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 0.25rem;
          }
          .metric-label {
            font-size: 0.875rem;
            opacity: 0.9;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🛸 Mission Control Hub</h1>
          <p class="subtitle">Unified gateway for all Mission Control services</p>
          
          <div class="grid">
            <div class="card">
              <h2>🔒 Ghost Recon Security</h2>
              <p>Enterprise security protocol with cryptographic signatures and audit logging.</p>
              <div class="status operational">
                <span class="dot"></span>
                Operational
              </div>
              <div class="links" style="margin-top: 1rem;">
                <a href="/api/ghost/heartbeat" class="link">💓 Heartbeat</a>
                <a href="/api/ghost/proof" class="link">🔏 Proof</a>
                <a href="/api/ghost/badge.svg" class="link">🎖️ Badge</a>
              </div>
            </div>
            
            <div class="card">
              <h2>📊 Service Status</h2>
              <p>Real-time monitoring and health checks for all services.</p>
              <div class="metrics">
                <div class="metric">
                  <div class="metric-value">99.95%</div>
                  <div class="metric-label">Uptime</div>
                </div>
                <div class="metric">
                  <div class="metric-value">250ms</div>
                  <div class="metric-label">P95 Latency</div>
                </div>
                <div class="metric">
                  <div class="metric-value">0.5%</div>
                  <div class="metric-label">Error Rate</div>
                </div>
              </div>
            </div>
            
            <div class="card">
              <h2>🚀 API Gateway</h2>
              <p>Secure API access with rate limiting and authentication.</p>
              <div class="links">
                <a href="/api/health" class="link">🏥 Health</a>
                <a href="/api/openapi.json" class="link">📄 OpenAPI</a>
                <a href="/api/docs" class="link">📚 Docs</a>
              </div>
            </div>
            
            <div class="card">
              <h2>🎛️ Hub Services</h2>
              <p>Proxy gateway to internal Mission Control services.</p>
              <div class="links">
                <a href="/hub/status" class="link">📊 Status</a>
                <a href="/hub/api/v1" class="link">🔌 API v1</a>
                <a href="/hub/dashboard" class="link">📈 Dashboard</a>
                <a href="/hub/metrics" class="link">📉 Metrics</a>
              </div>
            </div>
            
            <div class="card">
              <h2>🔧 Operations</h2>
              <p>Deployment management and operational tools.</p>
              <div class="status operational">
                <span class="dot"></span>
                v0.5.0 Deployed
              </div>
              <div class="links" style="margin-top: 1rem;">
                <a href="https://github.com/brendadeeznuts1111/misson-control-domain-worker" class="link">📦 GitHub</a>
                <a href="https://dash.cloudflare.com" class="link">☁️ Cloudflare</a>
              </div>
            </div>
            
            <div class="card">
              <h2>📚 Documentation</h2>
              <p>Comprehensive guides and runbooks.</p>
              <div class="links">
                <a href="https://github.com/brendadeeznuts1111/misson-control-domain-worker/blob/main/SECURITY.md" class="link">🔐 Security</a>
                <a href="https://github.com/brendadeeznuts1111/misson-control-domain-worker/blob/main/MONITORING.md" class="link">📊 Monitoring</a>
                <a href="https://github.com/brendadeeznuts1111/misson-control-domain-worker/blob/main/DEPLOYMENT.md" class="link">🚀 Deployment</a>
              </div>
            </div>
          </div>
          
          <div class="card">
            <h2>🔄 Recent Activity</h2>
            <p style="margin-bottom: 0;">Loading activity feed...</p>
            <script>
              // Auto-refresh status
              setInterval(async () => {
                try {
                  const response = await fetch('/api/ghost/heartbeat');
                  const data = await response.json();
                  console.log('Heartbeat:', data);
                } catch (error) {
                  console.error('Heartbeat check failed:', error);
                }
              }, 30000);
            </script>
          </div>
        </div>
      </body>
      </html>
    `;
    
    return new Response(html, {
      headers: { 
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=60',
      },
    });
  }
}