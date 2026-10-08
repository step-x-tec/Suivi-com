# Audit complet CommPro v2

## Ce qui a été examiné, et ce qui a vraiment été exécuté
Relu en entier : 9 migrations SQL (≈ 1 700 lignes), 7 fonctions serveur, 28 écrans, 17 bibliothèques, la configuration de construction et de sécurité.

| Vérification | Résultat |
|---|---|
| **81 tests automatiques**, exécutés pour de bon (13 fichiers : calcul de clôture, crédit, rapports, import, API, e-mails, hors ligne, Excel…) | 81 / 81 réussis |
| Compilation **TypeScript stricte** des 17 bibliothèques et du code de chaque écran | 0 erreur |
| Analyse statique des migrations : ordre de création, colonnes de chaque INSERT/UPDATE, fonctions appelées, sécurité de ligne sur chaque table, droits d'exécution | 0 problème |
| Fichier Excel relu avec openpyxl et ouvert avec LibreOffice | conforme |
| Recherche de secrets en dur, de failles XSS (`{@html}`, `innerHTML`, `eval`) | aucun |
| Calcul de clôture comparé au code du prototype v1 sur 500 cas aléatoires | identique |

**Limites à connaître** : il n'y a pas de PostgreSQL sur ce poste. **Les migrations n'ont donc jamais été exécutées.** C'est le risque n° 1 :
`supabase/verification.sql` contrôle l'installation après coup (17 contrôles). Je n'ai pas non plus reconstruit l'application ici (votre
déploiement Netlify précédent avait réussi), ni appelé Brevo, Resend ou FedaPay, ni vérifié l'aspect visuel des écrans sur un téléphone.

## Défauts trouvés et corrigés
| Gravité | Constat | Correction |
|---|---|---|
| **Critique** | Après confirmation de l'adresse e-mail, le **premier chargement échouait** : le serveur créait l'entreprise mais ne pouvait pas enregistrer le nouveau jeton ; l'utilisateur restait bloqué sur une erreur | L'application connectée s'exécute dans le navigateur ; chacun peut lire sa propre fiche et son entreprise sans jeton enrichi |
| **Critique** | L'application **dépendait d'un hook du tableau de bord** (Customize Access Token) pour fonctionner : mal réglé ou absent, plus aucune donnée n'était visible (message « Configuration incomplète » observé en essai) | Suppression de la dépendance : `jwt_tenant()`, `jwt_role()` et `jwt_commercial()` lisent la table `users` à partir de l'identifiant vérifié par Supabase. Aucun réglage requis ; un changement de rôle ou un retrait d'accès joue **immédiatement** au lieu d'attendre l'expiration du jeton. Correctif pour base existante : `supabase/correctif_sans_hook.sql` |
| **Critique (configuration)** | Un hook « Send Email » actif remplaçait l'envoi de Supabase : aucun e-mail ne partait, sans erreur visible | Contrôle n° 8-9 de `verification.sql`, étape 2 de `INSTALLATION.md` |
| **Élevé** | Une ligne pouvait référencer un commercial, un article, un groupe ou une clôture **d'une autre entreprise** (les règles de sécurité ne contrôlaient que l'entreprise de la ligne elle-même) | Contrôle d'appartenance par déclencheur sur attributions, commerciaux, règlements et utilisateurs |
| **Élevé** | **Injection de formule** dans les exports CSV : un nom de commercial commençant par `=` ou `@` s'exécutait à l'ouverture dans Excel | Préfixe de neutralisation (nombres non touchés) + test |
| Moyen | Pas de page d'erreur : écran brut de SvelteKit | Page d'erreur en français avec « Réessayer » |
| Moyen | Pas d'en-têtes de sécurité HTTP | Ajoutés dans `netlify.toml` (nosniff, anti-cadre, référent, permissions) |
| Moyen | Règles de sécurité réévaluées pour chaque ligne lue | Fonctions d'identité appelées une seule fois par requête (`(select …)`) |
| Moyen | Index manquants pour le tableau de bord, les rapports et le crédit | 4 index ajoutés |
| Moyen | Import v1 : un règlement lié à la clôture d'un autre commercial aurait fait échouer tout l'import | Lien neutralisé à la conversion + test |
| Faible | Écran Paramètres : identifiant de l'utilisateur lu depuis la session (vide hors ligne) | Utilise l'identifiant du profil |
| Faible | Erreur d'envoi d'e-mail affichée en anglais | Message en français (déjà livré) |
| Test | 2 attentes erronées dans la suite de tests (le code était juste) | Corrigées |

## Sécurité : état
- **Visiteur non connecté** : aucune politique de sécurité ne lui ouvre de table (contrôle n° 17) ; aucune fonction sensible ne lui est appelable (n° 8).
- **Isolation entre entreprises** : chaque table filtre sur l'entreprise de la personne connectée (lue en base) ; les références croisées sont contrôlées par déclencheur.
- **Rôles** : le manager crée et clôture sans supprimer ; le comptable lit ; le commercial ne voit que ses données (portail).
- **Plan** : un administrateur ne peut pas modifier lui-même son plan (contrôle n° 10). Les limites (commerciaux, clôtures, équipe) sont appliquées en base.
- **Clés API** : seule l'empreinte est stockée et elle n'est pas lisible (n° 11) ; 60 requêtes par minute et par clé.
- **E-mails** : le contenu venant de la base est échappé ; seuls des liens internes y figurent.
- **Journal** : les entrées ne sont pas modifiables depuis l'application.

## Risques restants et décisions à prendre
1. **Migrations jamais exécutées** : lancer `installation_complete.sql` (un seul bloc, tout ou rien), puis `verification.sql`, et m'envoyer toute erreur.
2. **Envoi d'e-mails** : Brevo n'a pas encore accepté un seul message ; tant que ce n'est pas réglé, gardez « Confirm email » désactivé en essai, et ne l'activez qu'après un test réussi.
3. **Pas de fichier `package-lock.json`** : chaque construction Netlify installe les dernières versions autorisées, donc non reproductibles. À faire une fois sur un ordinateur : `npm install`, puis ajouter `package-lock.json` au dépôt.
4. **Net négatif** : le prototype plafonne le net à 0 (l'excédent de déductions est perdu) ; la v2 le crédite au commercial. À confirmer.
5. **Fuseau horaire** : toutes les périodes sont calculées en UTC (correct pour le Togo ; à paramétrer pour d'autres pays).
6. **Sauvegardes et suppression de compte** : export JSON manuel seulement ; pas de suppression de compte ni d'export de données personnelles (à prévoir avant une vraie ouverture commerciale). Vérifiez ce que votre offre Supabase sauvegarde automatiquement.
7. **Paiement FedaPay** : écrit mais jamais exécuté (volontairement désactivé).
8. **Mot de passe** : la longueur minimale est aussi à régler côté Supabase (Authentication > Password).
9. **Clôtures hors ligne** : volontairement non prises en charge ; à décider selon l'usage terrain.
