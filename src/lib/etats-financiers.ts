// Contrôles de rapprochement entre états financiers SYSCOHADA (Bilan, CR, TFT).
// Fonctions pures : aucune lecture réseau, testées dans etats-financiers.test.ts.
import { calc, ACTIF, PASSIF, CR, TFT, type BalanceLine } from './accounting';

export interface Rapprochement {
  code: 'BILAN_EQUILIBRE' | 'RESULTAT_CR_BILAN' | 'TRESORERIE_TFT';
  libelle: string;
  attendu: number;
  obtenu: number;
  ecart: number;
  ok: boolean;
}

/** Tolérance : 1 franc CFA (arrondi unique en sortie). */
const TOL = 1;
const r = (n: number) => Math.round(n);

export function calculerEtats(balance: BalanceLine[]) {
  const vA = calc(balance, ACTIF);
  const vP = calc(balance, PASSIF);
  const vCR = calc(balance, CR);
  const vT = calc(balance, TFT, { XI: vCR.XI || 0 });
  return { vA, vP, vCR, vT };
}

export function rapprocherEtats(balance: BalanceLine[]): Rapprochement[] {
  const { vA, vP, vCR, vT } = calculerEtats(balance);
  const actif = vA.BZ || 0;
  const passif = vP.DZ || 0;
  const resCR = vCR.XI || 0;
  const resBilan = vP.CJ || 0;
  // Avant clôture, le résultat n'est pas encore porté en 13x : il comble l'écart actif/passif.
  const resultatNonPorte = resCR - resBilan;
  const tresoBilan = (vA.BT || 0) - (vP.DT || 0);
  const tresoTFT = vT.ZH || 0;

  const mk = (code: Rapprochement['code'], libelle: string, attendu: number, obtenu: number): Rapprochement => {
    const ecart = r(obtenu - attendu);
    return { code, libelle, attendu: r(attendu), obtenu: r(obtenu), ecart, ok: Math.abs(ecart) <= TOL };
  };

  const out: Rapprochement[] = [
    mk('BILAN_EQUILIBRE', 'Total actif = total passif (+ résultat non encore porté)', passif + resultatNonPorte, actif),
    mk('TRESORERIE_TFT', 'Trésorerie nette de clôture TFT = trésorerie nette du bilan', tresoBilan, tresoTFT),
  ];
  if (Math.abs(resBilan) > TOL) {
    out.splice(1, 0, mk('RESULTAT_CR_BILAN', 'Résultat net CR (XI) = résultat au bilan (CJ)', resCR, resBilan));
  }
  return out;
}
