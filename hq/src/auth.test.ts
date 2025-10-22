import { describe, it, expect } from 'vitest';
import { verifyJWT, generateJWT, verifyAPIKey, authMiddleware, AuthError } from './auth';

describe('Auth Module', () => {
  const testSecret = 'test-secret-key-minimum-32-characters-long';
  const apiKeySecret = 'test-api-key-secret';

  describe('JWT Operations', () => {
    it('should generate and verify a valid JWT', async () => {
      const payload = { sub: 'user123', scope: 'read:api' };
      const token = await generateJWT(payload, testSecret, '1h');
      
      const verified = await verifyJWT(token, testSecret);
      expect(verified.sub).toBe('user123');
      expect(verified.scope).toBe('read:api');
      expect(verified.exp).toBeGreaterThan(verified.iat);
    });

    it('should reject an invalid JWT', async () => {
      const invalidToken = 'invalid.jwt.token';
      
      await expect(verifyJWT(invalidToken, testSecret)).rejects.toThrow(AuthError);
    });

    it('should reject a JWT with wrong secret', async () => {
      const payload = { sub: 'user123' };
      const token = await generateJWT(payload, testSecret, '1h');
      
      await expect(verifyJWT(token, 'wrong-secret-key')).rejects.toThrow(AuthError);
    });

    it('should reject an expired JWT', async () => {
      const payload = { sub: 'user123' };
      const token = await generateJWT(payload, testSecret, '1s');
      
      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await expect(verifyJWT(token, testSecret)).rejects.toThrow(AuthError);
    });
  });

  describe('API Key Operations', () => {
    it('should verify a valid API key', () => {
      expect(verifyAPIKey(apiKeySecret, apiKeySecret)).toBe(true);
    });

    it('should reject an invalid API key', () => {
      expect(verifyAPIKey('wrong-key', apiKeySecret)).toBe(false);
    });
  });

  describe('Auth Middleware', () => {
    const env = {
      JWT_SECRET: testSecret,
      API_KEY_SECRET: apiKeySecret,
    };

    it('should authenticate with valid Bearer token', async () => {
      const payload = { sub: 'user123', scope: 'admin' };
      const token = await generateJWT(payload, testSecret, '1h');
      
      const request = new Request('https://example.com', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await authMiddleware(request, env);
      expect(result?.sub).toBe('user123');
      expect(result?.scope).toBe('admin');
    });

    it('should authenticate with valid API key', async () => {
      const request = new Request('https://example.com', {
        headers: {
          'X-API-Key': apiKeySecret
        }
      });

      const result = await authMiddleware(request, env);
      expect(result?.sub).toBe('api-key-user');
      expect(result?.scope).toBe('api');
    });

    it('should reject invalid Bearer token', async () => {
      const request = new Request('https://example.com', {
        headers: {
          'Authorization': 'Bearer invalid-token'
        }
      });

      await expect(authMiddleware(request, env)).rejects.toThrow(AuthError);
    });

    it('should reject invalid API key', async () => {
      const request = new Request('https://example.com', {
        headers: {
          'X-API-Key': 'wrong-api-key'
        }
      });

      await expect(authMiddleware(request, env)).rejects.toThrow(AuthError);
    });

    it('should reject request without credentials', async () => {
      const request = new Request('https://example.com');

      await expect(authMiddleware(request, env)).rejects.toThrow(AuthError);
    });
  });
});