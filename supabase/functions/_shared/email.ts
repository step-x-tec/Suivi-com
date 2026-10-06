// Composition des e-mails de notification (pure, testée). Tout texte venant de la base est échappé :
// un nom de commercial contenant du HTML ne doit jamais s'exécuter dans la boîte mail de quelqu'un.
export interface NotifEmail { id: string; type: string; message: string; lien: string | null; created_at: string }

const ICONES: Record<string, string> = { attribution: '📦', cloture: '◉', reglement: '💰', stock: '⚠️', retard: '⏰', paiement: '💳' };

export const echapper = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const tronquer = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

export function composerEmail(o: { nom: string | null; mode: string; notifications: NotifEmail[]; site: string }) {
  const site = o.site.replace(/\/+$/, '');
  const n = o.notifications.length;
  const subject = n === 1
    ? `CommPro : ${tronquer(o.notifications[0].message, 70)}`
    : o.mode === 'quotidien' ? `CommPro : résumé du jour (${n} notifications)` : `CommPro : ${n} nouvelles notifications`;

  // seuls les liens internes (/recu/…, /credit/…) sont repris : jamais d'adresse externe ni de « javascript: »
  const lien = (l: string | null) => (l && l.startsWith('/') && !l.startsWith('//') ? site + l : null);
  const salut = o.nom ? `Bonjour ${o.nom},` : 'Bonjour,';

  const items = o.notifications.map((x) => {
    const href = lien(x.lien);
    return `<li style="margin:0 0 10px">${ICONES[x.type] ?? '🔔'} ${echapper(x.message)}` +
      (href ? ` — <a href="${echapper(href)}" style="color:#b8740a">Ouvrir</a>` : '') + `</li>`;
  }).join('');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#14161c;max-width:560px">` +
    `<p>${echapper(salut)}</p><ul style="padding-left:18px">${items}</ul>` +
    `<p style="color:#5d6578;font-size:13px">Vous recevez cet e-mail car les notifications par e-mail sont activées sur CommPro. ` +
    `<a href="${echapper(site)}/notifications" style="color:#5d6578">Modifier ce réglage</a>.</p></div>`;

  const text = `${salut}\n\n` +
    o.notifications.map((x) => `- ${x.message}${lien(x.lien) ? ` (${lien(x.lien)})` : ''}`).join('\n') +
    `\n\nModifier ce réglage : ${site}/notifications\n`;
  return { subject, html, text };
}
