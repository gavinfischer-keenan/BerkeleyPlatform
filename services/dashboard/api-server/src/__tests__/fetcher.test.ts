import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, apiFetchJson } from '../lib/fetcher.js';

vi.mock('../config.js', () => ({
  getConfig: () => ({
    server: {
      userAgent: 'test-user-agent',
      fetchTimeoutMs: 5000
    }
  })
}));

describe('fetcher', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('apiFetch adds User-Agent header from config', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response());
    
    await apiFetch('https://example.com');
    
    expect(global.fetch).toHaveBeenCalledWith('https://example.com', expect.objectContaining({
      headers: {
        'User-Agent': 'test-user-agent'
      }
    }));
  });

  it('apiFetch adds timeout from config', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response());
    
    await apiFetch('https://example.com');
    
    expect(global.fetch).toHaveBeenCalledWith('https://example.com', expect.objectContaining({
      signal: expect.any(AbortSignal)
    }));
  });

  it('apiFetchJson parses JSON and throws on non-OK', async () => {
    const mockData = { test: true };
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response(JSON.stringify(mockData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const result = await apiFetchJson('https://example.com');
    expect(result).toEqual(mockData);

    // Test non-OK
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response('Error', {
      status: 404,
      statusText: 'Not Found'
    }));
    
    await expect(apiFetchJson('https://example.com/missing')).rejects.toThrow('404 Not Found from https://example.com/missing');
  });
});
