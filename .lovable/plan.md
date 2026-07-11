
# Plan de mise à niveau — combler l'écart concurrentiel

Objectif : passer d'un SaaS SYSCOHADA solide à un **leader différencié sur le marché sénégalais / UEMOA**, en attaquant les 4 gaps identifiés au benchmark (Mobile Money, e-facturation DGID, IA, Go-to-market).

---

## Sprint 5 — Mobile Money (P1)

Intégration native des paiements locaux, standard attendu au Sénégal.

- Nouvelle table `moyens_paiement` (Wave, Orange Money, Free Money, Wizall) + `transactions_mm` (ref, montant, sens, statut, rapproché_avec).
- Import CSV/relevé Wave/OM (parseurs dédiés) + saisie manuelle.
- Rapprochement automatique transactions ↔ écritures banque (compte 521/531 dédié par MM).
- Écritures auto : encaissement client (411 → 521 Wave) / paiement fournisseur (401 → 521 OM).
- Widget dashboard "Tréso Mobile Money" (solde par opérateur, top mouvements).
- Page `/mobile-money` dans AppShell.

## Sprint 6 — Facturation électronique DGID (P1)

Préparer la conformité à la norme e-facture sénégalaise (déjà en vigueur pour grandes entreprises, extension PME annoncée).

- Extension `factures` : `uuid_dgid`, `qr_code`, `hash_certif`, `statut_dgid` (brouillon, transmise, acceptée, rejetée), `date_transmission`.
- Génération XML/JSON conforme (schéma DGID) + QR code sur PDF.
- Edge Function `emit-facture-dgid` (signature, transmission, polling statut).
- Archivage légal 10 ans dans bucket GED dédié `factures-dgid` (immuable).
- Écran "Factures DGID" : suivi transmission, relances, exports.
- Configuration par entreprise (certificat, mode test/prod).

## Sprint 7 — Copilote IA (P2)

Différenciation face à SYGMA. Utilise le Gateway AI Lovable (aucune clé à gérer).

- Edge Function `copilote-ia` (google/gemini-2.5-flash par défaut).
- **Imputation auto** : à partir d'un libellé + montant, propose compte + journal + TVA (few-shot sur historique de l'entreprise).
- **Détection d'anomalies** : écritures déséquilibrées, doublons probables, comptes inhabituels, ratios hors norme.
- **Prévision trésorerie 90j** : basée sur échéancier + saisonnalité historique.
- **Q&A comptable** : chatbot contextuel ("quel est mon EBE ? pourquoi baisse-t-il ?").
- Widget "Copilote" flottant dans AppShell + panneau dédié.

## Sprint 8 — Landing publique + Pricing + Onboarding (P2)

Aucun concurrent local n'affiche des prix clairs. Opportunité marketing immédiate.

- Landing `/` publique refondue : hero, features, screenshots, témoignages, comparatif vs CassKai/Sage/Odoo.
- Page `/tarifs` : 3 plans FCFA transparents
  - **Starter** — 15 000 F/mois — 1 dossier, 1 user, essentiels
  - **Pro** — 35 000 F/mois — 3 dossiers, 5 users, paie + immo + GED
  - **Cabinet** — 75 000 F/mois — illimité, portail client, KPI collab, IA
- Onboarding guidé (wizard 5 étapes : entreprise, exercice, PC, journaux, 1re écriture).
- Essai gratuit 14 j sans CB, upgrade in-app (préparer Stripe/Paddle FCFA).
- SEO : title/meta/OG, JSON-LD SoftwareApplication, robots.txt, sitemap.

---

## Détails techniques

### Nouvelles tables
```text
moyens_paiement   (id, entreprise_id, operateur, numero, compte_associe, actif)
transactions_mm   (id, entreprise_id, moyen_id, date, sens, montant, ref_operateur,
                   contrepartie, statut, rapproche_journal_id)
factures (+cols)  uuid_dgid, qr_code, hash_certif, statut_dgid, date_transmission
copilote_logs     (id, entreprise_id, user_id, type, prompt, response, tokens, created_at)
plans_abonnement  (id, code, nom, prix_fcfa, limites_json, features_json)
abonnements       (id, entreprise_id, plan_id, statut, date_debut, date_fin, essai)
```
Chaque table : GRANT + RLS scoped `entreprise_id`.

### Edge Functions
- `emit-facture-dgid` — signature + transmission DGID
- `copilote-ia` — proxy AI Gateway (imputation, anomalies, prévision, chat)
- `import-mobile-money` — parseur CSV Wave/OM/Free
- `stripe-webhook` (préparation Sprint 8+)

### Ordre d'exécution recommandé
1. **Sprint 5** (Mobile Money) — impact commercial immédiat, faible risque
2. **Sprint 8** (Landing + Pricing) — en parallèle, débloque acquisition
3. **Sprint 6** (DGID) — dépend de specs officielles, cadrer en amont
4. **Sprint 7** (IA) — dernier car valeur ajoutée sur base déjà différenciée

### Hors scope (backlog ultérieur)
- App mobile compagnon (React Native / PWA offline)
- Multi-pays OHADA (paie Côte d'Ivoire, Cameroun, etc.)
- Intégrations bancaires directes (API BCEAO / Ecobank / SGBS)
- Marketplace de connecteurs (Zapier-like)

---

**Livrable de chaque sprint** : migration SQL + pages UI + edge functions + mise à jour navigation + doc courte.

Dis-moi par lequel enchaîner — je propose **Sprint 5 (Mobile Money)** pour maximiser l'impact perçu client à court terme.
