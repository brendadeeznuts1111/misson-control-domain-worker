import { Env } from './types';
import { createRouter } from './lib/router';
import { corsMiddleware } from './middleware/cors';
import { authMiddleware } from './middleware/auth';
import { loggingMiddleware } from './middleware/logging';

// Route handlers
import { handleMain } from './routes/main';
import { handleHub } from './routes/hub';
import { handleStaging } from './routes/staging';
import { handleApi } from './routes/api';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Health check endpoint (for all domains)
    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }
    
    // Apply global middleware
    const middlewareChain = [
      loggingMiddleware,
      corsMiddleware,
    ];

    // Determine which domain/route we're on
    const hostname = url.hostname;
    const path = url.pathname;
    
    // Route based on hostname
    let handler;
    let requiresAuth = false;
    
    if (hostname.includes('api.')) {
      handler = handleApi;
      requiresAuth = true; // API routes need auth
    } else if (hostname.includes('hub.')) {
      handler = handleHub;
    } else if (hostname.includes('staging.')) {
      handler = handleStaging;
    } else if (hostname.includes('misson-control.com')) {
      handler = handleMain;
    } else {
      // Workers.dev or unknown domain
      handler = handleMain;
    }
    
    // Add auth middleware if needed
    if (requiresAuth) {
      middlewareChain.push(authMiddleware);
    }
    
    // Process through middleware chain
    let response: Response | null = null;
    for (const middleware of middlewareChain) {
      const result = await middleware(request, env, ctx);
      if (result) {
        response = result;
        break;
      }
    }
    
    // If no middleware returned a response, use the handler
    if (!response) {
      response = await handler(request, env, ctx);
    }
    
    return response;
  },
};