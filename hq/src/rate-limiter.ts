import { z } from 'zod';

export const RateLimitConfigSchema = z.object({
  windowMs: z.number().default(60000), // 1 minute
  maxRequests: z.number().default(100),
  maxBurst: z.number().default(10), // max requests per second
  keyPrefix: z.string().default('rl'),
});

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

export interface RateLimitEnv {
  RATE_LIMITS: KVNamespace;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export class RateLimiter {
  constructor(
    private env: RateLimitEnv,
    config?: Partial<RateLimitConfig>
  ) {
    this.config = RateLimitConfigSchema.parse(config || {});
  }
  
  private config: RateLimitConfig;

  /**
   * Check if a request is allowed based on rate limits
   * Uses sliding window algorithm for smooth rate limiting
   */
  async checkLimit(identifier: string, endpoint: string = 'global'): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const key = `${this.config.keyPrefix}:${identifier}:${endpoint}`;
    
    // Get current window data
    const data = await this.getWindowData(key);
    
    // Clean old entries outside current window
    const validRequests = data.requests.filter(timestamp => timestamp > windowStart);
    
    // Check burst protection (requests in last second)
    const oneSecondAgo = now - 1000;
    const recentRequests = validRequests.filter(timestamp => timestamp > oneSecondAgo);
    
    if (recentRequests.length >= this.config.maxBurst) {
      return {
        allowed: false,
        limit: this.config.maxRequests,
        remaining: 0,
        resetAt: Math.min(...validRequests) + this.config.windowMs,
        retryAfter: 1,
      };
    }
    
    // Check window limit
    if (validRequests.length >= this.config.maxRequests) {
      const oldestRequest = Math.min(...validRequests);
      const resetAt = oldestRequest + this.config.windowMs;
      
      return {
        allowed: false,
        limit: this.config.maxRequests,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil((resetAt - now) / 1000),
      };
    }
    
    // Request is allowed - add to window
    validRequests.push(now);
    await this.saveWindowData(key, { requests: validRequests });
    
    return {
      allowed: true,
      limit: this.config.maxRequests,
      remaining: this.config.maxRequests - validRequests.length,
      resetAt: now + this.config.windowMs,
    };
  }

  /**
   * Get client identifier from request (IP or API key)
   */
  static getIdentifier(request: Request, apiKey?: string): string {
    if (apiKey) {
      // Use hashed API key for privacy
      return `key:${hashString(apiKey)}`;
    }
    
    // Fall back to IP address
    const ip = request.headers.get('CF-Connecting-IP') || 
               request.headers.get('X-Forwarded-For')?.split(',')[0] || 
               'unknown';
    return `ip:${ip}`;
  }

  /**
   * Apply rate limit headers to response
   */
  static applyHeaders(response: Response, result: RateLimitResult): Response {
    const headers = new Headers(response.headers);
    headers.set('X-RateLimit-Limit', result.limit.toString());
    headers.set('X-RateLimit-Remaining', result.remaining.toString());
    headers.set('X-RateLimit-Reset', new Date(result.resetAt).toISOString());
    
    if (!result.allowed && result.retryAfter) {
      headers.set('Retry-After', result.retryAfter.toString());
    }
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  /**
   * Create rate limit error response
   */
  static errorResponse(result: RateLimitResult): Response {
    const response = new Response(
      JSON.stringify({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: result.retryAfter,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    return this.applyHeaders(response, result);
  }

  private async getWindowData(key: string): Promise<{ requests: number[] }> {
    const data = await this.env.RATE_LIMITS.get(key);
    if (!data) {
      return { requests: [] };
    }
    
    try {
      return JSON.parse(data);
    } catch {
      return { requests: [] };
    }
  }

  private async saveWindowData(key: string, data: { requests: number[] }): Promise<void> {
    // Set TTL to window size + buffer
    const ttl = Math.ceil(this.config.windowMs / 1000) + 60;
    await this.env.RATE_LIMITS.put(key, JSON.stringify(data), {
      expirationTtl: ttl,
    });
  }
}

/**
 * Simple string hashing for privacy
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Rate limit middleware factory
 */
export function createRateLimitMiddleware(
  env: RateLimitEnv,
  config?: Partial<RateLimitConfig>
) {
  const limiter = new RateLimiter(env, RateLimitConfigSchema.parse(config || {}));
  
  return async (request: Request, apiKey?: string): Promise<Response | null> => {
    const identifier = RateLimiter.getIdentifier(request, apiKey);
    const endpoint = new URL(request.url).pathname;
    const result = await limiter.checkLimit(identifier, endpoint);
    
    if (!result.allowed) {
      return RateLimiter.errorResponse(result);
    }
    
    // Store result in request context for header application
    (request as any).rateLimitResult = result;
    return null;
  };
}