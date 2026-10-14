import { createBrowserClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { fetchTolerant } from '$lib/reseau';
import type { LayoutLoad } from './$types';

// Application 100 % navigateur (SPA) : le site est servi comme des fichiers statiques, sans fonction serveur.
// (Avant : un rendu serveur interrogeait Supabase à CHAQUE page ; dès que Supabase répondait lentement, Netlify coupait la
// fonction au bout de 30 s -> « This function has crashed » / « Inactivity Timeout ».)
export const ssr = false;
export const prerender = false;

export const load: LayoutLoad = async ({ fetch, depends }) => {
  depends('supabase:auth');
  const supabase = createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, { global: { fetch: fetchTolerant(fetch) } });
  const { data: { session } } = await supabase.auth.getSession();
  return { supabase, session };
};
