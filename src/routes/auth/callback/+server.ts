import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Retour des liens d'e-mail envoyés par le modèle PAR DÉFAUT de Supabase (confirmation d'inscription, etc.) :
// l'adresse arrive avec ?code=… qu'on échange contre une session. (Les modèles personnalisés du README utilisent /auth/confirm.)
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';
  const cible = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(303, cible);
  }
  redirect(303, '/login?erreur=lien');
};
