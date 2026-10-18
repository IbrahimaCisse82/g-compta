// ─── MODULE SANTÉ — logique métier pure (SYSCOHADA) ─────────────────────
// Spécifique aux établissements de santé (cliniques, hôpitaux, pharmacies)
// de la zone OHADA.
// Fonctions pures : aucune dépendance Supabase, testables unitairement.

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// ─── Types ────────────────────────────────────────────

export type TypeActe = 'consultation' | 'soins' | 'hospitalisation' | 'chirurgie' | 'imagerie' | 'biologie' | 'pharmacie' | 'autre';

export type StatutPriseEnCharge = 'aucune' | 'partielle' | 'totale';

export type StatutFacture = 'brouillon' | 'emise' | 'payee' | 'partiellement_payee' | 'impayee';

export interface ActeMedical {
  id: string;
  code: string;
  designation: string;
  type: TypeActe;
  prix_unitaire: number;
  compte_vente: string;   // 7061 par défaut
  actif: boolean;
}

export interface LignePrestation {
  acte_id: string;
  code: string;
  designation: string;
  type: TypeActe;
  quantite: number;
  prix_unitaire: number;
}

export interface PriseEnCharge {
  organisme: string;
  taux: number;          // 0 → 1
  plafond: number | null;
  statut: StatutPriseEnCharge;
}

export interface FacturePatientInput {
  patient: string;
  date: string;
  lignes: LignePrestation[];
  prise_en_charge: PriseEnCharge | null;
  remise: number;
}

export interface LigneFactureCalculee {
  code: string;
  designation: string;
  type: TypeActe;
  quantite: number;
  prix_unitaire: number;
  montant_brut: number;
}

export interface FactureCalculee {
  lignes: LigneFactureCalculee[];
  total_brut: number;
  remise: number;
  net_patient: number;
  prise_en_charge: {
    organisme: string;
    taux: number;
    montant: number;
    plafond: number | null;
    statut: StatutPriseEnCharge;
  } | null;
  net_a_payer: number;     // ce que le patient paie de sa poche
  total_facture: number;   // net_patient (après remise, avant PC)
}

// ─── Comptes SYSCOHADA spécifiques santé ───────────────

export const COMPTES_SANTE = {
  vente_prestations: '7061',     // Prestations de services (actes médicaux)
  vente_pharmacie: '701',        // Ventes de marchandises (pharmacie)
  clients_patients: '4111',      // Clients — patients
  clients_organismes: '4112',    // Clients — organismes / mutuelles
  stocks_pharmacie: '331',       // Stocks de médicaments
  stocks_consommables: '332',    // Stocks de consommables médicaux
  achats_medicaments: '601',     // Achats de marchandises (médicaments)
  achats_consommables: '602',   // Achats de matières et fournitures
  variation_stock_pharma: '6031',
  variation_stock_conso: '6032',
} as const;

// ─── Catalogue d'actes par défaut ─────────────────────

export const CATALOGUE_DEFAUT: Omit<ActeMedical, 'id'>[] = [
  { code: 'CONS', designation: 'Consultation générale', type: 'consultation', prix_unitaire: 5000, compte_vente: '7061', actif: true },
  { code: 'CONSP', designation: 'Consultation spécialisée', type: 'consultation', prix_unitaire: 10000, compte_vente: '7061', actif: true },
  { code: 'SOINS', designation: 'Soins infirmiers', type: 'soins', prix_unitaire: 3000, compte_vente: '7061', actif: true },
  { code: 'PANSE', designation: 'Pansement simple', type: 'soins', prix_unitaire: 2000, compte_vente: '7061', actif: true },
  { code: 'HOSP1', designation: 'Hospitalisation — 1 jour', type: 'hospitalisation', prix_unitaire: 25000, compte_vente: '7061', actif: true },
  { code: 'HOSP3', designation: 'Hospitalisation — 3 jours', type: 'hospitalisation', prix_unitaire: 70000, compte_vente: '7061', actif: true },
  { code: 'CHIR', designation: 'Acte chirurgical', type: 'chirurgie', prix_unitaire: 150000, compte_vente: '7061', actif: true },
  { code: 'RADIO', designation: 'Radiologie standard', type: 'imagerie', prix_unitaire: 15000, compte_vente: '7061', actif: true },
  { code: 'ECHO', designation: 'Échographie', type: 'imagerie', prix_unitaire: 25000, compte_vente: '7061', actif: true },
  { code: 'BIO', designation: 'Bilan biologique standard', type: 'biologie', prix_unitaire: 10000, compte_vente: '7061', actif: true },
  { code: 'MED', designation: 'Médicament (unité)', type: 'pharmacie', prix_unitaire: 1000, compte_vente: '701', actif: true },
];

// ─── Calcul de facture ────────────────────────────────

/** Montant brut d'une ligne de prestation. */
export function montantLigne(ligne: LignePrestation): number {
  return round2((ligne.quantite || 0) * (ligne.prix_unitaire || 0));
}

/** Total brut de toutes les lignes. */
export function totalBrut(lignes: LignePrestation[]): number {
  return round2(lignes.reduce((s, l) => s + montantLigne(l), 0));
}

/** Montant pris en charge par l'organisme (dans la limite du plafond). */
export function calculerPriseEnCharge(netPatient: number, pc: PriseEnCharge | null): {
  organisme: string;
  taux: number;
  montant: number;
  plafond: number | null;
  statut: StatutPriseEnCharge;
} | null {
  if (!pc || pc.taux <= 0) return null;
  let montant = round2(netPatient * pc.taux);
  if (pc.plafond != null && montant > pc.plafond) {
    montant = round2(pc.plafond);
  }
  return {
    organisme: pc.organisme,
    taux: pc.taux,
    montant,
    plafond: pc.plafond,
    statut: pc.statut,
  };
}

