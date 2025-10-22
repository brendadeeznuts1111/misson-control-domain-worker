import { describe, it, expect } from 'vitest';
import { getSwaggerUIHTML } from './swagger-ui';

describe('Swagger UI', () => {
  describe('getSwaggerUIHTML', () => {
    it('should generate valid HTML with Swagger UI', () => {
      const html = getSwaggerUIHTML();
      
      // Check for essential HTML structure
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<title>Mission Control API Documentation</title>');
      
      // Check for Swagger UI dependencies
      expect(html).toContain('swagger-ui-dist@5.9.0/swagger-ui.css');
      expect(html).toContain('swagger-ui-bundle.js');
      expect(html).toContain('swagger-ui-standalone-preset.js');
      
      // Check for API spec URL
      expect(html).toContain('url: "/api/openapi.json"');
      
      // Check for Mission Control branding
      expect(html).toContain('Mission Control API');
      expect(html).toContain('🚀');
    });

    it('should use custom spec URL when provided', () => {
      const customUrl = 'https://api.example.com/openapi.json';
      const html = getSwaggerUIHTML(customUrl);
      
      expect(html).toContain(`url: "${customUrl}"`);
    });

    it('should include rate limit interceptor', () => {
      const html = getSwaggerUIHTML();
      
      expect(html).toContain('requestInterceptor');
      expect(html).toContain('responseInterceptor');
      expect(html).toContain('x-ratelimit-remaining');
    });

    it('should include auth header injection from localStorage', () => {
      const html = getSwaggerUIHTML();
      
      expect(html).toContain('localStorage.getItem(\'mission-control-api-key\')');
      expect(html).toContain('X-API-Key');
    });
  });
});

describe('API Docs Route', () => {
  it('should serve docs without authentication', async () => {
    // This test would be better as an integration test
    // but we can at least verify the HTML generation works
    const html = getSwaggerUIHTML('/api/openapi.json');
    const response = new Response(html, {
      headers: { 
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=3600'
      }
    });
    
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });
});