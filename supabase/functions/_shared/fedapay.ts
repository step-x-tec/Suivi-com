import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { decider } from './decision.ts';

// Secrets requis : FEDAPAY_SECRET_KEY, FEDAPAY_ENV ('sandbox' | 'live'), SITE_URL
const base = () => (Deno.env.get('FEDAPAY_ENV') === 'live' ? 'https://api.fedapay.com' : 'https://sandbox-api.fedapay.com');

export async function fedapay(path: string, init: RequestInit = {}) {
  const r = await fetch(base() + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('FEDAPAY_SECRET_KEY')}`, ...(init.headers ?? {}) }
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`FedaPay ${r.status} : ${texte.slice(0, 300)}`);
  try { return texte ? JSON.parse(texte) : null; } catch { return null; }
}

// L'API enveloppe l'objet sous une clé du type "v1/transaction" : on accepte les formes courantes.
export const extraire = (corps: any) => corps?.['v1/transaction'] ?? corps?.transaction ?? corps;

export interface Paiement { id: string; montant: number; devise: string; statut: string; fournisseur_ref: string | null }

// Source de vérité : on interroge FedaPay, puis on applique la décision de façon idempotente.
export async function reconcilier(admin: SupabaseClient, p: Paiement): Promise<string> {
  if (p.statut === 'approuve') return 'approuve';
  if (!p.fournisseur_ref) return 'en_attente';

  const t = extraire(await fedapay(`/v1/transactions/${p.fournisseur_ref}`));
  const d = decider(t, p);

  switch (d.action) {
    case 'activer': {
      const { error } = await admin.rpc('activer_plan', { p_paiement: p.id });
      if (error) throw new Error(error.message);
      return 'approuve';
    }
    case 'refuser':
      await admin.from('paiements').update({ statut: 'refuse' }).eq('id', p.id).eq('statut', 'en_attente');
      return 'refuse';
    case 'annuler':
      await admin.from('paiements').update({ statut: 'annule' }).eq('id', p.id).eq('statut', 'en_attente');
      return 'annule';
    case 'anomalie':
      await admin.from('paiements').update({ statut: 'anomalie' }).eq('id', p.id);
      console.error('Paiement en anomalie', p.id, d.raison);
      return 'anomalie';
    default:
      return 'en_attente';
  }
}
