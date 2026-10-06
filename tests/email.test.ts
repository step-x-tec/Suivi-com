import { describe, expect, it } from 'vitest';
import { composerEmail, echapper } from '../supabase/functions/_shared/email';

const N = (message: string, lien: string | null = '/recu/abc', type = 'cloture') => ({ id: 'i', type, message, lien, created_at: '2026-10-05T08:00:00Z' });

describe('e-mails de notification', () => {
  it('échappe le HTML venant de la base (nom de commercial piégé)', () => {
    const m = composerEmail({ nom: '<b>Kofi</b>', mode: 'immediat', site: 'https://app.test', notifications: [N('Règlement : <script>alert(1)</script> & "x"')] });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
    expect(m.html).toContain('Bonjour &lt;b&gt;Kofi&lt;/b&gt;,');
    expect(echapper(`a'b`)).toBe('a&#39;b');
  });
  it('objet : une notification, plusieurs, résumé du jour', () => {
    const s = 'https://app.test/';
    expect(composerEmail({ nom: null, mode: 'immediat', site: s, notifications: [N('Clôture REC-202610-0001 validée')] }).subject).toBe('CommPro : Clôture REC-202610-0001 validée');
    expect(composerEmail({ nom: null, mode: 'immediat', site: s, notifications: [N('a'), N('b')] }).subject).toBe('CommPro : 2 nouvelles notifications');
    expect(composerEmail({ nom: null, mode: 'quotidien', site: s, notifications: [N('a'), N('b'), N('c')] }).subject).toBe('CommPro : résumé du jour (3 notifications)');
    expect(composerEmail({ nom: null, mode: 'immediat', site: s, notifications: [N('x'.repeat(200))] }).subject.length).toBeLessThanOrEqual(80);
  });
  it('liens : internes seulement, adresse complète, jamais de javascript: ni de lien externe', () => {
    const m = composerEmail({ nom: 'Ama', mode: 'immediat', site: 'https://app.test///',
      notifications: [N('ok', '/recu/1'), N('piège 1', 'javascript:alert(1)'), N('piège 2', '//evil.com/x'), N('piège 3', 'https://evil.com'), N('sans lien', null)] });
    expect(m.html).toContain('href="https://app.test/recu/1"');
    for (const mauvais of ['javascript:', 'evil.com']) expect(m.html).not.toContain(mauvais);
    expect(m.html).toContain('href="https://app.test/notifications"');
    expect(m.text).toContain('- ok (https://app.test/recu/1)');
    expect(m.text).toContain('- sans lien\n');
  });
});
