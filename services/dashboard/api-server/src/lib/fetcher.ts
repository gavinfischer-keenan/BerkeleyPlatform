import { getConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Shared Fetch Wrapper
// ---------------------------------------------------------------------------
// Replaces the duplicated fetch() + AbortSignal.timeout(8000) + User-Agent
// pattern that existed across every route file.
//
// Usage:
//   import { apiFetch } from '../lib/fetcher.js';
//   const res = await apiFetch('https://api.weather.gov/...');
//   const json = await res.json();
// ---------------------------------------------------------------------------

/**
 * Fetch wrapper that automatically applies:
 * - Timeout from config.server.fetchTimeoutMs
 * - User-Agent from config.server.userAgent
 * - Any additional headers/options passed in
 *
 * @param url - The URL to fetch
 * @param opts - Optional fetch RequestInit overrides
 * @returns The fetch Response
 * @throws If the request times out or the network fails
 */
export async function apiFetch(url: string, opts?: RequestInit): Promise<Response> {
  const cfg = getConfig();
  return fetch(url, {
    signal: AbortSignal.timeout(cfg.server.fetchTimeoutMs),
    headers: {
      'User-Agent': cfg.server.userAgent,
      ...(opts?.headers as Record<string, string> | undefined),
    },
    ...opts,
  });
}

/**
 * Convenience: fetch + parse JSON in one call. Throws on non-OK responses.
 */
export async function apiFetchJson<T = unknown>(url: string, opts?: RequestInit): Promise<T> {
  const res = await apiFetch(url, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
  return res.json() as Promise<T>;
}
