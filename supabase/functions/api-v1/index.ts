// API publique CommPro (plans Pro et Business). Authentification : en-tête « Authorization: Bearer cp_… ».
// Déploiement SANS vérification de jeton Supabase (les clés CommPro ne sont pas des JWT) :
//   supabase functions deploy api-v1 --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cors, json } from '../_shared/cors.ts';
import { DATE_ISO, lireLimites, lireRoute, validerCloture } from '../_shared/api.ts';

async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const num = (v: unknown) => Number(v ?? 0);
const jourLocal = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);
  const route = lireRoute(req.method, url.pathname);
  if (route === 'inconnue') return json({ erreur: 'Route inconnue. Voir la documentation (API.md).' }, 404);
  if (route === 'methode') return json({ erreur: 'Méthode non autorisée pour cette route' }, 405);

  const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!/^cp_[0-9a-f]{64}$/.test(jeton)) return json({ erreur: 'Clé API manquante ou mal formée (Authorization: Bearer cp_…)' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: auth, error: errAuth } = await admin.rpc('api_verifier', { p_hash: await sha256Hex(jeton) });
  if (errAuth || !auth?.ok) return json({ erreur: auth?.erreur ?? 'Authentification impossible' }, auth?.code ?? 401);
  const tenant: string = auth.tenant_id;
  const { limit, offset } = lireLimites(url.searchParams);

  try {
    // Toutes les requêtes sont filtrées explicitement par entreprise : le service role contourne la RLS
    if (route === 'commerciaux') {
      let q = admin.from('commerciaux')
        .select('id, code, nom, telephone, email, zone, groupe_id, pct_default, status, created_at', { count: 'exact' })
        .eq('tenant_id', tenant).order('nom').order('id').range(offset, offset + limit - 1);
      const statut = url.searchParams.get('status');
      if (statut === 'actif' || statut === 'inactif') q = q.eq('status', statut);
      const { data, count, error } = await q;
      if (error) throw error;
      return json({ data, pagination: { limit, offset, total: count } });
    }

    if (route === 'attributions') {
      let q = admin.from('attributions')
        .select('id, commercial_id, article_ref, nom, code, type, qty_initial, qty_rest, prix, pct, created_at, updated_at', { count: 'exact' })
        .eq('tenant_id', tenant).order('created_at', { ascending: false }).order('id').range(offset, offset + limit - 1);
      const cid = url.searchParams.get('commercial_id');
      if (cid) q = q.eq('commercial_id', cid);
      const { data, count, error } = await q;
      if (error) throw error;
      return json({ data, pagination: { limit, offset, total: count } });
    }

    if (route === 'credit/soldes') {
      const { data, count, error } = await admin.from('solde_commercial')
        .select('commercial_id, total_clotures, total_remises, total_avances, total_frais, total_retours, total_ajustements, solde, statut', { count: 'exact' })
        .eq('tenant_id', tenant).order('commercial_id').range(offset, offset + limit - 1);
      if (error) throw error;
      return json({ data, pagination: { limit, offset, total: count } });
    }

    if (route === 'rapports/resume') {
      const maintenant = new Date();
      const du = url.searchParams.get('du') ?? jourLocal(new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1)));
      const au = url.searchParams.get('au') ?? jourLocal(maintenant);
      if (!DATE_ISO.test(du) || !DATE_ISO.test(au) || du > au) return json({ erreur: 'Paramètres du et au : dates AAAA-MM-JJ, du ≤ au' }, 400);
      const t = { nb: 0, brut: 0, defauts: 0, commissions: 0, divers: 0, net: 0 };
      for (let de = 0; de < 100_000; de += 1000) {
        const { data, error } = await admin.from('clotures').select('brut, defauts, commissions, divers, net_final')
          .eq('tenant_id', tenant).eq('status', 'validee')
          .gte('created_at', `${du}T00:00:00Z`).lte('created_at', `${au}T23:59:59.999Z`)
          .order('created_at').order('id').range(de, de + 999);
        if (error) throw error;
        for (const c of data ?? []) {
          t.nb++; t.brut += num(c.brut); t.defauts += num(c.defauts); t.commissions += num(c.commissions);
          t.divers += num(c.divers); t.net += num(c.net_final);
        }
        if (!data || data.length < 1000) break;
      }
      return json({ data: { du, au, nb_clotures: t.nb, brut: t.brut, defauts: t.defauts, ventes_valides: t.brut - t.defauts,
        commissions: t.commissions, divers: t.divers, net: t.net } });
    }

    // route === 'clotures' (POST)
    let corps: unknown;
    try { corps = await req.json(); } catch { return json({ erreur: 'Corps JSON invalide' }, 400); }
    const v = validerCloture(corps);
    if (!v.ok) return json({ erreur: v.erreur }, 400);

    const { data: id, error: errCl } = await admin.rpc('creer_cloture_api', {
      p_tenant: tenant, p_commercial_id: v.valeur.commercial_id, p_method: v.valeur.method,
      p_lines: v.valeur.lines, p_divers: v.valeur.divers, p_note: v.valeur.note ?? 'Créée via l\'API'
    });
    if (errCl) return json({ erreur: errCl.message }, errCl.code === '42501' ? 403 : 422); // règles métier : stock, quotas…
    const { data: c } = await admin.from('clotures')
      .select('id, reference, commercial_id, method, brut, defauts, commissions, divers, net_final, devise, created_at').eq('id', id).single();
    return json({ data: c }, 201);
  } catch (e) {
    console.error(e);
    return json({ erreur: 'Erreur interne' }, 500);
  }
});
