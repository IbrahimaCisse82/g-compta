import { describe, it, expect } from 'vitest';
import { calculerMouvement, valeurStock, compterRuptures } from './stocks';

describe('calculerMouvement — entrée (CUMP)', () => {
  it('recalcule le CUMP pondéré après une entrée', () => {
    // 10 u à 100 + 10 u à 200 → CUMP = 150
    const r = calculerMouvement({ type: 'entree', stockAvant: 10, cumpAvant: 100, quantite: 10, prixUnitaire: 200 });
    expect(r.qteApres).toBe(20);
    expect(r.cumpApres).toBe(150);
    expect(r.montant).toBe(2000);
    expect(r.prixUtilise).toBe(200);
  });

  it('première entrée sur stock vide : CUMP = prix unitaire', () => {
    const r = calculerMouvement({ type: 'entree', stockAvant: 0, cumpAvant: 0, quantite: 5, prixUnitaire: 350 });
    expect(r.qteApres).toBe(5);
    expect(r.cumpApres).toBe(350);
    expect(r.montant).toBe(1750);
  });

  it('rejette une quantité nulle ou négative', () => {
    expect(() => calculerMouvement({ type: 'entree', stockAvant: 10, cumpAvant: 100, quantite: 0, prixUnitaire: 100 })).toThrow();
    expect(() => calculerMouvement({ type: 'entree', stockAvant: 10, cumpAvant: 100, quantite: -3, prixUnitaire: 100 })).toThrow();
  });
});

describe('calculerMouvement — sortie', () => {
  it('valorise la sortie au CUMP courant sans le modifier', () => {
    const r = calculerMouvement({ type: 'sortie', stockAvant: 20, cumpAvant: 150, quantite: 8, prixUnitaire: 999 });
    expect(r.qteApres).toBe(12);
    expect(r.cumpApres).toBe(150);
    expect(r.montant).toBe(1200);
    expect(r.prixUtilise).toBe(150);
  });

  it('rejette une sortie supérieure au stock', () => {
    expect(() => calculerMouvement({ type: 'sortie', stockAvant: 5, cumpAvant: 100, quantite: 6, prixUnitaire: 0 })).toThrow('Stock insuffisant');
  });
});

describe('calculerMouvement — inventaire & ajustement', () => {
  it('inventaire : le constat devient le stock', () => {
    const r = calculerMouvement({ type: 'inventaire', stockAvant: 50, cumpAvant: 100, quantite: 47, prixUnitaire: 0 });
    expect(r.qteApres).toBe(47);
    expect(r.cumpApres).toBe(100); // PU non fourni → CUMP conservé
    expect(r.montant).toBe(4700);
  });

  it('ajustement : entrée valorisée au CUMP', () => {
    const r = calculerMouvement({ type: 'ajustement', stockAvant: 10, cumpAvant: 200, quantite: 2, prixUnitaire: 0 });
    expect(r.qteApres).toBe(12);
    expect(r.montant).toBe(400);
  });
});

describe('indicateurs', () => {
  const articles = [
    { quantite_stock: 10, prix_achat_moyen: 100, stock_minimum: 5, actif: true },
    { quantite_stock: 2, prix_achat_moyen: 500, stock_minimum: 5, actif: true },   // rupture
    { quantite_stock: 0, prix_achat_moyen: 100, stock_minimum: 1, actif: false },  // inactif : ignoré
  ];

  it('valeurStock = Σ qté × CUMP', () => {
    expect(valeurStock(articles)).toBe(2000);
  });

  it('compterRuptures ne compte que les articles actifs ≤ stock min', () => {
    expect(compterRuptures(articles)).toBe(1);
  });
});

describe('dépréciation des stocks (39X)', () => {
  it('déduit le compte 39X du compte de stock', () => {
    expect(compteDeprecStock('311')).toBe('391');
    expect(compteDeprecStock('3211')).toBe('3921');
  });

  it('aucune dépréciation si la valeur de réalisation couvre le coût', () => {
    expect(depreciationRequise(100000, 120000)).toBe(0);
    expect(lignesDepreciationStock({ compteStock: '311', designation: 'Riz', valeurComptable: 100000, valeurRealisation: 120000 })).toEqual([]);
  });

  it('dotation 6593 quand la valeur de réalisation est inférieure au coût', () => {
    const l = lignesDepreciationStock({ compteStock: '311', designation: 'Riz', valeurComptable: 100000, valeurRealisation: 80000 });
    expect(l.map(x => x.compte)).toEqual(['6593', '391']);
    expect(l[0].debit).toBe(20000);
    expect(l[1].credit).toBe(20000);
  });

  it('reprise 7593 quand la dépréciation antérieure devient excessive', () => {
    const l = lignesDepreciationStock({ compteStock: '311', designation: 'Riz', valeurComptable: 100000, valeurRealisation: 95000, deprecExistante: 20000 });
    expect(l.map(x => x.compte)).toEqual(['391', '7593']);
    expect(l[0].debit).toBe(15000);
  });

  it('aucune écriture si la dépréciation est déjà au bon niveau', () => {
    expect(lignesDepreciationStock({ compteStock: '311', designation: 'Riz', valeurComptable: 100000, valeurRealisation: 80000, deprecExistante: 20000 })).toEqual([]);
  });
});
