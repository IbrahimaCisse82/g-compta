/**
 * A10 — Contrôles de cohérence SYSCOHADA (22 contrôles automatisés)
 *
 * Chaque contrôle est une fonction pure qui examine la balance, le journal,
 * le plan comptable et l'exercice, puis retourne zéro ou plusieurs anomalies.
 * Aucun effet de bord, aucun appel réseau : la logique est entièrement testable.
 */

import type { BalanceLine, JournalLine, PlanCompte, Exercice } from './accounting';
import { isBilan, inRange, fmt } from './accounting';

// ─── Types ────────────────────────────────────────────

export type ControleSeverite = 'bloquant' | 'majeur' | 'mineur';
export type ControleCategorie = 'equilibre' | 'bilan' | 'journal' | 'plan' | 'tiers' | 'tresorerie' | 'gestion' | 'cloture';

export interface Anomalie {
  controle_id: string;
  controle_libelle: string;
  severite: ControleSeverite;
  categorie: ControleCategorie;
  compte?: string;
  piece?: string;
  date?: string;
  message: string;
  montant?: number;
}

export interface ControleDefinition {
  id: string;
  libelle: string;
  severite: ControleSeverite;
  categorie: ControleCategorie;
  description: string;
}

export interface ControleResultat {
  definition: ControleDefinition;
  anomalies: Anomalie[];
  statut: 'ok' | 'anomalie';
}

// ─── Utilitaires ──────────────────────────────────────

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const SEUIL = 1; // tolérance 1 FCFA pour les arrondis

function soldeNet(l: BalanceLine): number {
  return round2((l.sfd || 0) - (l.sfc || 0));
}

function soldeOuverture(l: BalanceLine): number {
  return round2((l.sd || 0) - (l.sc || 0));
}

/** Groupage des lignes de journal par pièce (une écriture = une pièce). */
function groupByPiece(journal: JournalLine[]): Map<string, JournalLine[]> {
  const map = new Map<string, JournalLine[]>();
  for (const l of journal) {
    const k = l.piece || l.id;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(l);
  }
  return map;
}

// ─── Définitions des 22 contrôles ─────────────────────

