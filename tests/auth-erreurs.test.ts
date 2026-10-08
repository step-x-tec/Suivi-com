import { describe, expect, it } from 'vitest';
import { adresseDejaInscrite, messageAuth } from '../src/lib/auth-erreurs';

describe('messages d\'authentification', () => {
  it('adresse non confirmée : message dédié + possibilité de renvoyer l\'e-mail (par code ou par texte)', () => {
    for (const e of [{ code: 'email_not_confirmed' }, { message: 'Email not confirmed' }]) {
      const m = messageAuth(e);
      expect(m.texte).toContain("pas encore confirmée");
      expect(m.peutRenvoyer).toBe(true);
    }
  });
  it('identifiants faux : message simple, sans proposer de renvoi', () => {
    expect(messageAuth({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toEqual({ texte: 'E-mail ou mot de passe incorrect.', peutRenvoyer: false });
  });
  it('limite d\'envoi et service de test Supabase', () => {
    expect(messageAuth({ code: 'over_email_send_rate_limit' }).texte).toContain('Patientez');
    expect(messageAuth({ message: 'email rate limit exceeded' }).texte).toContain('Patientez');
    expect(messageAuth({ code: 'email_address_not_authorized', message: 'Email address not authorized' }).texte).toContain('SMTP');
  });
  it('échec d\'envoi côté serveur (SMTP / hook) : message en français, sans proposer de renvoi', () => {
    for (const e of [{ message: 'Error sending confirmation email' }, { message: 'Error sending recovery email' }]) {
      const m = messageAuth(e);
      expect(m.texte).toContain("n'a pas pu être envoyé");
      expect(m.peutRenvoyer).toBe(false);
    }
  });
  it('compte existant, mot de passe faible, message inconnu conservé', () => {
    expect(messageAuth({ code: 'user_already_exists' }).texte).toContain('déjà un compte');
    expect(messageAuth({ code: 'weak_password' }).texte).toContain('8 caractères');
    expect(messageAuth({ message: 'Autre souci' }).texte).toBe('Autre souci');
    expect(messageAuth({}).texte).toContain('Réessayez');
  });
  it('détecte une inscription sur une adresse déjà utilisée (identités vides)', () => {
    expect(adresseDejaInscrite({ identities: [] })).toBe(true);
    expect(adresseDejaInscrite({ identities: [{ id: 1 }] })).toBe(false);
    expect(adresseDejaInscrite({})).toBe(false);
    expect(adresseDejaInscrite(null)).toBe(false);
  });
});
