# Rapport Phase 0 — Constat factuel (02/10/2026)

Aucune modification fonctionnelle ni de données. Preuves : requêtes SQL en lecture seule sur la base et recherches dans le code.

## (a) Constats vérifiés

| # | Vérification | Résultat | Statut |
|---|---|---|---|
| 0.1 | Journal ↔ table `balance` | 20 comptes en écart, 1 dossier touché (démo « PME 1 ») | **Confirmé** |
| 0.2 | Types monétaires | Aucune colonne `real`/`double`. Mais 55 colonnes `numeric` sans précision (pas `NUMERIC(18,2)`) | **Partiel** (pas de float ; R4 non respectée) |
| 0.3 | RLS | RLS activée sur les 48 tables. `anon` a le droit SELECT sur toutes (filtré par politiques « démo »). `authenticated` garde INSERT/UPDATE/DELETE sur `journal` et `balance` | **Confirmé** (droits trop larges) |
| 0.4 | Contournement API | Politiques `journal` : INSERT/UPDATE via `can_write_entreprise`, DELETE via `can_admin_entreprise` → un lecteur est bloqué par les politiques. Test avec jetons réels non exécuté (pas de comptes de test lecteur/étranger) | **Non vérifiable** (à exécuter en Phase 1) |
| 0.5 | Pièces déséquilibrées | 5 pièces : AN-001 (210 000 / 140 000), AN-002 (0 / 100 000), AC-001 (2 500 000 / 2 950 000), VT-001 (5 950 000 / 5 000 000), BQ-015 (5 950 000 / 0) | **Confirmé** |
| 0.6 | Hors exercice / exercice clôturé | 0 ligne hors période | **Infirmé** |
| 0.7 | Écritures client sur `balance` | `stores/app-store.tsx` l.365, 376, 477, 638 ; `pages/BalancePage.tsx` l.119, 122 | **Confirmé** |
| 0.8 | Signaux de risque | `?? 'admin'` : aucun. `catch {}` vides : aucun. `dangerouslySetInnerHTML` : 1 (composant graphique shadcn, contenu statique). `select('*')` : 57 occurrences, sans pagination | **Partiel** |
| 0.9 | Portail public / Storage | Bucket `ged` privé. Fonction portail : taille max 20 Mo, nom de fichier assaini, listes limitées à 200. Faiblesses : aucune liste blanche de types MIME, aucune limitation de fréquence, accès validé par e-mail seul | **Confirmé** |
| 0.10 | FEC | `EcritureNum` recalculé à l'export (compteur local), pas repris de `ecritures.numero`. `ValidDate` = `created_at` de la ligne, pas date de validation. Pas de comptes auxiliaires | **Confirmé** |

Autres faits : les 10 lignes du `journal` sont toutes orphelines (sans écriture serveur rattachée) ; `ecritures`/`ecriture_lignes` sont bien fermées en écriture (SELECT seul pour `authenticated`).

## (b) Changements réalisés
Aucun (hors création de ce rapport).

## (c) Critère d'acceptation Phase 0
| Critère | Statut |
|---|---|
| Chaque constat classé avec preuve | Fait pour 0.1–0.10. La correspondance nominative F1–F10 / S1–S17 / R1–R12 n'est pas faite : la grille détaillée du rapport d'audit n'est pas dans le projet |
| Aucune donnée modifiée | Passé |

## (d) Priorités pour la Phase 1
1. Supprimer les 6 écritures navigateur vers `balance`, retirer INSERT/UPDATE/DELETE de `authenticated` sur `journal` et `balance`.
2. Reprise des 10 lignes du journal en écritures serveur ; quarantaine (`a_corriger`) des 5 pièces déséquilibrées, sans rééquilibrage automatique.
3. Passer les 55 colonnes de montant en `NUMERIC(18,2)`.
4. Tests API réels (lecteur, utilisateur sans rôle, autre entreprise).
5. FEC : numéro et date de validation persistants.

## Constats complémentaires (hors périmètre, non corrigés)
- Portail public : ajouter liste blanche MIME et limitation de fréquence.
- 57 lectures `select('*')` sans pagination (performance Phase 2/3).
