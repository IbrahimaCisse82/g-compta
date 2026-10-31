import { describe, it, expect } from 'vitest';
import { ht, tvaFromTtc, ttc, calculerTva, calculerTvaPeriode, creditTvaAnterieur } from './tva';

describe('TVA — helpers', () => {
  it('ht() extrait le HT correctement à 18%', () => {
    expect(ht(1180, 0.18)).toBeCloseTo(1000, 2);
  });
  it('tvaFromTtc() donne le montant TVA', () => {
    expect(tvaFromTtc(1180, 0.18)).toBeCloseTo(180, 2);
  });
  it('ttc() applique la TVA', () => {
    expect(ttc(1000, 0.18)).toBeCloseTo(1180, 2);
  });
});

describe('CA-3.5 — préparation TVA complète', () => {
  const base = { collectee: 180_000, deductible: 100_000, prorata: 100, creditPrec: 0, retenues: 0, nonRecuperable: 0, autoliquidation: 0, autoliquidationNonRecuperable: 0 };
  it('applique le prorata : 180 000 − 100 000 × 60 % = 120 000', () => {
    const r = calculerTvaPeriode({ ...base, prorata: 60 });
    expect(r.deductionAdmise).toBe(60_000);
    expect(r.aPayer).toBe(120_000);
  });
  it('déduit les retenues subies et le crédit antérieur', () => {
    expect(calculerTvaPeriode({ ...base, retenues: 20_000, creditPrec: 10_000 }).aPayer).toBe(50_000);
  });
  it('exclut 30 000 de TVA non récupérable avant le prorata', () => {
    const r = calculerTvaPeriode({ ...base, nonRecuperable: 30_000, prorata: 50 });
    expect(r.deductionAdmise).toBe(35_000);
    expect(r.aPayer).toBe(145_000);
  });
  it('autoliquide les services importés sur les deux côtés sans double ajout de la déduction', () => {
    const r = calculerTvaPeriode({ ...base, autoliquidation: 18_000, prorata: 50 });
    expect(r.collectee).toBe(198_000);
    expect(r.deductionAdmise).toBe(59_000);
    expect(r.aPayer).toBe(139_000);
  });
  it('exclut la part non récupérable de l’autoliquidation', () => {
    expect(calculerTvaPeriode({ ...base, autoliquidation: 18_000, autoliquidationNonRecuperable: 18_000 }).aPayer).toBe(98_000);
  });
  it('ne déclare jamais un dû négatif et conserve le crédit', () => {
    const r = calculerTvaPeriode({ ...base, creditPrec: 100_000 });
    expect(r.aPayer).toBe(0);
    expect(r.creditReportable).toBe(20_000);
  });
  it('préserve les centimes, arrondis une seule fois sur la déduction', () => {
    const r = calculerTvaPeriode({ ...base, collectee: 0.30, deductible: 0.20, prorata: 50 });
    expect(r.aPayer).toBe(0.20);
  });
  it('refuse un prorata hors limites et un non-récupérable impossible', () => {
    expect(() => calculerTvaPeriode({ ...base, prorata: 101 })).toThrow();
    expect(() => calculerTvaPeriode({ ...base, nonRecuperable: 100_001 })).toThrow();
    expect(() => calculerTvaPeriode({ ...base, retenues: -1 })).toThrow();
  });
  it('ne reprend ni un crédit futur ni un brouillon', () => {
    expect(creditTvaAnterieur([
      { date_fin: '2026-01-31', statut: 'validee', tva_a_payer: -20_000 },
      { date_fin: '2026-03-31', statut: 'validee', tva_a_payer: -90_000 },
      { date_fin: '2026-02-01', statut: 'brouillon', tva_a_payer: -50_000 },
    ], '2026-02-01')).toBe(20_000);
  });
});

describe('TVA — déclaration', () => {
  const params = [{ compte_tva_collectee: '4431', compte_tva_deductible: '4452', taux: 0.18 }];
  const balance = [
    { compte: '4431', sfd: 0, sfc: 500000 },   // collectée = 500k
    { compte: '4452', sfd: 200000, sfc: 0 },   // déductible = 200k
    { compte: '6011', sfd: 800000, sfc: 0 },   // hors périmètre
  ];

  it('calcule TVA nette = collectée - déductible', () => {
    const r = calculerTva(balance, params, 0);
    expect(r.collectee).toBe(500000);
    expect(r.deductible).toBe(200000);
    expect(r.nette).toBe(300000);
    expect(r.aPayer).toBe(300000);
  });

  it('déduit un crédit de TVA reportable précédent', () => {
    const r = calculerTva(balance, params, 100000);
    expect(r.aPayer).toBe(200000);
  });

  it('renvoie un crédit reportable si nette < crédit précédent', () => {
    const r = calculerTva(balance, params, 400000);
    expect(r.aPayer).toBe(-100000);
  });
});
