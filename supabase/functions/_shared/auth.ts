import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Identifie l'appelant (jeton vérifié par Supabase Auth) et exige le rôle admin.
export async function appelantAdmin(req: Request, admin: SupabaseClient) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return { erreur: 'Non authentifié', status: 401 as const };

  const { data: moi } = await admin.from('users').select('tenant_id, role, nom, email').eq('id', user.id).maybeSingle();
  if (!moi || moi.role !== 'admin') return { erreur: "Réservé à l'administrateur", status: 403 as const };
  return { user, tenant_id: moi.tenant_id as string, nom: (moi.nom as string | null), email: (moi.email as string | null) ?? user.email ?? '' };
}