export const CONTROLES: ControleDefinition[] = [
  { id: 'C01', libelle: 'Équilibre général débit / crédit', severite: 'bloquant', categorie: 'equilibre',
    description: 'Σ mouvements débit = Σ mouvements crédit sur la balance générale.' },
  { id: 'C02', libelle: 'Équilibre du bilan (actif = passif)', severite: 'bloquant', categorie: 'bilan',
    description: 'Total actif (classes 1-5 soldes débiteurs) = Total passif (classes 1-5 soldes créditeurs).' },
  { id: 'C03', libelle: 'Écritures déséquilibrées', severite: 'bloquant', categorie: 'journal',
    description: 'Chaque écriture (groupée par pièce) doit avoir débit = crédit.' },
  { id: 'C04', libelle: 'Écritures sans pièce justificative', severite: 'majeur', categorie: 'journal',
    description: 'Aucune écriture ne doit être enregistrée sans numéro de pièce.' },
  { id: 'C05', libelle: 'Écritures mono-ligne', severite: 'majeur', categorie: 'journal',
    description: 'Une écriture comptable doit comporter au moins deux lignes (compte à débiter / compte à créditer).' },
  { id: 'C06', libelle: 'Dates d\u2019écritures hors exercice', severite: 'bloquant', categorie: 'journal',
    description: 'Les écritures doivent être datées dans la période [date_debut ; date_fin] de l\u2019exercice.' },
  { id: 'C07', libelle: 'Comptes utilisés hors plan comptable', severite: 'majeur', categorie: 'plan',
    description: 'Tout compte mouvementé au journal doit exister dans le plan comptable de l\u2019entreprise.' },
  { id: 'C08', libelle: 'Comptes de gestion avec solde d\u2019ouverture', severite: 'bloquant', categorie: 'cloture',
    description: 'Les comptes de classe 6, 7 et 8 ne doivent pas porter de solde d\u2019ouverture (à-nouveaux).' },
  { id: 'C09', libelle: 'Compte d\u2019actif au solde créditeur', severite: 'majeur', categorie: 'bilan',
    description: 'Un compte d\u2019actif (immobilisations, stocks, créances, trésorerie) ne doit pas présenter un solde final créditeur.' },
  { id: 'C10', libelle: 'Compte de passif au solde débiteur', severite: 'majeur', categorie: 'bilan',
    description: 'Un compte de passif (capitaux, dettes) ne doit pas présenter un solde final débiteur.' },
  { id: 'C11', libelle: 'Compte client (411) au solde créditeur', severite: 'mineur', categorie: 'tiers',
    description: 'Un compte client à solde créditeur indique une avance reçue ou un lettrage manquant.' },
  { id: 'C12', libelle: 'Compte fournisseur (401) au solde débiteur', severite: 'mineur', categorie: 'tiers',
    description: 'Un compte fournisseur à solde débiteur indique une avance versée ou un lettrage manquant.' },
  { id: 'C13', libelle: 'Trésorerie (52x) au solde créditeur', severite: 'majeur', categorie: 'tresorerie',
    description: 'Un compte de trésorerie au solde créditeur révèle un découvert bancaire non prévu.' },
  { id: 'C14', libelle: 'Stock avec solde créditeur', severite: 'bloquant', categorie: 'bilan',
    description: 'Un compte de stock (classe 3) au solde créditeur signifie un stock négatif (sur-sortie non régularisée).' },
  { id: 'C15', libelle: 'Capital social (101) nul ou négatif', severite: 'majeur', categorie: 'bilan',
    description: 'Le compte 101 (Capital) doit présenter un solde créditeur strictement positif.' },
  { id: 'C16', libelle: 'Résultat (131) non affecté sur exercice ouvert', severite: 'mineur', categorie: 'cloture',
    description: 'Un solde au compte 131 sur un exercice en cours indique un résultat en instance d\u2019affectation (AG non tenue).' },
  { id: 'C17', libelle: 'TVA collectée (443) non soldée', severite: 'mineur', categorie: 'gestion',
    description: 'Un solde au compte 443 en fin de période indique une déclaration de TVA non comptabilisée.' },
  { id: 'C18', libelle: 'Comptes HAO (8x) mouvementnés en exploitation', severite: 'mineur', categorie: 'gestion',
    description: 'L\u2019utilisation de comptes HAO (81-89) en cours d\u2019exercice doit rester exceptionnelle.' },
  { id: 'C19', libelle: 'Dotations (681) sans immobilisation', severite: 'mineur', categorie: 'gestion',
    description: 'Des dotations aux amortissements (681) mouvementnées sans immobilisation enregistrée (classe 2) sont suspectes.' },
  { id: 'C20', libelle: 'Écart de conversion (478/479) non contrepassé', severite: 'mineur', categorie: 'bilan',
    description: 'Les écarts de conversion actif (478) ou passif (479) doivent être contrepassés à l\u2019ouverture.' },
  { id: 'C21', libelle: 'Comptes de régularisation (48x) persistants', severite: 'mineur', categorie: 'cloture',
    description: 'Les comptes de charges et produits constatés d\u2019avance (48x) avec solde doivent être révisés à chaque clôture.' },
  { id: 'C22', libelle: 'Numérotation séquentielle des écritures', severite: 'mineur', categorie: 'journal',
    description: 'Les numéros séquentiels des écritures ne doivent pas présenter de saut non justifié.' },
];

// ─── Implémentation des contrôles ─────────────────────

type Ctx = {
  balance: BalanceLine[];
  journal: JournalLine[];
  plan: PlanCompte[];
  exercice: Exercice;
};

type ControleFn = (ctx: Ctx) => Anomalie[];

