// Webhook FedaPay. Déploiement SANS vérification de jeton Supabase (FedaPay n'en envoie pas) :
//   supabase functions deploy paiement-webhook --no-verify-jwt
// Sécurité : on ignore le contenu du message pour décider ; on relit la transaction chez FedaPay
// avec notre clé secrète, puis on compare montant et devise (voir _shared/decision.ts).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { reconcilier } from '../_shared/fedapay.ts';

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
