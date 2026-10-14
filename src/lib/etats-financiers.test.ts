import { describe, it, expect } from 'vitest';
import { rapprocherEtats } from './etats-financiers';
import type { BalanceLine } from './accounting';

const bl = (compte: string, p: Partial<BalanceLine> = {}): BalanceLine => ({
  compte, intitule: '', sd: 0, sc: 0, md: 0, mc: 0, sfd: 0, sfc: 0, ...p,
});
const get = (b: BalanceLine[], c: string) => rapprocherEtats(b).find(x => x.code === c);

describe('rapprochements des états', () => {
  // Capital 1 000 000 en banque, vente 300 000 encaissée, achat 100 000 payé
  const avantCloture = [
    bl('101', { sfc: 1_000_000, mc: 1_000_000 }),
    bl('521', { sfd: 1_200_000, md: 1_300_000, mc: 100_000 }),
    bl('701', { mc: 300_000, sfc: 300_000 }),
    bl('601', { md: 100_000, sfd: 100_000 }),
  ];

  it("avant clôture : actif = passif + résultat de 200 000", () => {
    const x = get(avantCloture, 'BILAN_EQUILIBRE')!;
    expect(x.obtenu).toBe(1_200_000);
    expect(x.ok).toBe(true);
  });

  it('après clôture : résultat CR = résultat bilan (200 000)', () => {
    const apres = [...avantCloture, bl('131', { sfc: 200_000 })];
    const x = get(apres, 'RESULTAT_CR_BILAN')!;
    expect(x.obtenu).toBe(200_000);
    expect(x.ok).toBe(true);
  });

  it('détecte un bilan déséquilibré', () => {
    const faux = [...avantCloture, bl('411', { sfd: 50_000 })];
    expect(get(faux, 'BILAN_EQUILIBRE')!.ok).toBe(false);
    expect(get(faux, 'BILAN_EQUILIBRE')!.ecart).toBe(50_000);
  });

  it("le contrôle résultat n'est pas produit tant que 13x est vide", () => {
    expect(get(avantCloture, 'RESULTAT_CR_BILAN')).toBeUndefined();
  });

  it('trésorerie de clôture du bilan = 1 200 000', () => {
    expect(get(avantCloture, 'TRESORERIE_TFT')!.attendu).toBe(1_200_000);
  });
});
