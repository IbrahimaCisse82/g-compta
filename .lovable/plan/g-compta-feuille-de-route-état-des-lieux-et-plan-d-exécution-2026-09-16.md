# G-Compta — feuille de route : état des lieux et plan d'exécution

## Ce qui existe déjà (audit rapide du code et de la base)

La Phase A de votre feuille de route est en grande partie **déjà livrée** lors des chantiers précédents :

- Écritures en-tête + lignes côté serveur, création uniquement par fonction serveur (équilibre débit = crédit contrôlé en base, montant nul refusé, pièce justificative obligatoire en saisie manuelle).
- Numérotation séquentielle continue par journal et par exercice, non réutilisable.
- Immuabilité après validation : aucune suppression ni modification d'une écriture validée ; contre-passation native disponible depuis le journal.
- Verrouillage de période via le statut de l'exercice (saisie impossible sur exercice clôturé, réouverture réservée à l'administrateur avec motif obligatoire).
- Balance dérivée du journal (vue matérialisée) + écran de contrôle des écarts et bouton de resynchronisation.
- Rôles calculés en base (propriétaire / membre de cabinet / rôle explicite) ; plus aucun rôle « admin par défaut » côté navigateur ; droits vérifiés dans les fonctions serveur.
- Export FEC officiel, journal d'audit, 78 tests automatiques au vert.

**Restent ouverts sur la Phase A** : l'écran Anomalies (contrôles de cohérence), les correctifs FEC (numéro persistant, auxiliaires, rapport de contrôle), et la chaîne d'intégration continue.

## Plan proposé — par lots livrables et vérifiables

### Lot 1 — Fin de Phase A (socle)
1. Écran **Anomalies** : contrôles de cohérence automatiques (balance ≠ journal, comptes hors plan, écritures sans pièce, lettrage incohérent, exercices non équilibrés, notes annexes ≠ balance…), avec niveau de criticité et lien direct vers la donnée fautive.
2. **FEC** : numéro d'écriture persistant repris de l'écriture serveur (plus de recalcul à l'export), colonnes auxiliaires (compte auxiliaire + libellé), rapport de contrôle avant téléchargement.
3. **Tests d'intégrité par appel direct à la base** : preuve qu'une écriture déséquilibrée, une suppression d'écriture validée, une saisie sur exercice clôturé et une modification par un lecteur sont toutes refusées côté serveur.

*Critère de sortie : les quatre tentatives ci-dessus échouent en appel direct, hors interface.*

### Lot 2 — Phase B (onboarding, sectorisation, ségrégation des tâches)
1. **Secteur d'activité** sur l'entreprise (général, santé, commerce, industrie, services, BTP, agriculture), modifiable à tout moment ; menus sectoriels affichés selon le secteur du dossier actif, y compris au changement de dossier en mode cabinet.
2. **Onboarding** : création entreprise ou cabinet → choix du secteur → invitation des membres avec rôle obligatoire dès l'invitation. Écran de gestion des membres pour toute modification ultérieure.
3. **Ségrégation des tâches**, contrôlée en base :
   - un utilisateur ne peut pas valider une écriture qu'il a soumise ;
   - la clôture reste réservée à l'administrateur ;
   - un comptable ne peut ni s'attribuer ni attribuer un rôle supérieur au sien ;
   - cas de l'utilisateur seul : limite documentée et affichée dans l'interface.

*Critère de sortie : les cinq tentatives listées dans votre feuille de route sont refusées en appel direct.*

### Lot 3 — Phase C (conformité comptable et fiscale)
Reports à nouveau rejouables et affectation du résultat en fonction serveur transactionnelle ; comptabilité auxiliaire tiers complète (collectifs, auxiliaires, balance et grand livre auxiliaires, lettrage par tiers) ; extraction des moteurs Bilan / Résultat / TFT / Notes en librairies pures testées ; pagination serveur sur journal, grand livre et balance ; TVA complète (prorata, encaissements, retenues, non récupérable) ; IS/IMF et résultat fiscal ; rapprochement TFT ↔ immobilisations et provisions ; contrôle bloquant note annexe ↔ balance ; barèmes fiscaux et sociaux versionnés par date.

### Lot 4 — Phase D (cabinet avancé)
Révision par cycles et dossiers permanent/annuel, missions et rentabilité, balance N/N-1/N-2 et drill-down, refonte UX (palette de commandes, saisie 15 s), immobilisations avancées, provisions typées, paie avancée.

### Lot 5 — Phase E (module Santé)
Activé par le secteur « santé ». Audit préalable écrit, puis catalogue d'actes médicaux, tiers payant et scission de créance par payeur (adossée à la comptabilité auxiliaire du Lot 3), organismes d'assurance et bordereaux, remboursements et créances par ancienneté.

## Règles tenues sur tous les lots
Sécurité d'accès activée sur chaque nouvelle table, montants à deux décimales en base et affichés en FCFA sans décimale, aucune suppression d'écriture validée, conservation 10 ans, typage strict et tests sur toute logique métier.

## Ordre d'exécution
Je commence par le **Lot 1**, puis le Lot 2, en validant le critère de sortie de chacun avant de passer au suivant. Dites-moi si vous préférez attaquer directement la sectorisation et l'onboarding (Lot 2).
