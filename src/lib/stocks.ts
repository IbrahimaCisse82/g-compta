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
