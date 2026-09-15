import { describe, it, expect } from 'vitest';
import {
  compteAvanceClient,
  compteAvanceFournisseur,
  lignesReglementClient,
  lignesReglementFournisseur,
  lignesImputationAvanceClient,
  lignesImputationAvanceFournisseur,
} from './reglements';

describe('comptes d\'avances', () => {
  it('dérive 4191 depuis un compte client', () => {
    expect(compteAvanceClient('411')).toBe('4191');
    expect(compteAvanceClient('411CLI')).toBe('4191CLI');
    expect(compteAvanceClient('4191CLI')).toBe('4191CLI');
  });
  it('dérive 4091 depuis un compte fournisseur', () => {
    expect(compteAvanceFournisseur('401')).toBe('4091');
    expect(compteAvanceFournisseur('401FRN')).toBe('4091FRN');
  });
});

describe('règlements', () => {
  const base = { compteTiers: '411CLI', compteTresorerie: '521', montant: 100000, libelle: 'Règlement' };

  it('encaissement client sur solde : 521 D / 411 C', () => {
    const l = lignesReglementClient({ ...base, type: 'solde' });
    expect(l[0]).toMatchObject({ compte: '521', debit: 100000 });
    expect(l[1]).toMatchObject({ compte: '411CLI', credit: 100000 });
  });

  it('acompte client : crédite 4191 et non 411', () => {
    const l = lignesReglementClient({ ...base, type: 'acompte' });
    expect(l[1].compte).toBe('4191CLI');
  });

  it('acompte fournisseur : débite 4091', () => {
    const l = lignesReglementFournisseur({ compteTiers: '401FRN', compteTresorerie: '521', montant: 50000, type: 'acompte', libelle: 'Acompte' });
    expect(l[0].compte).toBe('4091FRN');
    expect(l[1]).toMatchObject({ compte: '521', credit: 50000 });
  });

  it('montant nul ou négatif ne génère aucune ligne', () => {
    expect(lignesReglementClient({ ...base, montant: 0, type: 'solde' })).toEqual([]);
    expect(lignesReglementFournisseur({ ...base, montant: -5, type: 'solde' })).toEqual([]);
  });

  it('les écritures sont équilibrées', () => {
    for (const l of [lignesReglementClient({ ...base, type: 'acompte' }), lignesReglementFournisseur({ ...base, type: 'solde' })]) {
      const d = l.reduce((s, x) => s + (x.debit || 0), 0);
      const c = l.reduce((s, x) => s + (x.credit || 0), 0);
      expect(d).toBe(c);
    }
  });
});

describe('imputation des avances', () => {
  it('client : 4191 D / 411 C', () => {
    const l = lignesImputationAvanceClient('411CLI', 30000, 'Imputation');
    expect(l[0]).toMatchObject({ compte: '4191CLI', debit: 30000 });
    expect(l[1]).toMatchObject({ compte: '411CLI', credit: 30000 });
  });
  it('fournisseur : 401 D / 4091 C', () => {
    const l = lignesImputationAvanceFournisseur('401FRN', 30000, 'Imputation');
    expect(l[0]).toMatchObject({ compte: '401FRN', debit: 30000 });
    expect(l[1]).toMatchObject({ compte: '4091FRN', credit: 30000 });
  });
});
