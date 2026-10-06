// Envoi des notifications par e-mail, appelé toutes les 5 minutes par la tâche planifiée (pg_cron + pg_net).
// Déploiement SANS jeton Supabase (l'appelant est la base elle-même, authentifiée par un secret partagé) :
//   supabase functions deploy envoyer-notifications --no-verify-jwt
// Secrets requis : CRON_SECRET, RESEND_API_KEY, EMAIL_FROM (ex. « CommPro <notifications@votredomaine.com> »), SITE_URL
import { createClient } from 'npm:@supabase/supabase-js@2';
import { composerEmail } from '../_shared/email.ts';

const MAX_PAR_PASSAGE = 50;           // au plus 50 personnes par passage (limites des offres gratuites)
const PAUSE_MS = 600;                 // ~2 envois par seconde maximum

const memeSecret = (a: string, b: string) => {  // comparaison à durée constante
  if (a.length === 0 || a.length !== b.length) return false;
  let ecart = 0;
  for (let i = 0; i < a.length; i++) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ecart === 0;
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  if (!memeSecret(Deno.env.get('CRON_SECRET') ?? '', req.headers.get('x-cron-secret') ?? '')) {
    return new Response('Non autorisé', { status: 401 });
  }
  const cle = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('EMAIL_FROM'), site = Deno.env.get('SITE_URL');
  if (!cle || !from || !site) {
    console.error('Configuration incomplète : RESEND_API_KEY, EMAIL_FROM et SITE_URL sont obligatoires');
    return new Response('Configuration incomplète', { status: 500 });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: lignes, error } = await admin.rpc('emails_a_envoyer');
  if (error) { console.error(error); return new Response('Erreur base de données', { status: 500 }); }

  const aTraiter = (lignes ?? []).slice(0, MAX_PAR_PASSAGE);
  let envoyes = 0, abandonnes = 0;

  for (const l of aTraiter) {
    const mail = composerEmail({ nom: l.nom, mode: l.mode, notifications: l.notifications, site });
    const rep = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [l.email], subject: mail.subject, html: mail.html, text: mail.text })
    });
    const ids = l.notifications.map((x: { id: string }) => x.id);

    if (rep.ok) {
      await admin.rpc('marquer_emails_envoyes', { p_user: l.user_id, p_ids: ids });
      envoyes++;
    } else if (rep.status === 429 || rep.status >= 500) {
      console.error('Service d\'envoi indisponible ou saturé, reprise au prochain passage', rep.status);
      break;
    } else {
      // Refus définitif (adresse invalide, domaine non vérifié…) : on marque pour ne pas réessayer toutes les 5 minutes
      console.error('E-mail refusé', rep.status, (await rep.text()).slice(0, 300));
      await admin.rpc('marquer_emails_envoyes', { p_user: l.user_id, p_ids: ids });
      abandonnes++;
    }
    await pause(PAUSE_MS);
  }
  return new Response(JSON.stringify({ envoyes, abandonnes, en_attente: Math.max(0, (lignes ?? []).length - aTraiter.length) }),
    { headers: { 'Content-Type': 'application/json' } });
});
