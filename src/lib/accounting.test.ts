import { describe, it, expect } from 'vitest';
import { inRange, aggBalance, calc, calculerActifColonnes, ACTIF, PASSIF, CR, TFT, pf, type BalanceLine } from './accounting';

const bl = (compte: string, p: Partial<BalanceLine> = {}): BalanceLine => ({
  compte, intitule: '', sd: 0, sc: 0, md: 0, mc: 0, sfd: 0, sfc: 0, ...p,
});

describe('inRange', () => {
  it('inclut les descendants de la borne supérieure sans inclure le préfixe suivant', () => {
    expect(inRange('7011', [['701', '701']])).toBe(true);
    expect(inRange('7019', [['701', '701']])).toBe(true);
    expect(inRange('5851', [['521', '585']])).toBe(true);
    expect(inRange('47811', [['478', '478']])).toBe(true);
    expect(inRange('702', [['701', '701']])).toBe(false);
    expect(inRange('', [['701', '701']])).toBe(false);
  });
  it('matche les préfixes de comptes SYSCOHADA', () => {
    expect(inRange('521000', [['521', '585']])).toBe(true);
    expect(inRange('411100', [['411', '4198']])).toBe(true);
    expect(inRange('701', [['701', '701']])).toBe(true);
    expect(inRange('601', [['701', '708']])).toBe(false);
  });

  it('gère les plages à 1 chiffre (classes)', () => {
    expect(inRange('311', [['31', '39']])).toBe(true);
    expect(inRange('401', [['31', '39']])).toBe(false);
  });
});

describe('régressions de cohérence SYSCOHADA', () => {
  it('reprend une vente en sous-compte 7011 dans le chiffre d’affaires', () => {
    expect(calc([bl('7011', { mc: 150_000 })], CR).XB).toBe(150_000);
  });
  it('reprend la charge 651 dans les autres charges et le résultat', () => {
    const v = calc([bl('6511', { md: 50_000 })], CR);
    expect(v.RJ).toBe(50_000);
    expect(v.XI).toBe(-50_000);
  });
  it('classe 63 en services extérieurs et 64 en impôts sans double comptage', () => {
    const v = calc([bl('6311', { md: 20_000 }), bl('6411', { md: 30_000 })], CR);
    expect(v.RH).toBe(20_000);
    expect(v.RI).toBe(30_000);
    expect(v.RJ).toBe(0);
    expect(v.XI).toBe(-50_000);
  });
  it('la production stockée créditrice augmente le résultat', () => {
    const v = calc([bl('731', { mc: 100_000 })], CR);
    expect(v.TE).toBe(100_000);
    expect(v.XI).toBe(100_000);
  });
  it('le déstockage diminue le résultat sans inverser la variation des marchandises', () => {
    const v = calc([bl('731', { md: 40_000 }), bl('6031', { md: 10_000 })], CR);
    expect(v.TE).toBe(-40_000);
    expect(v.RB).toBe(10_000);
    expect(v.XI).toBe(-50_000);
  });
  it('déduit le capital non appelé des capitaux propres', () => {
    const v = calc([bl('101', { sfc: 1_000_000 }), bl('1091', { sfd: 200_000 })], PASSIF);
    expect(v.CB).toBe(-200_000);
    expect(v.CP).toBe(800_000);
    expect(v.DZ).toBe(800_000);
  });
  it('déduit 2844 du matériel : brut 1 million, amortissement 200 000, net 800 000', () => {
    const { brut, amort, net } = calculerActifColonnes([bl('2441', { sfd: 1_000_000 }), bl('28441', { sfc: 200_000 })]);
    expect(brut.AM).toBe(1_000_000);
    expect(amort.AM).toBe(200_000);
    expect(net.AM).toBe(800_000);
    expect(net.BZ).toBe(800_000);
    expect(brut.BZ - amort.BZ).toBe(net.BZ);
  });
  it('déduit les dépréciations des stocks, créances et placements', () => {
    const v = calc([bl('311', { sfd: 100_000 }), bl('391', { sfc: 10_000 }), bl('411', { sfd: 80_000 }), bl('491', { sfc: 20_000 }), bl('501', { sfd: 50_000 }), bl('590', { sfc: 5_000 })], ACTIF);
    expect(v.BB).toBe(90_000);
    expect(v.BI).toBe(60_000);
    expect(v.BQ).toBe(45_000);
    expect(v.BZ).toBe(195_000);
  });
  it('place 47811 uniquement au pied du bilan', () => {
    const v = calc([bl('47811', { sfd: 25_000 })], ACTIF);
    expect(v.BJ).toBe(0);
    expect(v.BU).toBe(25_000);
    expect(v.BZ).toBe(25_000);
  });
  it('classe la subvention 71 et les autres produits 75 au bon poste', () => {
    const v = calc([bl('711', { mc: 20_000 }), bl('754', { mc: 30_000 })], CR);
    expect(v.TG).toBe(20_000);
    expect(v.TH).toBe(30_000);
    expect(v.XI).toBe(50_000);
  });
});

