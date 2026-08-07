import { describe, it, expect } from 'vitest';
import { totauxLignes, validerEcritureLocalement, round2, JOURNAUX_NORMALISES } from './ecritures';

const base = {
  entrepriseId: 'e1', exerciceId: 'x1', journalCode: 'OD', date: '2026-01-31', libelle: 'Test',
};

describe('totauxLignes', () => {
  it('somme débits et crédits et détecte l\u2019équilibre', () => {
    const t = totauxLignes([{ compte: '601', debit: 1000 }, { compte: '401', credit: 1000 }]);
    expect(t.debit).toBe(1000);
    expect(t.credit).toBe(1000);
    expect(t.equilibre).toBe(true);
  });

  it('détecte un déséquilibre', () => {
    const t = totauxLignes([{ compte: '601', debit: 1000 }, { compte: '401', credit: 900 }]);
    expect(t.equilibre).toBe(false);
  });

  it('refuse une écriture de montant nul', () => {
    expect(totauxLignes([{ compte: '601', debit: 0 }, { compte: '401', credit: 0 }]).equilibre).toBe(false);
  });
});

describe('round2', () => {
  it('arrondit au centime', () => {
    expect(round2(1000.005)).toBe(1000.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe('validerEcritureLocalement', () => {
  it('accepte une écriture équilibrée sur journal normalisé', () => {
    expect(validerEcritureLocalement({
      ...base, lignes: [{ compte: '601', debit: 500 }, { compte: '401', credit: 500 }],
    })).toBeNull();
  });

  it('rejette un code journal non normalisé', () => {
    expect(validerEcritureLocalement({
      ...base, journalCode: 'ZZ', lignes: [{ compte: '601', debit: 500 }, { compte: '401', credit: 500 }],
    })).toMatch(/journal/i);
  });

  it('rejette une écriture à une seule ligne', () => {
    expect(validerEcritureLocalement({ ...base, lignes: [{ compte: '601', debit: 500 }] }))
      .toMatch(/deux lignes/);
  });

  it('rejette une ligne sans compte', () => {
    expect(validerEcritureLocalement({
      ...base, lignes: [{ compte: '', debit: 500 }, { compte: '401', credit: 500 }],
    })).toMatch(/compte/);
  });

  it('rejette un déséquilibre', () => {
    expect(validerEcritureLocalement({
      ...base, lignes: [{ compte: '601', debit: 500 }, { compte: '401', credit: 499 }],
    })).toMatch(/déséquilibrée/);
  });

  it('couvre les 7 journaux SYSCOHADA normalisés', () => {
    expect(JOURNAUX_NORMALISES).toEqual(['AN', 'AC', 'VT', 'BQ', 'CA', 'OD', 'PA']);
    for (const j of JOURNAUX_NORMALISES) {
      expect(validerEcritureLocalement({
        ...base, journalCode: j, lignes: [{ compte: '601', debit: 1 }, { compte: '401', credit: 1 }],
      })).toBeNull();
    }
  });
});
