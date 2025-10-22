import { Env } from '../types';

export interface Route {
  method: string;
  pathname: string | RegExp;
  handler: (request: Request, env: Env, ctx: ExecutionContext, params?: Record<string, string>) => Promise<Response>;
}

export class Router {
  private routes: Route[] = [];
  
  get(pathname: string | RegExp, handler: Route['handler']) {
    this.routes.push({ method: 'GET', pathname, handler });
    return this;
  }
  
  post(pathname: string | RegExp, handler: Route['handler']) {
    this.routes.push({ method: 'POST', pathname, handler });
    return this;
  }
  
  put(pathname: string | RegExp, handler: Route['handler']) {
    this.routes.push({ method: 'PUT', pathname, handler });
    return this;
  }
  
  delete(pathname: string | RegExp, handler: Route['handler']) {
    this.routes.push({ method: 'DELETE', pathname, handler });
    return this;
  }
  
  async handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    for (const route of this.routes) {
      if (route.method !== request.method) continue;
      
      let match = false;
      let params: Record<string, string> = {};
      
      if (typeof route.pathname === 'string') {
        match = route.pathname === url.pathname;
      } else {
        const result = route.pathname.exec(url.pathname);
        if (result) {
          match = true;
          params = result.groups || {};
        }
      }
      
      if (match) {
        return route.handler(request, env, ctx, params);
      }
    }
    
    return new Response('Not Found', { status: 404 });
  }
}

export function createRouter(): Router {
  return new Router();
}