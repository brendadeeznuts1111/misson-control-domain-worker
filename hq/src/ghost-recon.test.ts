import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GhostRecon, GhostReconConfigSchema } from './ghost-recon';

// Mock KV namespace
class MockKVNamespace {
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
    return { keys: Array.from(this.store.keys()).map(name => ({ name })) };
  }
  
  async getWithMetadata(): Promise<any> {
    throw new Error('Not implemented');
  }
  
  clear() {
    this.store.clear();
  }
}

describe('GhostRecon', () => {
  let mockAuditLog: MockKVNamespace;
  let mockDeadManFuse: MockKVNamespace;
  let env: any;
  let ghostRecon: GhostRecon;

  beforeEach(() => {
    mockAuditLog = new MockKVNamespace();
    mockDeadManFuse = new MockKVNamespace();
    env = {
      GHOST_SIGNATURE: 'test-signature',
      GHOST_PUBLIC_KEY: 'test-public-key',
      DEPLOYMENT_ID: 'test-deployment',
      REGION_ID: 'us-west-2',
      CANARY_PERCENT: '10',
      AUDIT_LOG: mockAuditLog,
      DEAD_MAN_FUSE: mockDeadManFuse,
    };
    ghostRecon = new GhostRecon(env);
  });

  describe('generateHeartbeatSignature', () => {
    it('should generate consistent signatures for same data', async () => {
      const heartbeat = {
        timestamp: Date.now(),
        service: 'test-service',
        region: 'us-east-1',
        deployment: 'v1.0.0',
        status: 'healthy' as const,
      };
      
      const sig1 = await ghostRecon.generateHeartbeatSignature(heartbeat);
      const sig2 = await ghostRecon.generateHeartbeatSignature(heartbeat);
      
      expect(sig1).toBe(sig2);
      expect(sig1).toContain(':');
    });

    it('should generate different signatures for different data', async () => {
      const heartbeat1 = {
        timestamp: Date.now(),
        service: 'test-service',
        region: 'us-east-1',
        deployment: 'v1.0.0',
        status: 'healthy' as const,
      };
      
      const heartbeat2 = {
        ...heartbeat1,
        status: 'degraded' as const,
      };
      
      const sig1 = await ghostRecon.generateHeartbeatSignature(heartbeat1);
      const sig2 = await ghostRecon.generateHeartbeatSignature(heartbeat2);
      
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('verifyHeartbeatSignature', () => {
    it('should verify valid signatures', async () => {
      const heartbeat = {
        timestamp: Date.now(),
        service: 'test-service',
        region: 'us-east-1',
        deployment: 'v1.0.0',
        status: 'healthy' as const,
      };
      
      const signature = await ghostRecon.generateHeartbeatSignature(heartbeat);
      const isValid = await ghostRecon.verifyHeartbeatSignature(heartbeat, signature);
      
      expect(isValid).toBe(true);
    });

    it('should reject invalid signatures', async () => {
      const heartbeat = {
        timestamp: Date.now(),
        service: 'test-service',
        region: 'us-east-1',
        deployment: 'v1.0.0',
        status: 'healthy' as const,
      };
      
      const isValid = await ghostRecon.verifyHeartbeatSignature(heartbeat, 'invalid-signature');
      
      expect(isValid).toBe(false);
    });
  });

  describe('calculateContentHash', () => {
    it('should calculate SHA256 hash of string content', async () => {
      const content = 'Hello, World!';
      const hash = await ghostRecon.calculateContentHash(content);
      
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(hash).toBe('dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f');
    });

    it('should calculate consistent hashes', async () => {
      const content = 'Test content';
      const hash1 = await ghostRecon.calculateContentHash(content);
      const hash2 = await ghostRecon.calculateContentHash(content);
      
      expect(hash1).toBe(hash2);
    });
  });

  describe('applyGhostHeaders', () => {
    it('should add deployment metadata headers', async () => {
      const originalResponse = new Response('OK');
      const enhanced = await ghostRecon.applyGhostHeaders(originalResponse);
      
      expect(enhanced.headers.get('X-Deployment-ID')).toBe('test-deployment');
      expect(enhanced.headers.get('X-Region-ID')).toBe('us-west-2');
    });

    it('should add content hash headers when content provided', async () => {
      const originalResponse = new Response('Test content');
      const enhanced = await ghostRecon.applyGhostHeaders(originalResponse, 'Test content');
      
      expect(enhanced.headers.get('X-Content-SHA256')).toMatch(/^[a-f0-9]{64}$/);
      expect(enhanced.headers.get('Last-Modified-SHA')).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should add canary headers when configured', async () => {
      const canaryGhost = new GhostRecon(env, { canaryPercent: 25 });
      const originalResponse = new Response('OK');
      const enhanced = await canaryGhost.applyGhostHeaders(originalResponse);
      
      expect(enhanced.headers.get('X-Canary-Deployment')).toBe('true');
      expect(enhanced.headers.get('X-Canary-Percent')).toBe('25');
    });
  });

  describe('shouldServeCanary', () => {
    it('should return false when canary is 0%', () => {
      const ghost = new GhostRecon(env, { canaryPercent: 0 });
      const request = new Request('https://example.com');
      
      expect(ghost.shouldServeCanary(request)).toBe(false);
    });

    it('should return true when canary is 100%', () => {
      const ghost = new GhostRecon(env, { canaryPercent: 100 });
      const request = new Request('https://example.com');
      
      expect(ghost.shouldServeCanary(request)).toBe(true);
    });

    it('should consistently route same IP', () => {
      const ghost = new GhostRecon(env, { canaryPercent: 50 });
      const request = new Request('https://example.com', {
        headers: { 'CF-Connecting-IP': '192.168.1.100' }
      });
      
      const results = new Set();
      for (let i = 0; i < 10; i++) {
        results.add(ghost.shouldServeCanary(request));
      }
      
      expect(results.size).toBe(1); // Should always return same result
    });
  });

  describe('updateDeadManFuse', () => {
    it('should update fuse with active status', async () => {
      await ghostRecon.updateDeadManFuse('active');
      
      const key = `fuse:${env.DEPLOYMENT_ID}`;
      const data = await mockDeadManFuse.get(key);
      expect(data).toBeTruthy();
      
      const fuse = JSON.parse(data!);
      expect(fuse.status).toBe('active');
      expect(fuse.region).toBe('us-west-2');
      expect(fuse.ttl).toBe(300);
    });
  });

  describe('checkDeadManFuse', () => {
    it('should return true for active fuse', async () => {
      await ghostRecon.updateDeadManFuse('active');
      const isActive = await ghostRecon.checkDeadManFuse();
      
      expect(isActive).toBe(true);
    });

    it('should return false for missing fuse', async () => {
      const isActive = await ghostRecon.checkDeadManFuse();
      
      expect(isActive).toBe(false);
    });

    it('should return false for inactive fuse', async () => {
      await ghostRecon.updateDeadManFuse('inactive');
      const isActive = await ghostRecon.checkDeadManFuse();
      
      expect(isActive).toBe(false);
    });
  });

  describe('generateStatusBadge', () => {
    it('should generate SVG badge for operational status', () => {
      const svg = ghostRecon.generateStatusBadge('operational');
      
      expect(svg).toContain('<svg');
      expect(svg).toContain('#4ade80'); // Green color
      expect(svg).toContain('Mission Control');
      expect(svg).toContain('Operational');
    });

    it('should generate SVG badge for degraded status', () => {
      const svg = ghostRecon.generateStatusBadge('degraded');
      
      expect(svg).toContain('#fbbf24'); // Yellow color
      expect(svg).toContain('Degraded');
    });

    it('should generate SVG badge for outage status', () => {
      const svg = ghostRecon.generateStatusBadge('outage');
      
      expect(svg).toContain('#ef4444'); // Red color
      expect(svg).toContain('Outage');
    });
  });

  describe('generateProofPage', () => {
    it('should generate HTML proof page', () => {
      const heartbeat = {
        timestamp: Date.now(),
        service: 'test-service',
        region: 'us-east-1',
        deployment: 'v1.0.0',
        status: 'healthy' as const,
      };
      
      const html = ghostRecon.generateProofPage(heartbeat, 'test-signature');
      
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('GHOST RECON PROOF');
      expect(html).toContain(heartbeat.deployment);
      expect(html).toContain(heartbeat.region);
      expect(html).toContain('test-signature');
      expect(html).toContain('class="status healthy"');
    });
  });

  describe('createRollbackCheckpoint', () => {
    it('should create checkpoint with unique ID', async () => {
      const id1 = await ghostRecon.createRollbackCheckpoint();
      const id2 = await ghostRecon.createRollbackCheckpoint();
      
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });

    it('should store checkpoint in audit log', async () => {
      const checkpointId = await ghostRecon.createRollbackCheckpoint();
      
      const key = `checkpoint:${checkpointId}`;
      const data = await mockAuditLog.get(key);
      expect(data).toBeTruthy();
      
      const checkpoint = JSON.parse(data!);
      expect(checkpoint.id).toBe(checkpointId);
      expect(checkpoint.deployment).toBe('test-deployment');
      expect(checkpoint.region).toBe('us-west-2');
    });
  });

  describe('logAudit', () => {
    it('should log audit entries to KV', async () => {
      await ghostRecon.logAudit({
        action: 'test-action',
        actor: 'test-user',
        resource: '/test/resource',
        result: 'success',
        metadata: { test: true },
      });
      
      const keys = await mockAuditLog.list();
      expect(keys.keys.length).toBe(1);
      expect(keys.keys[0].name).toMatch(/^audit:/);
    });
  });
});