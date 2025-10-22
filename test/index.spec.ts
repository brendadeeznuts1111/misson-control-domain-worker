import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src';

describe('Mission Control Worker', () => {
	describe('Main domain routes', () => {
		it('responds with JSON for main domain root', async () => {
			const request = new Request('http://misson-control.com/');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toContain('application/json');
			const data = await response.json();
			expect(data.site).toBe('Mission Control');
			expect(data.endpoints).toBeDefined();
		});

		it('responds with 404 for unknown routes', async () => {
			const request = new Request('http://misson-control.com/unknown');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(404);
		});
	});

	describe('Hub domain routes', () => {
		it('responds with hub dashboard data', async () => {
			const request = new Request('http://hub.misson-control.com/');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.site).toBe('Mission Control Hub');
			expect(data.features).toBeDefined();
		});

		it('responds with projects list', async () => {
			const request = new Request('http://hub.misson-control.com/projects');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.projects).toBeDefined();
			expect(Array.isArray(data.projects)).toBe(true);
		});
	});

	describe('API domain routes', () => {
		it('returns health check without auth', async () => {
			const request = new Request('http://api.misson-control.com/health');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.status).toBe('healthy');
		});

		it('requires auth for protected endpoints', async () => {
			const request = new Request('http://api.misson-control.com/v1/users');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(401);
			const data = await response.json();
			expect(data.error).toBe('Unauthorized');
		});
	});

	describe('Staging domain routes', () => {
		it('responds with staging environment info', async () => {
			const request = new Request('http://staging.misson-control.com/');
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.site).toBe('Mission Control Staging');
			expect(data.environment).toBe('staging');
		});
	});

	describe('CORS handling', () => {
		it('handles OPTIONS preflight requests', async () => {
			const request = new Request('http://api.misson-control.com/health', {
				method: 'OPTIONS'
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			
			expect(response.status).toBe(200);
			expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		});
	});
});