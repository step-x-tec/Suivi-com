import { redirect } from '@sveltejs/kit';
import type { EmailOtpType } from '@supabase/supabase-js';
import type { RequestHandler } from './$types';

// Lien des emails (invitation, confirmation, réinitialisation) : valide le jeton puis redirige.
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const next = url.searchParams.get('next') ?? '/';
  const cible = next.startsWith('/') && !next.startsWith('//') ? next : '/'; // pas de redirection externe

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) redirect(303, cible);
  }
  redirect(303, '/login?erreur=lien');
};
