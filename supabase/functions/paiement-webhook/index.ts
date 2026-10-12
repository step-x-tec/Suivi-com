// Webhook FedaPay. Déploiement SANS vérification de jeton Supabase (FedaPay n'en envoie pas) :
//   supabase functions deploy paiement-webhook --no-verify-jwt
// Sécurité : on ignore le contenu du message pour décider ; on relit la transaction chez FedaPay
// avec notre clé secrète, puis on compare montant et devise (voir _shared/decision.ts).
// FICHIER AUTONOME, généré par scripts/assembler_fonctions.py : ne le modifiez pas ici, modifiez supabase/functions/_shared/ puis relancez le script.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

// ===== module partagé : decision.ts =====
// Décision pure (testable) : que faire d'une transaction FedaPay par rapport à notre paiement ?
// On ne fait JAMAIS confiance au contenu du webhook : le statut vient de l'API FedaPay (appel
// authentifié par notre clé secrète), et le montant et la devise doivent correspondre.
export type Action = 'activer' | 'refuser' | 'annuler' | 'attendre' | 'anomalie';

export function decider(
  t: any, p: { montant: number | string; devise: string }
): { action: Action; raison?: string } {
  const statut = String(t?.status ?? '').toLowerCase();

  if (statut === 'approved' || statut === 'transferred') {
    const recu = Number(t?.amount);
    const iso = String(t?.currency?.iso ?? t?.currency_iso ?? 'XOF').toUpperCase();
    if (recu !== Number(p.montant)) return { action: 'anomalie', raison: `Montant reçu ${recu} différent du montant attendu ${p.montant}` };
    if (iso !== p.devise.toUpperCase()) return { action: 'anomalie', raison: `Devise reçue ${iso} différente de ${p.devise}` };
    return { action: 'activer' };
  }
  if (statut === 'declined') return { action: 'refuser' };
  if (statut === 'canceled' || statut === 'cancelled' || statut === 'refunded') return { action: 'annuler' };
  return { action: 'attendre' };
}

// ===== module partagé : fedapay.ts =====
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

// ===== CODE DE LA FONCTION =====
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  let evenement: any;
  try { evenement = await req.json(); } catch { return new Response('invalide', { status: 400 }); }

  const id = evenement?.entity?.id ?? evenement?.data?.id ?? evenement?.object_id;
  if (!id) return new Response('ignoré');

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: p } = await admin.from('paiements').select('*').eq('fournisseur_ref', String(id)).maybeSingle();
  if (!p) return new Response('ignoré'); // transaction qui ne vient pas de CommPro

  try {
    await reconcilier(admin, p);
  } catch (e) {
    console.error(e);
    return new Response('erreur', { status: 500 }); // FedaPay réessaiera
  }
  return new Response('ok');
});
