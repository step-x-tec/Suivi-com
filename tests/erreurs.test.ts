import { describe, expect, it } from 'vitest';
import { messageErreurClient } from '../src/lib/erreurs';

describe('message des erreurs inattendues', () => {
  it('ajoute le nom et le texte de l\'exception', () => {
    expect(messageErreurClient(new TypeError('Cannot read properties of null'), 500, 'Internal Error'))
      .toBe('Erreur inattendue (TypeError : Cannot read properties of null)');
  });
  it('texte simple, cause inconnue, espaces nettoyés et longueur bornée', () => {
    expect(messageErreurClient('boom', 500, 'x')).toBe('Erreur inattendue (boom)');
    expect(messageErreurClient({ a: 1 }, 500, 'x')).toBe('Erreur inattendue (cause inconnue)');
    expect(messageErreurClient(new Error('a\n   b'), 500, 'x')).toBe('Erreur inattendue (Error : a b)');
    expect(messageErreurClient(new Error('z'.repeat(1000)), 500, 'x').length).toBeLessThan(260);
  });
  it('une page introuvable garde son message d\'origine', () => {
    expect(messageErreurClient(new Error('x'), 404, 'Not Found')).toBe('Not Found');
  });
});
