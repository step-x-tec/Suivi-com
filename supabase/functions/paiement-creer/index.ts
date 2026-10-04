// Démarre un paiement d'abonnement : crée la transaction FedaPay et renvoie le lien de paiement.
// Déploiement : supabase functions deploy paiement-creer
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import { appelantAdmin } from '../_shared/auth.ts';
import { extraire, fedapay } from '../_shared/fedapay.ts';

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
