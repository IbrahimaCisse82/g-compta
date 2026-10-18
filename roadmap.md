# Phase 3 — Conformité fiscale et déclarative

## Lot actif : export FEC (CA-3.1)
- [x] Vérifier et corriger la stabilité du fichier et la détection des trous de numérotation (tests CA-3.1).
- [x] Afficher un rapport avant téléchargement et ne pas présenter le FEC comme officiel.
- [x] Tester les règles ; vérifier le parcours connecté sur l’exercice disponible (vide).
- [ ] Vérifier le téléchargement connecté avec un exercice renseigné : seul dossier accessible vide ; ne pas créer de fausses écritures dans les données utilisateur.

## Lots suivants (non commencés)
- Comptabilité auxiliaire et journaux paramétrables ; export asynchrone au-delà de 100 000 lignes.
- Système normal / refus SMT (CA-3.3).
- Barèmes datés et reproduction de paie historique (CA-3.2).
- Résultat fiscal, IS/IMF sur cinq dossiers (CA-3.4).
- TVA complète (CA-3.5).
- Paie, immobilisations/provisions, Mobile Money, reprise FEC/Excel.
- DGID : reprise sans doublon (CA-3.6), dépend de la spécification et de l’environnement DGID de test.

## Blocages conservés
- Phase 1 : essais lecteur et autre entreprise reportés par l’utilisateur, comptes non fournis.
- États déclaratifs de paie : spécifications à fournir par GROW HUB avant développement.