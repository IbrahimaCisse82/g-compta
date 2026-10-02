# Rapport Phase 1 — Socle d'intégrité (02/10/2026, lot 1)

## Changements réalisés
- Code : suppression des 6 écritures navigateur vers `balance` (`app-store.tsx`, `BalancePage.tsx`). L'import de balance devient une écriture d'à-nouveaux (journal AN) via le moteur serveur. La suppression physique de lignes du journal est retirée.
- Base : `REVOKE INSERT/UPDATE/DELETE` sur `balance` et `DELETE` sur `journal` pour `authenticated`/`anon`. `fn_valider_ecriture` refuse la validation par l'auteur et toute écriture déséquilibrée. Trigger `journal_sod` : l'auteur d'une soumission ne peut pas la valider.
- Test corrigé : un jeu d'essai de `anomalies.test.ts` (93/93 au vert).

## Critères d'acceptation
| CA | Statut | Preuve |
|---|---|---|
| CA-1.1 Pas d'écriture déséquilibrée insérable | Fait et testé (privilèges) | `ecritures`/`ecriture_lignes` : aucun INSERT/UPDATE pour `authenticated`, création uniquement par `fn_creer_ecriture` (contrôle d'équilibre) |
| CA-1.2 Écriture validée non modifiable/supprimable | Fait et testé (privilèges) | `has_table_privilege` = false sur UPDATE `ecritures`, DELETE `journal` |
| CA-1.3 Aucun code client n'écrit sur `balance` | Fait et testé | recherche code : 0 occurrence ; INSERT/UPDATE `balance` = false |
| CA-1.4 SoD en base | Fait non testé avec jetons réels | fonction + trigger en place |
| CA-1.5 Numérotation sans trou sous concurrence | Partiel | compteur par table existant ; test 1 000 validations non exécuté |
| CA-1.6 Hors période refusé | Fait non testé par jeton | trigger `trg_ecritures_periode` : exercice clôturé, date hors exercice, période verrouillée (table `periodes`, `fn_verrouiller_periode` réservée admin) |
| CA-1.7 Reprise + quarantaine | Non fait | 10 lignes orphelines, 5 pièces déséquilibrées à mettre en `a_corriger` |
| CA-1.8 NUMERIC(18,2) | Partiel | contraintes « 2 décimales, non négatif » sur journal, factures, paie (0 ligne non conforme). Conversion de type des 55 colonnes : nécessite l'autorisation « migrations incompatibles » |

## Restant (Phases 1 à 3)
Table `periodes`, `comptes_systeme`, `audit_log` chaîné par hash, reprise/quarantaine, rôle `reviseur`, FEC à numéro persistant, clôture transactionnelle, puis Phases 2–3 et B/D/E.

## Lot 2 (02/10/2026)
- `periodes` + verrouillage serveur ; `comptes_systeme` (14 rôles par défaut, ⚠ À VALIDER) ; `audit_log` en ajout seul chaîné SHA-256 sur écritures, plan, exercices, rôles, périodes, comptes système, TVA.
- FEC : `EcritureNum` et `ValidDate` repris des écritures serveur, comptes auxiliaires, rapport de contrôle à l'export (2 tests).
- 95 tests au vert, typecheck OK.
- Non fait : export quotidien du dernier hash hors base, reprise/quarantaine des 10 lignes historiques, rôle `reviseur`, test de concurrence 1 000 validations, tests par jetons réels.