describe('aggBalance', () => {
  it("mode auto : soldes pour le bilan (classes 1-5), mouvements pour la gestion", () => {
    const balance = [
      bl('521', { sfd: 1000, sfc: 200 }),   // bilan → solde 800
      bl('701', { mc: 5000 }),               // gestion → mouvement crédit
    ];
    expect(aggBalance(balance, [['521', '521']], 'D')).toBe(800);
    expect(aggBalance(balance, [['701', '701']], 'C', 'n')).toBe(5000);
  });

  it('sens SC : solde signé (report à nouveau négatif possible)', () => {
    const balance = [bl('129', { sfd: 0, sfc: 300 })];
    expect(aggBalance(balance, [['121', '129']], 'SC')).toBe(-300);
  });

  it('mode n1 : utilise les soldes d\'ouverture (sd/sc)', () => {
    const balance = [bl('521', { sd: 700, sc: 100, sfd: 5000 })];
    expect(aggBalance(balance, [['521', '521']], 'D', 'n1')).toBe(700);
  });
});

describe('pf (parsing de montants saisis)', () => {
  it('accepte virgule, espaces et espaces insécables', () => {
    expect(pf('1 250 000')).toBe(1250000);
    expect(pf('1 250,50')).toBe(1250.5);
    expect(pf('')).toBe(0);
  });
});

describe('mapping DSF — Bilan équilibré', () => {
  // Balance synthétique : capital 1 000 000, banque 600 000, stock 400 000
  const balance = [
    bl('101', { sfc: 1000000 }),
    bl('521', { sfd: 600000 }),
    bl('311', { sfd: 400000 }),
  ];

  it('TOTAL ACTIF = TOTAL PASSIF', () => {
    const a = calc(balance, ACTIF);
    const p = calc(balance, PASSIF);
    expect(a.BZ).toBe(1000000);
    expect(p.DZ).toBe(1000000);
    expect(a.BZ).toBe(p.DZ);
  });

  it('agrège correctement les sous-totaux (actif immobilisé, circulant, trésorerie)', () => {
    const a = calc(balance, ACTIF);
    expect(a.AZ).toBe(0);          // pas d\'immobilisations
    expect(a.BB).toBe(400000);     // stocks
    expect(a.BT).toBe(600000);     // trésorerie actif
  });
});

describe('mapping DSF — Compte de résultat', () => {
  // CA 701 = 1 000 000, achats 601 = 400 000, personnel 661 = 200 000, IS 891 = 30 000
  const balance = [
    bl('701', { mc: 1000000 }),
    bl('601', { md: 400000 }),
    bl('661', { md: 200000 }),
    bl('891', { md: 30000 }),
  ];

  it('chaîne de soldes intermédiaires SYSCOHADA', () => {
    const v = calc(balance, CR);
    expect(v.TA).toBe(1000000);
    expect(v.XA).toBe(600000);                       // marge commerciale
    expect(v.XB).toBe(1000000);                      // chiffre d\'affaires
    expect(v.XD).toBe(400000);                       // EBE = VA − personnel
    expect(v.XE).toBe(400000);                       // résultat d\'exploitation
    expect(v.XI).toBe(370000);                       // résultat net après IS
  });

  it('résultat net nul si aucune ligne', () => {
    const v = calc([], CR);
    expect(v.XI).toBe(0);
  });
});

describe('mapping DSF — TFT (contrôle de cohérence)', () => {
  it('trésorerie de clôture = ouverture + variation', () => {
    const balance = [
      bl('521', { sd: 500000, sfd: 650000 }),  // ouverture 500 k, clôture 650 k
    ];
    const extra = calc(balance, CR);
    const v = calc(balance, TFT, extra);
    expect(v.ZA).toBe(500000);                 // trésorerie au 1er janvier
    expect(v.ZH).toBe(v.ZG + v.ZA);            // contrôle ZH = G + A
  });
});

describe('passif : résultat et report à nouveau signés', () => {
  it('bénéfice 200 000 en 131 → +200 000 au poste CJ ; perte 50 000 en 139 → −50 000', async () => {
    const { calc, PASSIF } = await import('./accounting');
    const b = (compte: string, p: object) => ({ compte, intitule: '', sd: 0, sc: 0, md: 0, mc: 0, sfd: 0, sfc: 0, ...p });
    expect(calc([b('131', { sfc: 200_000 })], PASSIF).CJ).toBe(200_000);
    expect(calc([b('139', { sfd: 50_000 })], PASSIF).CJ).toBe(-50_000);
    expect(calc([b('121', { sfc: 30_000 })], PASSIF).CH).toBe(30_000);
  });
});
