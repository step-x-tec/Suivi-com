#!/usr/bin/env python3
"""Assemble des fonctions serveur AUTONOMES (un seul fichier) à partir des modules partagés testés.

Pourquoi : l'éditeur du tableau de bord Supabase ne déploie qu'UN fichier ; un import vers « ../_shared/... » y échoue avec
« Module not found ». Les modules de supabase/functions/_shared restent la source de vérité (ils sont testés) ; ce script les recopie
mot pour mot dans chaque fonction. Un test (tests/fonctions-autonomes.test.ts) vérifie qu'aucune copie n'a dérivé.
Usage : python3 scripts/assembler_fonctions.py
"""
import os, re

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'supabase', 'functions')
# fonction -> modules partagés à inclure, dans l'ordre (une dépendance avant ce qui l'utilise)
FONCTIONS = {
    'api-v1': ['cors', 'api'],
    'envoyer-notifications': ['email'],
    'paiement-creer': ['cors', 'auth', 'decision', 'fedapay'],
    'paiement-verifier': ['cors', 'auth', 'decision', 'fedapay'],
    'paiement-webhook': ['decision', 'fedapay'],
}
IMPORT_SUPABASE = "import { createClient } from 'npm:@supabase/supabase-js@2';"
IMPORT_COMBINE = "import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';"

def sans_imports(texte: str) -> str:
    """Le texte d'un module sans ses lignes « import … » (toutes sur une seule ligne), tel quel pour le reste."""
    return '\n'.join(l for l in texte.split('\n') if not l.startswith('import ')).strip()

def lire(chemin): return open(chemin, encoding='utf-8').read()

for nom, modules in FONCTIONS.items():
    chemin = os.path.join(RACINE, nom, 'index.ts')
    source = lire(chemin)
    # Si le fichier est déjà assemblé, on repart de sa partie propre (après le marqueur)
    marqueur = '// ===== CODE DE LA FONCTION ====='
    if marqueur in source:
        source = source.split(marqueur, 1)[1].lstrip('\n')
    en_tete, corps = [], []
    lignes = source.split('\n')
    i = 0
    while i < len(lignes) and (lignes[i].startswith('//') or lignes[i].strip() == ''):
        en_tete.append(lignes[i]); i += 1          # commentaires d'introduction de la fonction
    corps = lignes[i:]
    corps = [l for l in corps if not re.match(r"import .* from '\.\./_shared/", l) and l != IMPORT_SUPABASE]
    parties = [
        '\n'.join(en_tete).rstrip(),
        '// FICHIER AUTONOME, généré par scripts/assembler_fonctions.py : ne le modifiez pas ici, modifiez supabase/functions/_shared/ puis relancez le script.',
        IMPORT_COMBINE, ''
    ]
    for m in modules:
        parties.append(f'// ===== module partagé : {m}.ts =====')
        parties.append(sans_imports(lire(os.path.join(RACINE, '_shared', f'{m}.ts'))))
        parties.append('')
    parties.append(marqueur)
    parties.append('\n'.join(corps).strip())
    open(chemin, 'w', encoding='utf-8').write('\n'.join(parties).rstrip() + '\n')
    print(f'{nom:24s} <- {", ".join(modules)}')
