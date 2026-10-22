# Rapport Phase 3 — Conformité fiscale et déclarative

Date : 18 octobre 2026. Phase en cours, non validée globalement.
Source : document utilisateur du 2 octobre 2026, sections 3.1–3.11.

## Lot 1 — Export FEC, CA-3.1

### Constat avant correction
- Confirmé : l’export dépendait de l’ordre des lignes reçu ; le journal est lu sans pagination dans l’état partagé, donc il ne garantit pas un export exhaustif.
- Confirmé : numéro manquant remplacé par un numéro inventé ; validation manquante remplacée par la date de création.
- Confirmé : contrôle sans recherche de trous, de dates hors exercice ou de comptes hors plan ; fichier téléchargé avant présentation du rapport.
- Confirmé : bouton présenté comme « officiel », contraire au document utilisateur.

### Corrections
- Sérialisation déterministe, mêmes octets quelle que soit l’ordre des lignes ; dates ISO sans conversion en heure locale.
- Numéros et dates de validation réels uniquement, sans substitut.
- Contrôle d’équilibre global et par écriture, dates, comptes, montants et séquences ; chaque journal possède sa propre séquence, les lignes d’une même écriture ne comptent qu’une fois.
- Lecture paginée des lignes et du plan du dossier ; métadonnées des écritures chargées par petits groupes.
- Rapport visible avant téléchargement ; téléchargement bloqué en cas d’anomalie ou d’exercice vide.
- Libellé « Export FEC — format 18 colonnes ».
- Plus de 100 000 lignes : refus explicite plutôt qu’un fichier incomplet ; export asynchrone restant à construire.

### Preuves exécutées
| Critère | Statut | Preuve |
|---|---|---|
| CA-3.1 : exports identiques | Passé (moteur) | `fec-export.test.ts` : comparaison exacte des tableaux d’octets, ordre inversé |
| CA-3.1 : trou injecté | Passé (moteur) | numéros 1 et 3 : intervalle manquant VT 2–2 détecté ; export non conforme |
| Numéro/date sans substitut | Passé | champs vides si données persistantes absentes, même avec `created_at` |
| Comptes, dates, équilibre, auxiliaires | Passé | tests concrets dans `fec-export.test.ts` |
| Parcours connecté | Partiel | espace réel ouvert, rapport rendu, téléchargement désactivé ; un seul dossier accessible « Mon Entreprise », exercice sans lignes |
| Téléchargement connecté sur exercice renseigné | Non vérifiable | aucun exercice renseigné accessible dans ce compte ; aucune écriture fictive créée |

Essais : 21 tests FEC/écritures exécutés et réussis après modification ; suite complète finale : 110 tests réussis dans 12 fichiers.
Navigateur : aucun crash ; rapport capturé et inspecté. Compilation automatique : OK après les changements d’export.

## Restant de la Phase 3
- Comptabilité auxiliaire complète et journaux paramétrables ; streaming asynchrone des gros exports.
- CA-3.2 barèmes datés et reproduction de paie historique.
- CA-3.3 : Passé (moteur) — colonne entreprises.systeme_comptable (normal|smt, défaut normal) ; Bilan, CR, TFT, liasse et notes refusés avec message « hors périmètre » ; 3 tests systeme-comptable.test.ts ; 113 tests au vert. Parcours navigateur non rejoué.
- CA-3.4 : Passé (moteur) — table baremes datée (valeurs À VALIDER), passage_fiscal (RLS, audit), fiscal.test.ts 7 tests sur cinq dossiers ; 120 tests au vert. Fiche d’identification DSF (régime, activité, effectif, date de dépôt) et état des amortissements/provisions ajoutés sur la page Résultat fiscal ; parcours navigateur non rejoué.
- CA-3.5 TVA complète.
- Paie, immobilisations/provisions, Mobile Money et imports de reprise.
- CA-3.6 DGID : essai réel de rejet/reprise sans doublon nécessite une spécification et un environnement DGID de test ; simulation ne vaut pas preuve.
- États déclaratifs de paie : spécifications GROW HUB requises avant développement.

## Non-destructif et retour arrière
Aucune donnée, table ni écriture modifiée dans ce lot. Le retour arrière concerne uniquement le code d’export ; conserver les contrôles et le libellé non officiel. Les exercices clôturés restent intacts.