// ─── GESTION DES STOCKS — logique métier pure (CUMP) ─────────────────────
// SYSCOHADA révisé : valorisation des sorties au Coût Unitaire Moyen Pondéré.
// Fonctions pures : aucune dépendance Supabase, testables unitairement.

export type TypeMouvement = 'entree' | 'sortie' | 'inventaire' | 'ajustement';

export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const round4 = (n: number): number => Math.round(n * 10000) / 10000;

export interface MouvementInput {
  type: TypeMouvement;
  stockAvant: number;
  cumpAvant: number;
  quantite: number;
  prixUnitaire: number;
}

export interface MouvementResult {
  qteApres: number;
  cumpApres: number;
  montant: number;
  /** Prix unitaire retenu pour la ligne de mouvement (CUMP pour une sortie). */
  prixUtilise: number;
}

/**
 * Calcule l'état du stock après un mouvement.
 * - entree     : réévalue le CUMP = (stock×cump + q×pu) / (stock+q)
 * - sortie     : valorisée au CUMP courant, stock insuffisant → erreur
 * - inventaire : constat physique, la quantité devient le stock
 * - ajustement : entrée valorisée au CUMP courant
 */
export function calculerMouvement({ type, stockAvant, cumpAvant, quantite, prixUnitaire }: MouvementInput): MouvementResult {
  if (!(quantite > 0)) throw new Error('Quantité > 0 requise');

  switch (type) {
    case 'entree': {
      const qteApres = stockAvant + quantite;
      const cumpApres = qteApres > 0
        ? (stockAvant * cumpAvant + quantite * prixUnitaire) / qteApres
        : prixUnitaire;
      return { qteApres, cumpApres: round4(cumpApres), montant: round2(quantite * prixUnitaire), prixUtilise: prixUnitaire };
    }
    case 'sortie': {
      if (quantite > stockAvant) throw new Error('Stock insuffisant');
      const qteApres = stockAvant - quantite;
      return { qteApres, cumpApres: round4(cumpAvant), montant: round2(quantite * cumpAvant), prixUtilise: cumpAvant };
    }
    case 'inventaire': {
      const qteApres = quantite;
      const cumpApres = prixUnitaire || cumpAvant;
      return { qteApres, cumpApres: round4(cumpApres), montant: round2(qteApres * cumpApres), prixUtilise: cumpApres };
    }
    case 'ajustement': {
      const qteApres = stockAvant + quantite;
      return { qteApres, cumpApres: round4(cumpAvant), montant: round2(quantite * cumpAvant), prixUtilise: cumpAvant };
    }
  }
}

export interface ArticleValorise {
  quantite_stock: number;
  prix_achat_moyen: number;
  stock_minimum: number;
  actif: boolean;
}

/** Valeur totale du stock (Σ quantité × CUMP). */
export function valeurStock(articles: ArticleValorise[]): number {
  return articles.reduce((s, a) => s + a.quantite_stock * a.prix_achat_moyen, 0);
}

/** Nombre d'articles actifs en rupture (stock ≤ stock minimum). */
export function compterRuptures(articles: ArticleValorise[]): number {
  return articles.filter(a => a.actif && a.quantite_stock <= a.stock_minimum).length;
}

// ─── COMPTABILISATION DES MOUVEMENTS — inventaire permanent (SYSCOHADA) ──
// Entrée   : débit 3XX (stock)      / crédit 603X (variation de stocks)
// Sortie   : débit 603X (variation) / crédit 3XX (stock)
// Inventaire / ajustement : écart valorisé, même logique selon le sens.

export interface LigneStockComptable {
  compte: string;
  intitule: string;
  debit: number;
  credit: number;
}

export interface EcritureStockInput {
  type: TypeMouvement;
  compteStock: string;
  compteVariation: string;
  designation: string;
  /** Valeur du mouvement (positive). Pour inventaire : valeur après − valeur avant. */
  montant: number;
}

/**
 * Construit les deux lignes équilibrées d'un mouvement de stock.
 * Retourne [] si le montant est nul (aucune écriture à passer).
 */
export function lignesEcritureStock({ type, compteStock, compteVariation, designation, montant }: EcritureStockInput): LigneStockComptable[] {
  const m = round2(Math.abs(montant));
  if (!(m > 0)) return [];
  const entree = montant > 0 ? type !== 'sortie' : false;
  const sensEntree = type === 'entree' ? true : type === 'sortie' ? false : entree;
  const stock = { compte: compteStock, intitule: `Stock ${designation}`, debit: sensEntree ? m : 0, credit: sensEntree ? 0 : m };
  const variation = { compte: compteVariation, intitule: `Variation de stocks ${designation}`, debit: sensEntree ? 0 : m, credit: sensEntree ? m : 0 };
  return [stock, variation];
}

/** Variation de valeur induite par un mouvement (valeur après − valeur avant). */
export function variationValeur(stockAvant: number, cumpAvant: number, qteApres: number, cumpApres: number): number {
  return round2(qteApres * cumpApres - stockAvant * cumpAvant);
}

// ══════════════════════════════════════════════════════════
// DÉPRÉCIATION DES STOCKS (SYSCOHADA — comptes 39X / 6593 / 7593)
// ══════════════════════════════════════════════════════════

/** Compte de dépréciation d'un stock : 3XX → 39XX */
export function compteDeprecStock(compteStock: string): string {
  const c = String(compteStock || '').trim();
  return '39' + c.slice(1);
}

/**
 * Dépréciation requise = valeur comptable − valeur nette de réalisation (si positive).
 * Aucune dépréciation si la valeur de réalisation est supérieure ou égale au coût.
 */
export function depreciationRequise(valeurComptable: number, valeurRealisation: number): number {
  return round2(Math.max(0, (valeurComptable || 0) - (valeurRealisation || 0)));
}

export interface DepreciationStockInput {
  compteStock: string;
  designation: string;
  valeurComptable: number;
  valeurRealisation: number;
  /** Dépréciation déjà comptabilisée sur cet article */
  deprecExistante?: number;
}

/**
 * Ajuste la dépréciation d'un stock : dotation (6593) si elle augmente,
 * reprise (7593) si elle diminue. Retourne [] si aucun ajustement n'est nécessaire.
 */
export function lignesDepreciationStock({
  compteStock, designation, valeurComptable, valeurRealisation, deprecExistante = 0,
}: DepreciationStockInput): LigneStockComptable[] {
  const cible = depreciationRequise(valeurComptable, valeurRealisation);
  const ecart = round2(cible - round2(deprecExistante));
  if (ecart === 0) return [];
  const compteDeprec = compteDeprecStock(compteStock);
  const m = Math.abs(ecart);
  if (ecart > 0) {
    return [
      { compte: '6593', intitule: `Charges pour dépréciation des stocks — ${designation}`, debit: m, credit: 0 },
      { compte: compteDeprec, intitule: `Dépréciation stock ${designation}`, debit: 0, credit: m },
    ];
  }
  return [
    { compte: compteDeprec, intitule: `Dépréciation stock ${designation}`, debit: m, credit: 0 },
    { compte: '7593', intitule: `Reprise de charges provisionnées — ${designation}`, debit: 0, credit: m },
  ];
}