const controleDefs: Record<string, ControleFn> = {
  // C01 — Équilibre général débit / crédit
  C01: ({ balance }) => {
    const totD = round2(balance.reduce((s, l) => s + (l.md || 0), 0));
    const totC = round2(balance.reduce((s, l) => s + (l.mc || 0), 0));
    if (Math.abs(totD - totC) < SEUIL) return [];
    return [{
      controle_id: 'C01', controle_libelle: CONTROLES[0].libelle,
      severite: 'bloquant', categorie: 'equilibre',
      message: `Déséquilibre : débit ${fmt(totD)} ≠ crédit ${fmt(totC)} (écart ${fmt(Math.abs(totD - totC))})`,
      montant: Math.abs(totD - totC),
    }];
  },

  // C02 — Équilibre du bilan
  C02: ({ balance }) => {
    const bilan = balance.filter(l => isBilan(l.compte));
    const totActif = round2(bilan.reduce((s, l) => s + Math.max(soldeNet(l), 0), 0));
    const totPassif = round2(bilan.reduce((s, l) => s + Math.max(-soldeNet(l), 0), 0));
    if (Math.abs(totActif - totPassif) < SEUIL) return [];
    return [{
      controle_id: 'C02', controle_libelle: CONTROLES[1].libelle,
      severite: 'bloquant', categorie: 'bilan',
      message: `Actif ${fmt(totActif)} ≠ Passif ${fmt(totPassif)} (écart ${fmt(Math.abs(totActif - totPassif))})`,
      montant: Math.abs(totActif - totPassif),
    }];
  },

  // C03 — Écritures déséquilibrées
  C03: ({ journal }) => {
    const anomalies: Anomalie[] = [];
    for (const [piece, lignes] of groupByPiece(journal)) {
      const d = round2(lignes.reduce((s, l) => s + (l.debit || 0), 0));
      const c = round2(lignes.reduce((s, l) => s + (l.credit || 0), 0));
      if (Math.abs(d - c) >= SEUIL) {
        anomalies.push({
          controle_id: 'C03', controle_libelle: CONTROLES[2].libelle,
          severite: 'bloquant', categorie: 'journal',
          piece, date: lignes[0]?.date_ecriture,
          message: `Pièce ${piece} déséquilibrée : débit ${fmt(d)} ≠ crédit ${fmt(c)}`,
          montant: Math.abs(d - c),
        });
      }
    }
    return anomalies;
  },

  // C04 — Écritures sans pièce justificative
  C04: ({ journal }) => {
    const anomalies: Anomalie[] = [];
    const vus = new Set<string>();
    for (const l of journal) {
      const k = l.piece || '';
      if (!k && !vus.has(l.id)) {
        vus.add(l.id);
        anomalies.push({
          controle_id: 'C04', controle_libelle: CONTROLES[3].libelle,
          severite: 'majeur', categorie: 'journal',
          date: l.date_ecriture, compte: l.compte,
          message: `Écriture du ${l.date_ecriture} sans numéro de pièce (compte ${l.compte})`,
        });
      }
    }
    return anomalies;
  },

  // C05 — Écritures mono-ligne
  C05: ({ journal }) => {
    const anomalies: Anomalie[] = [];
    for (const [piece, lignes] of groupByPiece(journal)) {
      if (lignes.length < 2) {
        anomalies.push({
          controle_id: 'C05', controle_libelle: CONTROLES[4].libelle,
          severite: 'majeur', categorie: 'journal',
          piece, date: lignes[0]?.date_ecriture,
          message: `Pièce ${piece} : ${lignes.length} ligne seulement (minimum 2 requis)`,
        });
      }
    }
    return anomalies;
  },

  // C06 — Dates hors exercice
  C06: ({ journal, exercice }) => {
    const anomalies: Anomalie[] = [];
    const debut = exercice.date_debut;
    const fin = exercice.date_fin;
    const vus = new Set<string>();
    for (const l of journal) {
      if (l.date_ecriture < debut || l.date_ecriture > fin) {
        const k = l.piece || l.id;
        if (vus.has(k)) continue;
        vus.add(k);
        anomalies.push({
          controle_id: 'C06', controle_libelle: CONTROLES[5].libelle,
          severite: 'bloquant', categorie: 'journal',
          piece: l.piece || undefined, date: l.date_ecriture,
          message: `Écriture du ${l.date_ecriture} hors période de l'exercice (${debut} → ${fin})`,
        });
      }
    }
    return anomalies;
  },

  // C07 — Comptes hors plan comptable
  C07: ({ journal, plan }) => {
    const anomalies: Anomalie[] = [];
    const planSet = new Set(plan.map(p => p.numero));
    const vus = new Map<string, number>();
    for (const l of journal) {
      const prefix = l.compte;
      const inPlan = planSet.has(prefix) || Array.from(planSet).some(p => prefix.startsWith(p) || p.startsWith(prefix));
      if (!inPlan) {
        vus.set(prefix, (vus.get(prefix) || 0) + 1);
      }
    }
    for (const [compte, count] of vus) {
      anomalies.push({
        controle_id: 'C07', controle_libelle: CONTROLES[6].libelle,
        severite: 'majeur', categorie: 'plan', compte,
        message: `Compte ${compte} mouvementé (${count} ligne(s)) mais absent du plan comptable`,
      });
    }
    return anomalies;
  },

  // C08 — Comptes de gestion avec solde d'ouverture
  C08: ({ balance }) => {
    const anomalies: Anomalie[] = [];
    for (const l of balance) {
      if (/^[678]/.test(l.compte) && (Math.abs(l.sd || 0) > SEUIL || Math.abs(l.sc || 0) > SEUIL)) {
        anomalies.push({
          controle_id: 'C08', controle_libelle: CONTROLES[7].libelle,
          severite: 'bloquant', categorie: 'cloture', compte: l.compte,
          message: `Compte de gestion ${l.compte} (${l.intitule}) avec solde d'ouverture SD=${fmt(l.sd)} SC=${fmt(l.sc)}`,
          montant: Math.abs(soldeOuverture(l)),
        });
      }
    }
    return anomalies;
  },

  // C09 — Compte d'actif au solde créditeur
  C09: ({ balance }) => {
    const anomalies: Anomalie[] = [];
    for (const l of balance) {
      // Actif : classes 2 (immo), 3 (stocks), 4x actif (créances), 5x actif (trésorerie)
      const isActif = /^[23]/.test(l.compte) ||
        (/^4/.test(l.compte) && !/^4[01]/.test(l.compte) && !/^4[2-5]/.test(l.compte) && !/^47[89]/.test(l.compte) && !/^48/.test(l.compte)) ||
        /^5[012]/.test(l.compte);
      if (isActif && (l.sfc || 0) > SEUIL) {
        anomalies.push({
          controle_id: 'C09', controle_libelle: CONTROLES[8].libelle,
          severite: 'majeur', categorie: 'bilan', compte: l.compte,
          message: `Compte d'actif ${l.compte} (${l.intitule}) au solde créditeur ${fmt(l.sfc)}`,
          montant: l.sfc,
        });
      }
    }
    return anomalies;
  },

  // C10 — Compte de passif au solde débiteur
  C10: ({ balance }) => {
    const anomalies: Anomalie[] = [];
    for (const l of balance) {
      // Passif : classe 1 (capitaux), 4x passif (dettes), 5x passif (découverts)
      const isPassif = /^1/.test(l.compte) ||
        /^4[01]/.test(l.compte) || /^4[2-5]/.test(l.compte) || /^48/.test(l.compte) || /^479/.test(l.compte) ||
        /^5[6-9]/.test(l.compte);
      if (isPassif && (l.sfd || 0) > SEUIL) {
        anomalies.push({
          controle_id: 'C10', controle_libelle: CONTROLES[9].libelle,
          severite: 'majeur', categorie: 'bilan', compte: l.compte,
          message: `Compte de passif ${l.compte} (${l.intitule}) au solde débiteur ${fmt(l.sfd)}`,
          montant: l.sfd,
        });
      }
    }
    return anomalies;
  },

  // C11 — Client (411) au solde créditeur
  C11: ({ balance }) => {
    const anomalies: Anomalie[] = [];
    for (const l of balance) {
      if (/^411/.test(l.compte) && (l.sfc || 0) > SEUIL) {
        anomalies.push({
          controle_id: 'C11', controle_libelle: CONTROLES[10].libelle,
          severite: 'mineur', categorie: 'tiers', compte: l.compte,
          message: `Client ${l.compte} (${l.intitule}) au solde créditeur ${fmt(l.sfc)} — avance ou lettrage manquant`,
          montant: l.sfc,
        });
      }
    }
    return anomalies;
  },

  // C12 — Fournisseur (401) au solde débiteur
  C12: ({ balance }) => {
    const anomalies: Anomalie[] = [];
    for (const l of balance) {
      if (/^401/.test(l.compte) && (l.sfd || 0) > SEUIL) {
        anomalies.push({
          controle_id: 'C12', controle_libelle: CONTROLES[11].libelle,
          severite: 'mineur', categorie: 'tiers', compte: l.compte,
          message: `Fournisseur ${l.compte} (${l.intitule}) au solde débiteur ${fmt(l.sfd)} — avance ou lettrage manquant`,
          montant: l.sfd,
        });
      }
    }
    return anomalies;
  },

  // C13 — Trésorerie (52x) au solde créditeur
  C13: ({ balance }) => {
    const anomalies: Anomalie[] = [];
    for (const l of balance) {
      if (/^52/.test(l.compte) && (l.sfc || 0) > SEUIL) {
        anomalies.push({
          controle_id: 'C13', controle_libelle: CONTROLES[12].libelle,
          severite: 'majeur', categorie: 'tresorerie', compte: l.compte,
          message: `Trésorerie ${l.compte} (${l.intitule}) au solde créditeur ${fmt(l.sfc)} — découvert non prévu`,
          montant: l.sfc,
        });
      }
    }
    return anomalies;
  },

  // C14 — Stock avec solde créditeur
  C14: ({ balance }) => {
    const anomalies: Anomalie[] = [];
    for (const l of balance) {
      if (/^3/.test(l.compte) && (l.sfc || 0) > SEUIL) {
        anomalies.push({
          controle_id: 'C14', controle_libelle: CONTROLES[13].libelle,
          severite: 'bloquant', categorie: 'bilan', compte: l.compte,
          message: `Stock ${l.compte} (${l.intitule}) au solde créditeur ${fmt(l.sfc)} — stock négatif (sur-sortie non régularisée)`,
          montant: l.sfc,
        });
      }
    }
    return anomalies;
  },

  // C15 — Capital social (101) nul ou négatif
  C15: ({ balance }) => {
    const anomalies: Anomalie[] = [];
    const capital = balance.find(l => /^101/.test(l.compte));
    if (capital && (capital.sfc || 0) <= SEUIL) {
      anomalies.push({
        controle_id: 'C15', controle_libelle: CONTROLES[14].libelle,
        severite: 'majeur', categorie: 'bilan', compte: capital.compte,
        message: `Capital social (${capital.compte}) nul ou négatif — solde créditeur ${fmt(capital.sfc || 0)}`,
        montant: capital.sfc || 0,
      });
    }
    return anomalies;
  },

  // C16 — Résultat (131) non affecté sur exercice ouvert
  C16: ({ balance, exercice }) => {
    const anomalies: Anomalie[] = [];
    if (exercice.statut !== 'en_cours') return [];
    const r131 = balance.find(l => /^131/.test(l.compte));
    if (r131 && Math.abs(soldeNet(r131)) > SEUIL) {
      anomalies.push({
        controle_id: 'C16', controle_libelle: CONTROLES[15].libelle,
        severite: 'mineur', categorie: 'cloture', compte: r131.compte,
        message: `Résultat (131) de ${fmt(Math.abs(soldeNet(r131)))} en instance d'affectation sur exercice en cours`,
        montant: Math.abs(soldeNet(r131)),
      });
    }
    return anomalies;
  },

  // C17 — TVA collectée (443) non soldée
  C17: ({ balance }) => {
    const anomalies: Anomalie[] = [];
    for (const l of balance) {
      if (/^443/.test(l.compte) && Math.abs(soldeNet(l)) > SEUIL) {
        anomalies.push({
          controle_id: 'C17', controle_libelle: CONTROLES[16].libelle,
          severite: 'mineur', categorie: 'gestion', compte: l.compte,
          message: `TVA collectée ${l.compte} (${l.intitule}) au solde ${fmt(Math.abs(soldeNet(l)))} — déclaration possiblement manquante`,
          montant: Math.abs(soldeNet(l)),
        });
      }
    }
    return anomalies;
  },

  // C18 — Comptes HAO (8x) mouvementnés
  C18: ({ balance }) => {
    const anomalies: Anomalie[] = [];
    for (const l of balance) {
      if (/^8/.test(l.compte) && ((l.md || 0) > SEUIL || (l.mc || 0) > SEUIL)) {
        anomalies.push({
          controle_id: 'C18', controle_libelle: CONTROLES[17].libelle,
          severite: 'mineur', categorie: 'gestion', compte: l.compte,
          message: `Compte HAO ${l.compte} (${l.intitule}) mouvementné (D=${fmt(l.md)} C=${fmt(l.mc)}) — usage exceptionnel à justifier`,
          montant: Math.abs((l.md || 0) - (l.mc || 0)),
        });
      }
    }
    return anomalies;
  },

  // C19 — Dotations (681) sans immobilisation (classe 2)
  C19: ({ balance }) => {
    const anomalies: Anomalie[] = [];
    const hasImmo = balance.some(l => /^2[0-4]/.test(l.compte) && Math.abs(soldeNet(l)) > SEUIL);
    const dot681 = balance.filter(l => /^681/.test(l.compte) && (l.md || 0) > SEUIL);
    if (!hasImmo && dot681.length > 0) {
      for (const l of dot681) {
        anomalies.push({
          controle_id: 'C19', controle_libelle: CONTROLES[18].libelle,
          severite: 'mineur', categorie: 'gestion', compte: l.compte,
          message: `Dotation ${l.compte} (${l.intitule}) de ${fmt(l.md)} sans immobilisation enregistrée (classe 2)`,
          montant: l.md,
        });
      }
    }
    return anomalies;
  },

  // C20 — Écart de conversion (478/479) non contrepassé
  C20: ({ balance }) => {
    const anomalies: Anomalie[] = [];
    for (const l of balance) {
      if (/^478/.test(l.compte) && (l.sfd || 0) > SEUIL) {
        anomalies.push({
          controle_id: 'C20', controle_libelle: CONTROLES[19].libelle,
          severite: 'mineur', categorie: 'bilan', compte: l.compte,
          message: `Écart de conversion actif ${l.compte} (${l.intitule}) au solde ${fmt(l.sfd)} — à contrepasser à l'ouverture`,
          montant: l.sfd,
        });
      }
      if (/^479/.test(l.compte) && (l.sfc || 0) > SEUIL) {
        anomalies.push({
          controle_id: 'C20', controle_libelle: CONTROLES[19].libelle,
          severite: 'mineur', categorie: 'bilan', compte: l.compte,
          message: `Écart de conversion passif ${l.compte} (${l.intitule}) au solde ${fmt(l.sfc)} — à contrepasser à l'ouverture`,
          montant: l.sfc,
        });
      }
    }
    return anomalies;
  },

  // C21 — Comptes de régularisation (48x) persistants
  C21: ({ balance }) => {
    const anomalies: Anomalie[] = [];
    for (const l of balance) {
      if (/^48/.test(l.compte) && Math.abs(soldeNet(l)) > SEUIL) {
        anomalies.push({
          controle_id: 'C21', controle_libelle: CONTROLES[20].libelle,
          severite: 'mineur', categorie: 'cloture', compte: l.compte,
          message: `Régularisation ${l.compte} (${l.intitule}) au solde ${fmt(Math.abs(soldeNet(l)))} — à réviser à la clôture`,
          montant: Math.abs(soldeNet(l)),
        });
      }
    }
    return anomalies;
  },

  // C22 — Numérotation séquentielle des écritures
  C22: ({ journal }) => {
    const anomalies: Anomalie[] = [];
    // On vérifie les numéros de pièce : tri par date puis détection de sauts
    const pieces = Array.from(new Set(journal.map(l => l.piece).filter(Boolean) as string[]));
    if (pieces.length < 2) return [];
    // Extraction des numéros séquentiels si la pièce est au format numérique
    const nums = pieces
      .map(p => parseInt(p.replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n) && n > 0)
      .sort((a, b) => a - b);
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] - nums[i - 1] > 1) {
        anomalies.push({
          controle_id: 'C22', controle_libelle: CONTROLES[21].libelle,
          severite: 'mineur', categorie: 'journal',
          message: `Saut de numérotation : ${nums[i - 1]} → ${nums[i]} (${nums[i] - nums[i - 1] - 1} numéro(s) manquant(s))`,
        });
        break; // un seul signalement suffit
      }
    }
    return anomalies;
  },
};

// ─── Exécution de tous les contrôles ──────────────────

export function lancerControles(ctx: Ctx): ControleResultat[] {
  return CONTROLES.map(def => {
    const fn = controleDefs[def.id];
    const anomalies = fn ? fn(ctx) : [];
    return { definition: def, anomalies, statut: anomalies.length === 0 ? 'ok' as const : 'anomalie' as const };
  });
}

export function toutesAnomalies(resultats: ControleResultat[]): Anomalie[] {
  return resultats.flatMap(r => r.anomalies);
}

export function compterParSeverite(resultats: ControleResultat[]): Record<ControleSeverite, number> {
  const counts: Record<ControleSeverite, number> = { bloquant: 0, majeur: 0, mineur: 0 };
  for (const r of resultats) {
    for (const a of r.anomalies) counts[a.severite]++;
  }
  return counts;
}
