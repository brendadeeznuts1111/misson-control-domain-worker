import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter, RateLimitConfigSchema } from './rate-limiter';

// Mock KV namespace
class MockKVNamespace implements KVNamespace {
  private store = new Map<string, string>();
  
  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }
  
  async put(key: string, value: string, options?: any): Promise<void> {
    this.store.set(key, value);
  }
  
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
  
  async list(): Promise<any> {
    return { keys: Array.from(this.store.keys()) };
  }
  
  getWithMetadata(): any {
    throw new Error('Not implemented');
  }
  
  clear() {
    this.store.clear();
  }
}

describe('RateLimiter', () => {
  let mockKV: MockKVNamespace;
  let env: { RATE_LIMITS: KVNamespace };
  let limiter: RateLimiter;

  beforeEach(() => {
    mockKV = new MockKVNamespace();
    env = { RATE_LIMITS: mockKV };
    limiter = new RateLimiter(env, {
      windowMs: 60000, // 1 minute
      maxRequests: 5,
      maxBurst: 3,
    });
  });

  describe('checkLimit', () => {
    it('should allow requests within limit', async () => {
      const identifier = 'test-user';
      
      for (let i = 0; i < 5; i++) {
        const result = await limiter.checkLimit(identifier);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }
    });

    it('should block requests exceeding limit', async () => {
      const identifier = 'test-user';
      
      // Make max requests
      for (let i = 0; i < 5; i++) {
        await limiter.checkLimit(identifier);
      }
      
      // Next request should be blocked
      const result = await limiter.checkLimit(identifier);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should enforce burst protection', async () => {
      const identifier = 'test-user';
      
      // Make burst limit requests quickly
      for (let i = 0; i < 3; i++) {
        await limiter.checkLimit(identifier);
      }
      
      // Next immediate request should be blocked by burst protection
      const result = await limiter.checkLimit(identifier);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(1);
    });

    it('should track different endpoints separately', async () => {
      const identifier = 'test-user';
      
      // Max out requests on endpoint1
      for (let i = 0; i < 5; i++) {
        await limiter.checkLimit(identifier, 'endpoint1');
      }
      
      // Should still allow requests on endpoint2
      const result = await limiter.checkLimit(identifier, 'endpoint2');
      expect(result.allowed).toBe(true);
    });

    it('should clean old entries outside window', async () => {
      const identifier = 'test-user';
      
      // Use a shorter window for testing
      const shortLimiter = new RateLimiter(env, {
        windowMs: 100, // 100ms window
        maxRequests: 2,
        maxBurst: 10,
      });
      
      // Make 2 requests
      await shortLimiter.checkLimit(identifier);
      await shortLimiter.checkLimit(identifier);
      
      // Should be blocked
      let result = await shortLimiter.checkLimit(identifier);
      expect(result.allowed).toBe(false);
      
      // Wait for window to pass
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should be allowed again
      result = await shortLimiter.checkLimit(identifier);
      expect(result.allowed).toBe(true);
    });
  });

  describe('getIdentifier', () => {
    it('should use API key when provided', () => {
      const request = new Request('https://example.com');
      const identifier = RateLimiter.getIdentifier(request, 'test-api-key');
      
      expect(identifier).toMatch(/^key:/);
      expect(identifier).not.toBe('key:test-api-key'); // Should be hashed
    });

    it('should use CF-Connecting-IP header', () => {
      const request = new Request('https://example.com', {
        headers: {
          'CF-Connecting-IP': '192.168.1.1'
        }
      });
      
      const identifier = RateLimiter.getIdentifier(request);
      expect(identifier).toBe('ip:192.168.1.1');
    });

    it('should use X-Forwarded-For header', () => {
      const request = new Request('https://example.com', {
        headers: {
          'X-Forwarded-For': '10.0.0.1, 192.168.1.1'
        }
      });
      
      const identifier = RateLimiter.getIdentifier(request);
      expect(identifier).toBe('ip:10.0.0.1');
    });

    it('should fallback to unknown', () => {
      const request = new Request('https://example.com');
      const identifier = RateLimiter.getIdentifier(request);
      
      expect(identifier).toBe('ip:unknown');
    });
  });

  describe('applyHeaders', () => {
    it('should add rate limit headers to response', () => {
      const originalResponse = new Response('OK');
      const result = {
        allowed: true,
        limit: 100,
        remaining: 50,
        resetAt: Date.now() + 60000,
      };
      
      const response = RateLimiter.applyHeaders(originalResponse, result);
      
      expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('50');
      expect(response.headers.get('X-RateLimit-Reset')).toBeTruthy();
    });

    it('should add Retry-After header when blocked', () => {
      const originalResponse = new Response('Too Many Requests', { status: 429 });
      const result = {
        allowed: false,
        limit: 100,
        remaining: 0,
        resetAt: Date.now() + 30000,
        retryAfter: 30,
      };
      
      const response = RateLimiter.applyHeaders(originalResponse, result);
      
      expect(response.headers.get('Retry-After')).toBe('30');
    });
  });

  describe('errorResponse', () => {
    it('should create 429 response with proper headers', () => {
      const result = {
        allowed: false,
        limit: 100,
        remaining: 0,
        resetAt: Date.now() + 30000,
        retryAfter: 30,
      };
      
      const response = RateLimiter.errorResponse(result);
      
      expect(response.status).toBe(429);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Retry-After')).toBe('30');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    });
  });
});