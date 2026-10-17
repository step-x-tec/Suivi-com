#!/usr/bin/env python3
"""Génère toutes les icônes de l'application à partir de VOTRE logo.

Usage :   python3 scripts/generer_icones.py mon-logo.png
          python3 scripts/generer_icones.py mon-logo.png --fond "#ffffff"      (couleur de fond des icônes)
          python3 scripts/generer_icones.py mon-logo.png --sortie /autre/dossier

Le logo peut être de n'importe quelle forme (carré conseillé, 512 × 512 pixels ou plus, fond transparent si possible).
Fichiers écrits dans static/ :
  icon-192.png, icon-512.png        icône de l'application installée (écran d'accueil du téléphone)
  icon-maskable-512.png             version « adaptative » d'Android (le logo reste dans la zone sûre, le système peut l'arrondir)
  apple-touch-icon.png              icône iPhone / iPad (180 × 180, fond plein : iOS n'accepte pas la transparence)
  favicon.png                       petite icône de l'onglet du navigateur (64 × 64)
Nécessite Pillow : pip install pillow
"""
import argparse, os, sys
from PIL import Image, ImageColor

def charger(chemin):
    img = Image.open(chemin).convert('RGBA')
    boite = img.getbbox()            # rogne les marges transparentes pour que le logo occupe bien l'espace
    return img.crop(boite) if boite else img

def composer(logo, taille, fond, part):
    """Pose le logo, redimensionné pour occuper au plus `part` de la largeur et de la hauteur, centré sur un fond plein."""
    toile = Image.new('RGBA', (taille, taille), fond)
    maxi = int(taille * part)
    l, h = logo.size
    echelle = min(maxi / l, maxi / h)
    reduit = logo.resize((max(1, round(l * echelle)), max(1, round(h * echelle))), Image.LANCZOS)
    toile.alpha_composite(reduit, ((taille - reduit.width) // 2, (taille - reduit.height) // 2))
    return toile

def main():
    p = argparse.ArgumentParser(description="Génère les icônes de l'application à partir d'un logo.")
    p.add_argument('logo'); p.add_argument('--fond', default='#0f1115'); p.add_argument('--sortie', default=None)
    a = p.parse_args()
    sortie = a.sortie or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static')
    os.makedirs(sortie, exist_ok=True)
    try: fond = ImageColor.getcolor(a.fond, 'RGBA')
    except ValueError: sys.exit(f"Couleur de fond invalide : {a.fond} (exemple : #0f1115)")
    logo = charger(a.logo)
    if min(logo.size) < 128: print("⚠ Logo très petit : le résultat risque d'être flou (512 × 512 conseillé).")

    cibles = [  # (fichier, taille, part de la surface occupée par le logo)
        ('icon-192.png', 192, 0.80), ('icon-512.png', 512, 0.80),
        ('icon-maskable-512.png', 512, 0.56),   # zone sûre « maskable » : cercle de 80 % ; un carré de 56 % y tient entièrement
        ('apple-touch-icon.png', 180, 0.80), ('favicon.png', 64, 0.90)]
    for nom, taille, part in cibles:
        img = composer(logo, taille, fond, part).convert('RGB')   # fond plein, sans transparence
        img.save(os.path.join(sortie, nom), optimize=True)
        print(f'écrit : {nom} ({taille}×{taille})')
    print("\nTerminé. Remplacez le contenu du dépôt (dossier static/) puis redéployez. Sur un téléphone où l'application est déjà installée,\n"
          "désinstallez-la et réinstallez-la pour voir la nouvelle icône.")

if __name__ == '__main__':
    main()
