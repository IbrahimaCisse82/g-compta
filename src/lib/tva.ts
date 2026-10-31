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

export interface TvaAjustements {
  prorata: number;
  nonRecuperable: number;
  autoliquidation: number;
  autoliquidationNonRecuperable: number;
  retenues: number;
}

export interface TvaPeriodeInput extends TvaAjustements {
  collectee: number;
  deductible: number;
  creditPrec: number;
}

const centimes = (n: number) => Math.round((n + Number.EPSILON) * 100);

/** CA-3.5 : montants signés du journal, ajustements positifs, dû et crédit séparés. */
export function calculerTvaPeriode(p: TvaPeriodeInput) {
  if (Object.values(p).some(n => !Number.isFinite(n))) throw new Error('Montant TVA invalide');
  if (p.prorata < 0 || p.prorata > 100) throw new Error('Le prorata doit être compris entre 0 et 100 %');
  if ([p.nonRecuperable, p.autoliquidation, p.autoliquidationNonRecuperable, p.retenues, p.creditPrec].some(n => n < 0)) {
    throw new Error('Les ajustements et le crédit antérieur doivent être positifs ou nuls');
  }
  if (centimes(p.nonRecuperable) > Math.max(0, centimes(p.deductible))) throw new Error('TVA non récupérable supérieure à la TVA déductible');
  if (centimes(p.autoliquidationNonRecuperable) > centimes(p.autoliquidation)) throw new Error('Part non récupérable supérieure à l’autoliquidation');
  const collectee = centimes(p.collectee) + centimes(p.autoliquidation);
  const baseDeduction = centimes(p.deductible) - centimes(p.nonRecuperable)
    + centimes(p.autoliquidation) - centimes(p.autoliquidationNonRecuperable);
  const deductionAdmise = Math.round(baseDeduction * p.prorata / 100);
  const nette = collectee - deductionAdmise;
  const solde = nette - centimes(p.creditPrec) - centimes(p.retenues);
  return {
    collectee: collectee / 100,
    deductibleBrute: centimes(p.deductible) / 100,
    deductionAdmise: deductionAdmise / 100,
    nette: nette / 100,
    creditPrec: centimes(p.creditPrec) / 100,
    retenues: centimes(p.retenues) / 100,
    aPayer: Math.max(0, solde) / 100,
    creditReportable: Math.max(0, -solde) / 100,
  };
}

export interface CreditTvaHistorique { date_fin: string; statut: string; tva_a_payer: number; credit_reportable?: number }
export function creditTvaAnterieur(declarations: CreditTvaHistorique[], debut: string) {
  const precedente = declarations.filter(d => d.statut === 'validee' && d.date_fin < debut)
    .sort((a, b) => b.date_fin.localeCompare(a.date_fin))[0];
  return precedente ? Math.max(0, precedente.credit_reportable ?? -Number(precedente.tva_a_payer)) : 0;
}
