# Rapport Phase 2 — Clôture, report à nouveau, états financiers

Date : 17 octobre 2026. Essais réalisés en base dans des transactions annulées (aucune donnée conservée).

## Critères
| Critère | Statut | Preuve |
|---|---|---|
| Clôture transactionnelle (bénéfice, perte, nul, vide) | Passé | 4 profils clôturés, gestion soldée à 0, AN équilibrés, résultat au 1301/1309 |
| Refus si contrôle bloquant (brouillon) | Passé | « 1 contrôle bloquant en échec » |
| Affectation : somme = résultat | Passé | 230 000 ≠ 300 000 refusé |
| Affectation bénéfice 300 000 | Passé | 1301 D300 000 / 111 C30 000, 112 C20 000, 121 C150 000, 465 C100 000 |
| Affectation perte | Passé | 129 D300 000 / 1309 C300 000 |
| Double affectation refusée | Passé | « déjà été affecté » |
| Réouverture : motif ≥ 20 car. | Passé | motif court refusé |
| Réouverture : AN contre-passé, notification | Passé | 1 contre-passation, solde N+1 nul, 1 notification |
| Reclôture après réouverture | Passé | nouvel AN, 521 = 300 000 |
| Réouverture refusée après affectation AG | Passé | refus explicite |
| Rapprochement Bilan / CR / TFT | Passé | tests etats-financiers.test.ts |

## Anomalies trouvées et corrigées
1. Contrôle « comptes hors plan » : colonne erronée, bloquait toute clôture. Corrigé (accepte aussi les sous-comptes).
2. Double affectation : créait une seconde écriture. Désormais refusée.
3. Réouverture : plantait sur la notification des membres. Corrigé.
4. Réouverture après affectation AG : désormais interdite.

## Reste à faire
- Essais avec un compte lecteur et un compte d'une autre entreprise (Phase 1, en attente de comptes).
