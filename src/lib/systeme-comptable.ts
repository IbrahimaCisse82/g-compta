/** Écrans d'états financiers réservés au système normal SYSCOHADA (CA-3.3). */
export const PAGES_ETATS_SYSTEME_NORMAL = ['bilan', 'resultat', 'tft', 'liasse', 'note34'] as const;

export function estDossierSmt(systeme?: string | null): boolean {
  return systeme === 'smt';
}

/** Vrai si l'écran doit être refusé pour ce dossier (aucun état produit). */
export function etatRefuse(page: string, systeme?: string | null): boolean {
  return estDossierSmt(systeme) && (PAGES_ETATS_SYSTEME_NORMAL as readonly string[]).includes(page);
}

export const MESSAGE_SMT_HORS_PERIMETRE =
  "Dossier au Système Minimal de Trésorerie (SMT) : hors périmètre de la version actuelle. Aucun état financier n'est produit pour ce dossier.";
