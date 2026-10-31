# Phase 3 — Conformité fiscale et déclarative

## Priorité : cohérence avec les fichiers SYSCOHADA fournis
- [x] Corriger la couverture des subdivisions, les signes du résultat et du capital non appelé, et le bilan brut/amortissements/net ; 131 tests passés lors du lot précédent.
- [ ] Vérifier les états dans l’application et consigner les preuves et limites.
- [ ] Reconstituer les flux réellement encaissés/décaissés du TFT : les seuls soldes de balance ne permettent pas de distinguer les acquisitions sans trésorerie.
- [ ] Faire valider les 80 correspondances provisoires du fichier fourni ; ne pas les imposer comme officielles.

## Lot actif : export FEC (CA-3.1)
- [x] Vérifier et corriger la stabilité du fichier et la détection des trous de numérotation (tests CA-3.1).
- [x] Afficher un rapport avant téléchargement et ne pas présenter le FEC comme officiel.
- [x] Tester les règles ; vérifier le parcours connecté sur l’exercice disponible (vide).
- [ ] Vérifier le téléchargement connecté avec un exercice renseigné : seul dossier accessible vide ; ne pas créer de fausses écritures dans les données utilisateur.

## Lots suivants (non commencés)
- Comptabilité auxiliaire et journaux paramétrables ; export asynchrone au-delà de 100 000 lignes.
- [x] Système normal / refus SMT (CA-3.3) : choix dans Paramètres, états refusés avec message.
- Barèmes datés et reproduction de paie historique (CA-3.2).
- [x] Résultat fiscal, IS/IMF (CA-3.4) : barèmes datés, passage fiscal, page Résultat fiscal. Fiche DSF et état amortissements/provisions ajoutés.
- [ ] TVA (CA-3.5), lot actif : calcul sur écritures validées exhaustives, prorata, retenues subies, non-récupérable et autoliquidation ; sauvegarde d’un brouillon contrôlé sans liquidation prématurée.
- [ ] TVA (CA-3.5), lot suivant : reconnaissance sur encaissements liée aux règlements/lettrage, régularisation annuelle, ventilation par nature/exonération/exportation et liquidation atomique.
- Paie, immobilisations/provisions, Mobile Money, reprise FEC/Excel.
- DGID : reprise sans doublon (CA-3.6), dépend de la spécification et de l’environnement DGID de test.

## Blocages conservés
- Phase 1 : essais lecteur et autre entreprise reportés par l’utilisateur, comptes non fournis.
- États déclaratifs de paie : spécifications à fournir par GROW HUB avant développement.