/** Calcule une facture patient complète : lignes, totaux, prise en charge, net à payer. */
export function calculerFacture(input: FacturePatientInput): FactureCalculee {
  const brut = totalBrut(input.lignes);
  const remise = round2(Math.min(input.remise || 0, brut));
  const netPatient = round2(brut - remise);
  const pc = calculerPriseEnCharge(netPatient, input.prise_en_charge);
  const netAPayer = pc ? round2(netPatient - pc.montant) : netPatient;

  return {
    lignes: input.lignes.map(l => ({
      code: l.code,
      designation: l.designation,
      type: l.type,
      quantite: l.quantite,
      prix_unitaire: l.prix_unitaire,
      montant_brut: montantLigne(l),
    })),
    total_brut: brut,
    remise,
    net_patient: netPatient,
    prise_en_charge: pc,
    net_a_payer: netAPayer,
    total_facture: netPatient,
  };
}

// ─── Lignes d'écriture comptable ───────────────────────

export interface LigneEcriture {
  compte: string;
  intitule: string;
  debit: number;
  credit: number;
}

/**
 * Génère les lignes d'écriture comptable pour une facture patient.
 * - Débit 4111 (patient) pour le net à payer
 * - Débit 4112 (organisme) pour la prise en charge
 * - Crédit 7061/701 pour le total facture (net patient)
 */
export function lignesEcritureFacture(facture: FactureCalculee, patient: string): LigneEcriture[] {
  const lignes: LigneEcriture[] = [];

  // Débit : patient (net à payer de sa poche)
  if (facture.net_a_payer > 0) {
    lignes.push({
      compte: COMPTES_SANTE.clients_patients,
      intitule: `Patient — ${patient}`,
      debit: facture.net_a_payer,
      credit: 0,
    });
  }

  // Débit : organisme (prise en charge)
  if (facture.prise_en_charge && facture.prise_en_charge.montant > 0) {
    lignes.push({
      compte: COMPTES_SANTE.clients_organismes,
      intitule: `Organisme — ${facture.prise_en_charge.organisme}`,
      debit: facture.prise_en_charge.montant,
      credit: 0,
    });
  }

  // Crédit : prestations (7061) ou ventes (701) — répartition par type d'acte
  const parCompte = new Map<string, number>();
  for (const l of facture.lignes) {
    const compte = l.type === 'pharmacie' ? COMPTES_SANTE.vente_pharmacie : COMPTES_SANTE.vente_prestations;
    parCompte.set(compte, round2((parCompte.get(compte) || 0) + l.montant_brut));
  }
  // Appliquer la remise proportionnellement
  const totalBrut = facture.total_brut;
  for (const [compte, montant] of parCompte) {
    const ratio = totalBrut > 0 ? montant / totalBrut : 0;
    const netCompte = round2(montant - facture.remise * ratio);
    if (netCompte > 0) {
      lignes.push({
        compte,
        intitule: compte === COMPTES_SANTE.vente_pharmacie ? 'Ventes pharmacie' : 'Prestations de soins',
        debit: 0,
        credit: netCompte,
      });
    }
  }

  return lignes;
}

// ─── Statistiques ─────────────────────────────────────

export interface StatSante {
  nb_factures: number;
  ca_total: number;
  ca_patient: number;
  ca_organismes: number;
  impayes: number;
  taux_recouvrement: number;
  par_type: Record<TypeActe, number>;
}

export function calculerStats(factures: FactureCalculee[]): StatSante {
  const parType: Record<TypeActe, number> = {
    consultation: 0, soins: 0, hospitalisation: 0, chirurgie: 0,
    imagerie: 0, biologie: 0, pharmacie: 0, autre: 0,
  };
  let caTotal = 0, caPatient = 0, caOrganismes = 0, impayes = 0;

  for (const f of factures) {
    caTotal = round2(caTotal + f.total_facture);
    caPatient = round2(caPatient + f.net_a_payer);
    if (f.prise_en_charge) caOrganismes = round2(caOrganismes + f.prise_en_charge.montant);
    for (const l of f.lignes) {
      parType[l.type] = round2(parType[l.type] + l.montant_brut);
    }
  }

  const tauxRecouvrement = caTotal > 0 ? round2((caTotal - impayes) / caTotal) : 0;

  return {
    nb_factures: factures.length,
    ca_total: caTotal,
    ca_patient: caPatient,
    ca_organismes: caOrganismes,
    impayes,
    taux_recouvrement: tauxRecouvrement,
    par_type: parType,
  };
}

// ─── Consommables médicaux ─────────────────────────────

export interface ConsommableInput {
  code: string;
  designation: string;
  quantite: number;
  prix_unitaire: number;
  seuil_alerte: number;
}

export interface ConsommableStock extends ConsommableInput {
  valeur_stock: number;
  en_alerte: boolean;
}

export function evaluerConsommable(c: ConsommableInput): ConsommableStock {
  const valeur = round2(c.quantite * c.prix_unitaire);
  return {
    ...c,
    valeur_stock: valeur,
    en_alerte: c.quantite <= c.seuil_alerte,
  };
}

export function evaluerConsommables(items: ConsommableInput[]): ConsommableStock[] {
  return items.map(evaluerConsommable);
}

export function valeurTotaleConsommables(items: ConsommableStock[]): number {
  return round2(items.reduce((s, c) => s + c.valeur_stock, 0));
}

export function consommablesEnAlerte(items: ConsommableStock[]): number {
  return items.filter(c => c.en_alerte).length;
}
