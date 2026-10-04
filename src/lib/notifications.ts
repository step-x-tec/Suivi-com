export const ICONES: Record<string, string> = {
  attribution: '📦', cloture: '◉', reglement: '💰', stock: '⚠️', retard: '⏰', paiement: '💳'
};

export function tempsRelatif(iso: string, maintenant = new Date()): string {
  const d = new Date(iso);
  const s = Math.floor((maintenant.getTime() - d.getTime()) / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j === 1) return 'hier';
  if (j < 7) return `il y a ${j} j`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
