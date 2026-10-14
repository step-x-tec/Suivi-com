import { describe, expect, it } from 'vitest';
import { fetchTolerant } from '../src/lib/reseau';

// Un « serveur » qui ne répond jamais, mais respecte l'annulation comme le fait fetch
const muet = (): typeof fetch => ((_i: unknown, init?: RequestInit) =>
  new Promise((_ok, ko) => init?.signal?.addEventListener('abort', () => ko(init.signal!.reason)))) as typeof fetch;

describe('fetchTolerant', () => {
  it('réponse normale : inchangée', async () => {
    const f = fetchTolerant((async () => new Response('ok', { status: 200 })) as typeof fetch);
    const r = await f('https://x');
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('ok');
  });
  it('coupure réseau : réponse 503 avec le code HORS_LIGNE', async () => {
    const f = fetchTolerant((async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch);
    const r = await f('https://x');
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe('HORS_LIGNE');
  });
  it('serveur trop lent : réponse 504 avec le code DELAI (au lieu d\'attendre sans fin)', async () => {
    const r = await fetchTolerant(muet(), 40)('https://x');
    expect(r.status).toBe(504);
    const corps = await r.json();
    expect(corps.code).toBe('DELAI');
    expect(corps.message).toContain('trop de temps');
  });
  it('annulation demandée par l\'appelant : l\'exception est relancée telle quelle', async () => {
    const c = new AbortController();
    const p = fetchTolerant(muet(), 5000)('https://x', { signal: c.signal });
    c.abort();
    await expect(p).rejects.toThrow();
  });
});
