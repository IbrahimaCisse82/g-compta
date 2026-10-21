// Module fiscal (CA-3.4) : résultat fiscal, IS, IMF. Aucun taux en dur : tout vient de `baremes`.
export interface Bareme { code: string; valeur: number; date_effet: string; date_fin: string | null }
export interface LignePassage { sens: 'reintegration' | 'deduction'; montant: number }

/** Valeur du barème en vigueur à une date (date_effet la plus récente ≤ date). */
export function baremeA(baremes: Bareme[], code: string, date: string): number {
  const b = baremes
    .filter(x => x.code === code && x.date_effet <= date && (!x.date_fin || x.date_fin >= date))
    .sort((a, b) => b.date_effet.localeCompare(a.date_effet))[0];
  if (!b) throw new Error(`Barème ${code} absent au ${date}`);
  return Number(b.valeur);
}

const franc = (n: number) => Math.round(n);

export interface CalculImpot {
  resultatComptable: number; reintegrations: number; deductions: number;
  resultatFiscal: number; is: number; imf: number; impotDu: number; retenu: 'IS' | 'IMF';
}

export function calculerImpot(p: {
  resultatComptable: number; chiffreAffairesHT: number; passage: LignePassage[];
  baremes: Bareme[]; dateCloture: string;
}): CalculImpot {
  const reint = p.passage.filter(l => l.sens === 'reintegration').reduce((s, l) => s + Number(l.montant), 0);
  const ded = p.passage.filter(l => l.sens === 'deduction').reduce((s, l) => s + Number(l.montant), 0);
  const rf = p.resultatComptable + reint - ded;
  const is = franc(Math.max(0, rf) * baremeA(p.baremes, 'IS_TAUX', p.dateCloture));
  const brutImf = Math.max(0, p.chiffreAffairesHT) * baremeA(p.baremes, 'IMF_TAUX', p.dateCloture);
  const imf = franc(Math.min(
    baremeA(p.baremes, 'IMF_PLAFOND', p.dateCloture),
    Math.max(baremeA(p.baremes, 'IMF_PLANCHER', p.dateCloture), brutImf),
  ));
  const retenu = is >= imf ? 'IS' : 'IMF';
  return { resultatComptable: p.resultatComptable, reintegrations: reint, deductions: ded,
    resultatFiscal: rf, is, imf, impotDu: Math.max(is, imf), retenu };
}

/** Acomptes provisionnels de N+1 : fraction de l'impôt dû, trois échéances (dates À VALIDER). */
export function acomptes(impotDu: number, fraction: number, anneeSuivante: number) {
  const a = franc(impotDu * fraction);
  return [
    { echeance: `${anneeSuivante}-02-15`, montant: a },
    { echeance: `${anneeSuivante}-04-30`, montant: a },
    { echeance: `${anneeSuivante}-06-15`, montant: impotDu - 2 * a },
  ];
}
