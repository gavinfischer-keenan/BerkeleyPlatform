import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { withCache, invalidateCache } from '../lib/cache.js';

vi.mock('../config.js', () => ({
  getConfig: () => ({
    server: {
      cacheDurations: {
        'test-key': 5000, // 5 seconds
      }
    }
  })
}));

describe('cache middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {};
    res = {
      json: vi.fn(),
    };
    next = vi.fn();
    invalidateCache('test-key');
    invalidateCache('unknown-key');
  });

  it('passes through on cache miss and caches response', () => {
    const middleware = withCache('test-key');
    middleware(req as Request, res as Response, next);
    
    expect(next).toHaveBeenCalled();
    expect((res as any).cacheStore).toBeDefined();

    // Store data
    (res as any).cacheStore({ data: 'fresh' });
  });

  it('returns cached data within TTL', () => {
    const middleware = withCache('test-key');
    
    // First call to cache it
    middleware(req as Request, res as Response, next);
    (res as any).cacheStore({ data: 'fresh' });

    // Second call should return cache
    const next2 = vi.fn();
    middleware(req as Request, res as Response, next2);
    
    expect(res.json).toHaveBeenCalledWith({ data: 'fresh' });
    expect(next2).not.toHaveBeenCalled();
  });

  it('passes through after TTL expires', () => {
    vi.useFakeTimers();
    const middleware = withCache('test-key');
    
    // First call to cache it
    middleware(req as Request, res as Response, next);
    (res as any).cacheStore({ data: 'fresh' });

    // Fast forward past TTL (5000ms)
    vi.advanceTimersByTime(6000);

    // Second call should pass through
    const next2 = vi.fn();
    middleware(req as Request, res as Response, next2);
    
    expect(next2).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('invalidateCache clears the entry', () => {
    const middleware = withCache('test-key');
    
    // First call to cache it
    middleware(req as Request, res as Response, next);
    (res as any).cacheStore({ data: 'fresh' });

    // Invalidate
    invalidateCache('test-key');

    // Second call should pass through
    const next2 = vi.fn();
    middleware(req as Request, res as Response, next2);
    
    expect(next2).toHaveBeenCalled();
  });

  it('unknown cache keys pass through without caching', () => {
    const middleware = withCache('unknown-key');
    middleware(req as Request, res as Response, next);
    
    expect(next).toHaveBeenCalled();
    expect((res as any).cacheStore).toBeUndefined();
  });
});
