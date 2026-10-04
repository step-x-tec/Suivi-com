// Edge Function : inviter un membre (manager / comptable / commercial) ou retirer son accès.
// Réservée à l'administrateur de l'entreprise. Déploiement : supabase functions deploy inviter-membre
// Les variables SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournies automatiquement par Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 1. Identifier l'appelant (jeton vérifié par Supabase Auth) et exiger le rôle admin
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ erreur: 'Non authentifié' }, 401);

  const { data: moi } = await admin.from('users').select('tenant_id, role').eq('id', user.id).maybeSingle();
  if (!moi || moi.role !== 'admin') return json({ erreur: "Réservé à l'administrateur" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ erreur: 'Requête invalide' }, 400); }

  // 2a. Retirer l'accès d'un membre (supprime son compte, conserve l'historique)
  if (body.action === 'retirer') {
    const cible = String(body.user_id ?? '');
    if (cible === user.id) return json({ erreur: 'Vous ne pouvez pas retirer votre propre accès' }, 400);

    const { data: t } = await admin.from('users').select('id, tenant_id, commercial_id').eq('id', cible).maybeSingle();
    if (!t || t.tenant_id !== moi.tenant_id) return json({ erreur: 'Membre introuvable' }, 404);

    const { error } = await admin.auth.admin.deleteUser(cible);
    if (error) return json({ erreur: error.message }, 500);
    if (t.commercial_id) await admin.from('commerciaux').update({ portal_access: false }).eq('id', t.commercial_id);
    await admin.from('activites').insert({
      tenant_id: moi.tenant_id, user_id: user.id, type: 'sys', action: 'Accès retiré', meta: { user_id: cible }
    });
    return json({ ok: true });
  }

  // 2b. Inviter un membre
  const email = String(body.email ?? '').trim().toLowerCase();
  const nom = String(body.nom ?? '').trim() || null;
  const role = String(body.role ?? '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ erreur: 'Email invalide' }, 400);
  if (!['manager', 'comptable', 'commercial'].includes(role)) return json({ erreur: 'Rôle invalide' }, 400);

  let commercialId: string | null = null;
  if (role === 'commercial') {
    commercialId = String(body.commercial_id ?? '');
    const { data: c } = await admin.from('commerciaux').select('id')
      .eq('id', commercialId).eq('tenant_id', moi.tenant_id).maybeSingle();
    if (!c) return json({ erreur: 'Commercial introuvable' }, 404);
    const { data: deja } = await admin.from('users').select('id').eq('commercial_id', commercialId).maybeSingle();
    if (deja) return json({ erreur: 'Ce commercial a déjà un accès' }, 409);
  }

  const { data: inv, error: errInv } = await admin.auth.admin.inviteUserByEmail(email, { data: { nom } });
  if (errInv || !inv?.user) {
    const deja = /already|registered|exists/i.test(errInv?.message ?? '');
    return json({ erreur: deja ? 'Cet email a déjà un compte' : (errInv?.message ?? 'Invitation impossible') }, deja ? 409 : 400);
  }

  const { error: errUser } = await admin.from('users').insert({
    id: inv.user.id, tenant_id: moi.tenant_id, role, nom, email, commercial_id: commercialId
  });
  if (errUser) {
    await admin.auth.admin.deleteUser(inv.user.id); // annule l'invitation : pas de compte orphelin
    return json({ erreur: errUser.message }, errUser.message.startsWith('Limite du plan') ? 403 : 500);
  }
  if (commercialId) await admin.from('commerciaux').update({ portal_access: true }).eq('id', commercialId);
  await admin.from('activites').insert({
    tenant_id: moi.tenant_id, user_id: user.id, type: 'sys', action: 'Invitation envoyée', meta: { email, role }
  });
  return json({ ok: true });
});
