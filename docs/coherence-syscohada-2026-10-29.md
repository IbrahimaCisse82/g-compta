# Cohérence SYSCOHADA — 29 octobre 2026

## Constat avant correction
Les 17 tests existants de calcul/rapprochement passent, mais ne couvrent pas les écarts reproduits lors de la vérification précédente : subdivisions exclues en borne supérieure, charges 65 omises, signe de la production stockée inversé, amortissements non déduits du net, capital non appelé additionné. Le compte 47811 serait compté deux fois après une correction isolée des préfixes.

## Corrections ciblées
- Bornes de comptes inclusives de leurs subdivisions.
- Services extérieurs 62/63, impôts 64, autres charges 65 (hors 659) ; production stockée crédit moins débit ; subventions 71 et autres produits 75.
- Capital non appelé soustrait au passif.
- Calcul commun brut/amortissements/net pour écran Bilan, CSV, PDF et rapprochements ; déductions explicites des comptes opposants.
- Écarts de conversion exclus des créances/dettes circulantes.
- Nomenclature des immobilisations corrigée pour accompagner les comptes d’amortissement non ambigus. Les comptes partagés nécessitent toujours une affectation validée.

## Limites et prochaines actions
1. TFT : la balance seule ne distingue pas les opérations de trésorerie des locations-acquisitions et reclassements. Ne pas corriger seulement FP : il faut coordonner acquisitions sans trésorerie et remboursements avec les pièces. Le TFT actuel reste à corriger et ne vaut pas état validé.
2. Référentiel et correspondances versionnées/paramétrables : non implémentés par ce correctif ciblé ; le moteur conserve ses définitions existantes. Importer le référentiel en lecture seule, puis valider les correspondances avant remplacement global.
3. 80 correspondances fournies sont provisoires ; 2818/2918/2919/2939/2949 demandent une affectation au poste cible, sans répartition inventée. Un contrôle bloquant d’affectation reste nécessaire.
4. Compte de résultat : traitement complet des contre-mouvements et correspondances des reprises/dotations à compléter avant recette globale.
5. Recette officielle sur balance Application 127 : balance de référence et validation des postes provisoires nécessaires.

## Données
Aucune écriture, table, solde stocké ou exercice modifié. Ce lot ne constitue pas une certification de conformité.

## Preuves
Les résultats des tests et du parcours réel sont consignés à l’issue de la vérification.