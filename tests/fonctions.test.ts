import { describe, expect, it } from 'vitest';
import { messageFonction } from '../src/lib/fonctions';

describe('messages des fonctions serveur', () => {
  it('une erreur métier de nos fonctions passe telle quelle (même avec un statut 403)', () => {
    expect(messageFonction(403, { erreur: 'Limite du plan atteinte : 1 membre(s) d\'équipe maximum' }, 'x')).toContain('Limite du plan atteinte');
    expect(messageFonction(422, { erreur: 'Stock insuffisant' }, 'x')).toBe('Stock insuffisant');
  });
  it('fonction non installée (404) et accès refusé par la passerelle (401)', () => {
    expect(messageFonction(404, { code: 'NOT_FOUND', message: 'Requested function was not found' }, 'x')).toContain("n'est pas installée");
    expect(messageFonction(401, { message: 'Invalid JWT' }, 'x')).toContain('--no-verify-jwt');
  });
  it('hors ligne, limite de requêtes, erreurs serveur, message inconnu', () => {
    expect(messageFonction(503, { code: 'HORS_LIGNE', message: 'Pas de connexion : cette action nécessite internet.' }, 'x')).toContain('Pas de connexion');
    expect(messageFonction(504, { code: 'DELAI', message: 'Le serveur met trop de temps à répondre.' }, 'x')).toContain('trop de temps');
    expect(messageFonction(429, null, 'x')).toContain('patientez');
    expect(messageFonction(500, null, 'x')).toContain('Erreur du serveur (500)');
    expect(messageFonction(400, { message: 'Corps invalide' }, 'x')).toBe('Corps invalide');
    expect(messageFonction(undefined, null, 'défaut')).toBe('défaut');
  });
});
