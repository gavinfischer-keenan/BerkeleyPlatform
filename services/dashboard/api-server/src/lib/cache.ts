import { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Shared In-Memory Cache Middleware
// ---------------------------------------------------------------------------
// Replaces the copy-pasted cache blocks that existed in 11+ route files.
//
// Usage:
//   import { withCache } from '../lib/cache.js';
//   router.get('/weather', withCache('weather'), async (req, res) => { ... });
//
// The cache key is derived from the route name passed to withCache().
// Cache duration is read from config.server.cacheDurations[key].
// ---------------------------------------------------------------------------

import { getConfig } from '../config.js';

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const caches = new Map<string, CacheEntry>();

/**
 * Express middleware that returns cached data if fresh, otherwise passes
 * through and provides res.cacheStore(data) to store the result.
 *
 * @param key - Cache key name (must match a key in config.server.cacheDurations)
 */
export function withCache(key: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const cfg = getConfig();
    const durationMs = cfg.server.cacheDurations[key];

    if (durationMs == null) {
      // No cache configured for this key — pass through
      next();
      return;
    }

    const cached = caches.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      res.json(cached.data);
      return;
    }

    // Attach a helper method for the route handler to store its result
    (res as any).cacheStore = (data: unknown) => {
      caches.set(key, { data, expiresAt: Date.now() + durationMs });
    };

    next();
  };
}

/**
 * Manually invalidate a cache entry (useful for forced refreshes).
 */
export function invalidateCache(key: string): void {
  caches.delete(key);
}
