// Vérification à la demande après le retour sur l'application (ne dépend pas de la rapidité du webhook).
// Déploiement : supabase functions deploy paiement-verifier
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import { appelantAdmin } from '../_shared/auth.ts';
import { reconcilier } from '../_shared/fedapay.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const moi = await appelantAdmin(req, admin);
  if ('erreur' in moi) return json({ erreur: moi.erreur }, moi.status);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ erreur: 'Requête invalide' }, 400); }

  const { data: p } = await admin.from('paiements').select('*')
    .eq('reference', String(body.reference ?? '')).eq('tenant_id', moi.tenant_id).maybeSingle();
  if (!p) return json({ erreur: 'Paiement introuvable' }, 404);

  try {
    return json({ statut: await reconcilier(admin, p) });
  } catch (e) {
    console.error(e);
    return json({ erreur: 'Vérification impossible pour le moment' }, 502);
  }
});
