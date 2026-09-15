import type { LigneEcriture } from '@/lib/ecritures';
import { round2 } from '@/lib/ecritures';

/**
 * Règlements et avances/acomptes SYSCOHADA.
 * - Client : avance reçue → 4191 (passif circulant), règlement de facture → 411.
 * - Fournisseur : avance versée → 4091 (actif circulant), règlement de facture → 401.
 * Aucune compensation : l'avance reste au bilan tant qu'elle n'est pas imputée.
 */

export type TypeReglement = 'acompte' | 'solde';

/** 411, 4112, 411CLI… → 4191, 41912, 4191CLI… (avances reçues des clients) */
export function compteAvanceClient(compteTiers: string): string {
  const c = String(compteTiers || '411').trim();
  if (c.startsWith('4191')) return c;
  return '4191' + c.slice(3);
}

/** 401, 4011, 401FRN… → 4091, 40911, 4091FRN… (avances versées aux fournisseurs) */
export function compteAvanceFournisseur(compteTiers: string): string {
  const c = String(compteTiers || '401').trim();
  if (c.startsWith('4091')) return c;
  return '4091' + c.slice(3);
}

export interface ReglementInput {
  compteTiers: string;
  compteTresorerie: string;
  montant: number;
  type: TypeReglement;
  libelle: string;
  tiers?: string;
}

/** Encaissement client : trésorerie au débit, 411 (solde) ou 4191 (acompte) au crédit. */
export function lignesReglementClient(i: ReglementInput): LigneEcriture[] {
  const m = round2(i.montant);
  if (m <= 0) return [];
  const cptTiers = i.type === 'acompte' ? compteAvanceClient(i.compteTiers) : i.compteTiers;
  return [
    { compte: i.compteTresorerie, intitule: 'Trésorerie', libelle: i.libelle, debit: m, credit: 0 },
    {
      compte: cptTiers,
      intitule: i.type === 'acompte' ? 'Clients, avances reçues' : 'Clients',
      libelle: i.libelle,
      debit: 0,
      credit: m,
    },
  ];
}

/** Décaissement fournisseur : 401 (solde) ou 4091 (acompte) au débit, trésorerie au crédit. */
export function lignesReglementFournisseur(i: ReglementInput): LigneEcriture[] {
  const m = round2(i.montant);
  if (m <= 0) return [];
  const cptTiers = i.type === 'acompte' ? compteAvanceFournisseur(i.compteTiers) : i.compteTiers;
  return [
    {
      compte: cptTiers,
      intitule: i.type === 'acompte' ? 'Fournisseurs, avances versées' : 'Fournisseurs',
      libelle: i.libelle,
      debit: m,
      credit: 0,
    },
    { compte: i.compteTresorerie, intitule: 'Trésorerie', libelle: i.libelle, debit: 0, credit: m },
  ];
}

/** Imputation d'une avance client sur la facture : 4191 au débit, 411 au crédit. */
export function lignesImputationAvanceClient(compteTiers: string, montant: number, libelle: string): LigneEcriture[] {
  const m = round2(montant);
  if (m <= 0) return [];
  return [
    { compte: compteAvanceClient(compteTiers), intitule: 'Clients, avances reçues', libelle, debit: m, credit: 0 },
    { compte: compteTiers, intitule: 'Clients', libelle, debit: 0, credit: m },
  ];
}

/** Imputation d'une avance fournisseur sur la facture : 401 au débit, 4091 au crédit. */
export function lignesImputationAvanceFournisseur(compteTiers: string, montant: number, libelle: string): LigneEcriture[] {
  const m = round2(montant);
  if (m <= 0) return [];
  return [
    { compte: compteTiers, intitule: 'Fournisseurs', libelle, debit: m, credit: 0 },
    { compte: compteAvanceFournisseur(compteTiers), intitule: 'Fournisseurs, avances versées', libelle, debit: 0, credit: m },
  ];
}
