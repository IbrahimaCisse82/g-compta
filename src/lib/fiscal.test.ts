import { describe, it, expect } from 'vitest';
import { calculerImpot, baremeA, acomptes, type Bareme } from './fiscal';

const B: Bareme[] = [
  { code: 'IS_TAUX', valeur: 0.30, date_effet: '2013-01-01', date_fin: null },
  { code: 'IMF_TAUX', valeur: 0.005, date_effet: '2013-01-01', date_fin: null },
  { code: 'IMF_PLANCHER', valeur: 500000, date_effet: '2013-01-01', date_fin: null },
  { code: 'IMF_PLAFOND', valeur: 5000000, date_effet: '2013-01-01', date_fin: null },
];
const calc = (rc: number, ca: number, passage: any[] = []) =>
  calculerImpot({ resultatComptable: rc, chiffreAffairesHT: ca, passage, baremes: B, dateCloture: '2025-12-31' });

describe('CA-3.4 — IS / IMF sur cinq dossiers', () => {
  it('bénéfice 10 M + 1 M réintégré : IS 3,3 M retenu', () => {
    const r = calc(10_000_000, 200_000_000, [{ sens: 'reintegration', montant: 1_000_000 }]);
    expect(r.resultatFiscal).toBe(11_000_000); expect(r.is).toBe(3_300_000); expect(r.retenu).toBe('IS');
  });
  it('perte : IMF 0,5 % du CA (100 M → 500 000)', () => {
    const r = calc(-2_000_000, 100_000_000); expect(r.is).toBe(0); expect(r.impotDu).toBe(500_000); expect(r.retenu).toBe('IMF');
  });
  it('petit CA : plancher 500 000', () => { expect(calc(0, 10_000_000).imf).toBe(500_000); });
  it('gros CA : plafond 5 000 000', () => { expect(calc(0, 5_000_000_000).imf).toBe(5_000_000); });
  it('déduction ramenant le résultat fiscal à zéro : IMF retenu', () => {
    const r = calc(1_000_000, 300_000_000, [{ sens: 'deduction', montant: 1_000_000 }]);
    expect(r.resultatFiscal).toBe(0); expect(r.impotDu).toBe(1_500_000);
  });
  it('lit le barème daté en vigueur', () => {
    const b2 = [...B, { code: 'IS_TAUX', valeur: 0.25, date_effet: '2026-01-01', date_fin: null }];
    expect(baremeA(b2, 'IS_TAUX', '2025-12-31')).toBe(0.30);
    expect(baremeA(b2, 'IS_TAUX', '2026-12-31')).toBe(0.25);
  });
  it('acomptes : total = impôt dû', () => {
    expect(acomptes(1_000_000, 0.333333, 2026).reduce((s, a) => s + a.montant, 0)).toBe(1_000_000);
  });
});
