// Messages clairs en français pour les erreurs d'authentification Supabase (la page de connexion affichait
// auparavant « mot de passe incorrect » même quand l'adresse n'était simplement pas confirmée).
export interface ErreurAuth { code?: string | null; message?: string | null }
export interface MessageAuth { texte: string; peutRenvoyer: boolean }

export function messageAuth(e: ErreurAuth): MessageAuth {
  const code = e.code ?? '';
  const msg = (e.message ?? '').toLowerCase();
  const est = (c: string, ...mots: string[]) => code === c || mots.some((m) => msg.includes(m));

  if (est('email_not_confirmed', 'email not confirmed'))
    return { texte: "Votre adresse e-mail n'est pas encore confirmée. Ouvrez le message de confirmation (pensez au dossier spam), ou demandez-en un nouveau.", peutRenvoyer: true };
  if (est('invalid_credentials', 'invalid login credentials'))
    return { texte: 'E-mail ou mot de passe incorrect.', peutRenvoyer: false };
  if (est('over_email_send_rate_limit', 'email rate limit', 'rate limit') || code === 'over_request_rate_limit')
    return { texte: "Trop d'e-mails envoyés en peu de temps. Patientez environ une heure avant de réessayer (limite du service d'envoi).", peutRenvoyer: false };
  if (est('email_address_not_authorized', 'not authorized'))
    return { texte: "L'envoi d'e-mails n'est pas encore configuré pour cette adresse : le service d'envoi de test de Supabase n'écrit qu'aux membres de votre équipe. L'administrateur doit configurer un SMTP (voir le guide).", peutRenvoyer: false };
  if (est('user_already_exists', 'already registered', 'already been registered'))
    return { texte: 'Cette adresse a déjà un compte : connectez-vous, ou utilisez « Mot de passe oublié ».', peutRenvoyer: true };
  if (est('weak_password', 'password should be'))
    return { texte: 'Mot de passe trop faible : 8 caractères minimum, avec des lettres et des chiffres.', peutRenvoyer: false };
  if (est('signup_disabled', 'signups not allowed'))
    return { texte: "Les inscriptions sont désactivées pour ce service.", peutRenvoyer: false };
  return { texte: e.message || 'Une erreur est survenue. Réessayez dans un instant.', peutRenvoyer: false };
}

// Avec la confirmation d'adresse activée, Supabase répond « succès » même quand l'adresse a déjà un compte
// (pour ne pas révéler quelles adresses existent) : il renvoie alors un utilisateur sans aucune identité.
export const adresseDejaInscrite = (user: { identities?: unknown[] | null } | null | undefined) =>
  !!user && Array.isArray(user.identities) && user.identities.length === 0;
