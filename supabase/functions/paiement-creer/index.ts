// Démarre un paiement d'abonnement : crée la transaction FedaPay et renvoie le lien de paiement.
// Déploiement : supabase functions deploy paiement-creer
// FICHIER AUTONOME, généré par scripts/assembler_fonctions.py : ne le modifiez pas ici, modifiez supabase/functions/_shared/ puis relancez le script.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

// ===== module partagé : cors.ts =====
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// ===== module partagé : auth.ts =====
// Identifie l'appelant (jeton vérifié par Supabase Auth) et exige le rôle admin.
export async function appelantAdmin(req: Request, admin: SupabaseClient) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return { erreur: 'Non authentifié', status: 401 as const };

  const { data: moi } = await admin.from('users').select('tenant_id, role, nom, email').eq('id', user.id).maybeSingle();
  if (!moi || moi.role !== 'admin') return { erreur: "Réservé à l'administrateur", status: 403 as const };
  return { user, tenant_id: moi.tenant_id as string, nom: (moi.nom as string | null), email: (moi.email as string | null) ?? user.email ?? '' };
}

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const moi = await appelantAdmin(req, admin);
  if ('erreur' in moi) return json({ erreur: moi.erreur }, moi.status);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ erreur: 'Requête invalide' }, 400); }
  const plan = String(body.plan ?? ''), periode = String(body.periode ?? '');
  if (!['starter', 'pro', 'business'].includes(plan)) return json({ erreur: 'Plan invalide' }, 400);
  if (!['mensuel', 'annuel'].includes(periode)) return json({ erreur: 'Période invalide' }, 400);

  // Le montant vient de la base, jamais du navigateur
  const { data: montant, error: errTarif } = await admin.rpc('tarif_plan', { p_plan: plan, p_periode: periode });
  if (errTarif || !montant) return json({ erreur: 'Tarif introuvable' }, 500);

  const reference = `CP-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  const { data: paiement, error: errIns } = await admin.from('paiements').insert({
    tenant_id: moi.tenant_id, plan, periode, montant, devise: 'XOF', reference, created_by: moi.user.id
  }).select('id').single();
  if (errIns || !paiement) return json({ erreur: errIns?.message ?? 'Création du paiement impossible' }, 500);

  try {
    const [prenom, ...reste] = (moi.nom ?? 'Client CommPro').trim().split(/\s+/);
    const site = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');
    const transaction = extraire(await fedapay('/v1/transactions', {
      method: 'POST',
      body: JSON.stringify({
        description: `CommPro ${plan} (${periode})`,
        amount: montant,
        currency: { iso: 'XOF' },
        callback_url: `${site}/paiement/retour/${reference}`,
        customer: { firstname: prenom, lastname: reste.join(' ') || prenom, email: moi.email },
        custom_metadata: { reference, tenant_id: moi.tenant_id }
      })
    }));
    if (!transaction?.id) throw new Error('Réponse FedaPay inattendue (identifiant de transaction absent)');

    const jeton = await fedapay(`/v1/transactions/${transaction.id}/token`, { method: 'POST' });
    const url = jeton?.url ?? extraire(jeton)?.url;
    if (!url) throw new Error('Réponse FedaPay inattendue (lien de paiement absent)');

    await admin.from('paiements').update({ fournisseur_ref: String(transaction.id) }).eq('id', paiement.id);
    return json({ url, reference });
  } catch (e) {
    await admin.from('paiements').update({ statut: 'annule' }).eq('id', paiement.id);
    console.error(e);
    return json({ erreur: "Le service de paiement est indisponible. Réessayez dans un instant." }, 502);
  }
});
