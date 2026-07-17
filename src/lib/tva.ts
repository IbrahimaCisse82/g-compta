// Calcul TVA Sénégal / SYSCOHADA
export interface BalanceLine { compte: string; sfd: number; sfc: number }
export interface TvaParam { compte_tva_collectee: string; compte_tva_deductible: string; taux: number }

/** Extrait un montant HT à partir d'un TTC et d'un taux (ex: 0.18). */
export const ht = (ttc: number, taux: number) => ttc / (1 + taux);
/** Extrait la TVA à partir d'un TTC. */
export const tvaFromTtc = (ttc: number, taux: number) => ttc - ht(ttc, taux);
/** Ajoute la TVA à un HT. */
export const ttc = (ht: number, taux: number) => ht * (1 + taux);

export interface TvaCalcResult {
  collectee: number;
  deductible: number;
  nette: number;
  creditPrec: number;
  aPayer: number; // >0 = à payer, <0 = crédit reportable
}

export function calculerTva(
  balance: BalanceLine[],
  params: TvaParam[],
  creditPrec = 0,
): TvaCalcResult {
  const comptesCol = new Set(params.map(p => p.compte_tva_collectee));
  const comptesDed = new Set(params.map(p => p.compte_tva_deductible));

  let collectee = 0;
  let deductible = 0;
  for (const b of balance) {
    if (comptesCol.has(b.compte)) collectee += (b.sfc - b.sfd);
    if (comptesDed.has(b.compte)) deductible += (b.sfd - b.sfc);
  }
  const nette = collectee - deductible;
  const aPayer = nette - creditPrec;
  return { collectee, deductible, nette, creditPrec, aPayer };
}
