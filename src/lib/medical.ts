// ─── Module médical : types & règles métier ──────────────────────────────
// Vocabulaire neutre labo / cabinet : patient, acte, prescripteur, assureur.

import { supabase } from '@/integrations/supabase/client';

/**
 * Vue non typée du client Supabase, réservée aux tables du module médical.
 * Les types générés (integrations/supabase/types.ts) ne les connaissent pas
 * tant que la migration n'a pas été appliquée puis les types régénérés.
 */
export const db = supabase as unknown as {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export type CategorieActe = 'consultation' | 'analyse' | 'acte_infirmier' | 'imagerie';
export type TypeAssureur = 'ipm' | 'mutuelle' | 'assurance' | 'autre';
export type MoyenPaiement = 'especes' | 'mobile_money' | 'virement' | 'cheque' | 'organisme';
export type StatutFactureMedicale = 'brouillon' | 'a_encaisser' | 'partiellement_reglee' | 'reglee' | 'annulee';
export type StatutAffiche = StatutFactureMedicale | 'impayee';

export interface Patient {
  id: string;
  entreprise_id: string;
  numero_dossier: string;
  nom: string;
  prenom?: string | null;
  date_naissance?: string | null;
  sexe?: 'M' | 'F' | null;
  telephone?: string | null;
  email?: string | null;
  adresse?: string | null;
  ninea?: string | null;
  rccm?: string | null;
  client_id?: string | null;
  notes?: string | null;
  actif: boolean;
}

export interface ActeMedical {
  id: string;
  entreprise_id: string;
  code: string;
  libelle: string;
  categorie: CategorieActe;
  tarif: number;
  actif: boolean;
}

export interface Assureur {
  id: string;
  entreprise_id: string;
  code: string;
  nom: string;
  type: TypeAssureur;
  taux_defaut: number;
  telephone?: string | null;
  email?: string | null;
  adresse?: string | null;
  actif: boolean;
}

export interface PatientAssurance {
  id: string;
  entreprise_id: string;
  patient_id: string;
  assureur_id: string;
  numero_adherent?: string | null;
  ordre: number;
  actif: boolean;
}

export interface AssureurTaux {
  id: string;
  entreprise_id: string;
  assureur_id: string;
  acte_id: string;
  taux: number;
}

export interface FactureMedicale {
  id: string;
  entreprise_id: string;
  exercice_id: string;
  patient_id: string;
  assureur_id?: string | null;
  numero: string;
  date_facture: string;
  date_echeance?: string | null;
  prescripteur?: string | null;
  objet?: string | null;
  total_ht: number;
  total_part_patient: number;
  total_part_organisme: number;
  statut: StatutFactureMedicale;
  comptabilisee: boolean;
  notes?: string | null;
}

export interface FactureMedicaleLigne {
  id?: string;
  facture_id?: string;
  acte_id?: string | null;
  designation: string;
  quantite: number;
  prix_unitaire: number;
  remise_pct: number;
  montant_ht: number;
  taux_couverture: number;
  part_organisme: number;
  part_patient: number;
  ordre: number;
}

export interface EncaissementMedical {
  id: string;
  entreprise_id: string;
  facture_id: string;
  date_reglement: string;
  montant: number;
  moyen_paiement: MoyenPaiement;
  reference?: string | null;
  notes?: string | null;
  created_at: string;
}

// ─── Référentiels ────────────────────────────────────────────────────────
export const CATEGORIES_ACTE: { value: CategorieActe; label: string }[] = [
  { value: 'consultation', label: 'Consultation' },
  { value: 'analyse', label: 'Analyse' },
  { value: 'acte_infirmier', label: 'Acte infirmier' },
  { value: 'imagerie', label: 'Imagerie' },
];

export const TYPES_ASSUREUR: { value: TypeAssureur; label: string }[] = [
  { value: 'ipm', label: 'IPM' },
  { value: 'mutuelle', label: 'Mutuelle' },
  { value: 'assurance', label: 'Assurance privée' },
  { value: 'autre', label: 'Autre' },
];

export const MOYENS_PAIEMENT: { value: MoyenPaiement; label: string }[] = [
  { value: 'especes', label: 'Espèces' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'virement', label: 'Virement' },
  { value: 'cheque', label: 'Chèque' },
  { value: 'organisme', label: 'Part organisme' },
];

export const labelCategorie = (c: CategorieActe) =>
  CATEGORIES_ACTE.find(x => x.value === c)?.label || c;

export const labelMoyen = (m: MoyenPaiement) =>
  MOYENS_PAIEMENT.find(x => x.value === m)?.label || m;

// ─── Calculs ─────────────────────────────────────────────────────────────
export const todayISO = () => new Date().toISOString().slice(0, 10);

/** Montant HT d'une ligne après remise. */
export function montantLigneHT(quantite: number, prixUnitaire: number, remisePct: number): number {
  const brut = (quantite || 0) * (prixUnitaire || 0);
  return Math.round(brut * (1 - (remisePct || 0) / 100));
}

/** Ventilation d'un montant entre part organisme et part patient. */
export function repartition(montantHT: number, tauxCouverture: number) {
  const partOrganisme = Math.round((montantHT || 0) * (tauxCouverture || 0) / 100);
  return { partOrganisme, partPatient: (montantHT || 0) - partOrganisme };
}

/** Recalcule une ligne complète (HT + ventilation) à partir de ses paramètres. */
export function recalculerLigne(l: FactureMedicaleLigne): FactureMedicaleLigne {
  const ht = montantLigneHT(l.quantite, l.prix_unitaire, l.remise_pct);
  const { partOrganisme, partPatient } = repartition(ht, l.taux_couverture);
  return { ...l, montant_ht: ht, part_organisme: partOrganisme, part_patient: partPatient };
}

export function totauxFacture(lignes: FactureMedicaleLigne[]) {
  return {
    ht: lignes.reduce((s, l) => s + (l.montant_ht || 0), 0),
    partOrganisme: lignes.reduce((s, l) => s + (l.part_organisme || 0), 0),
    partPatient: lignes.reduce((s, l) => s + (l.part_patient || 0), 0),
  };
}

/** Taux applicable à un acte pour un assureur : taux spécifique, sinon taux de repli. */
export function tauxPourActe(assureur: Assureur | null | undefined, acteId: string, taux: AssureurTaux[]): number {
  if (!assureur) return 0;
  const specifique = taux.find(t => t.assureur_id === assureur.id && t.acte_id === acteId);
  return specifique ? Number(specifique.taux) : Number(assureur.taux_defaut || 0);
}

// ─── Statuts ─────────────────────────────────────────────────────────────
export const STATUTS: Record<StatutAffiche, { label: string; cls: string }> = {
  brouillon: { label: 'Brouillon', cls: 'bg-bg3 text-fg3' },
  a_encaisser: { label: 'À encaisser', cls: 'bg-primary/15 text-primary' },
  partiellement_reglee: { label: 'Partiellement réglée', cls: 'bg-purple/15 text-purple' },
  reglee: { label: 'Réglée', cls: 'bg-accent/15 text-accent' },
  impayee: { label: 'Impayée', cls: 'bg-destructive/15 text-destructive' },
  annulee: { label: 'Annulée', cls: 'bg-destructive/15 text-destructive' },
};

/**
 * Statut affiché : le statut stocké fait foi, sauf pour le retard de paiement
 * qui est dérivé de l'échéance et du total déjà encaissé.
 */
export function statutAffiche(
  f: Pick<FactureMedicale, 'statut' | 'date_echeance' | 'total_ht'>,
  totalEncaisse: number,
): StatutAffiche {
  if (f.statut === 'annulee' || f.statut === 'brouillon') return f.statut;
  if (totalEncaisse >= (f.total_ht || 0) - 0.01) return 'reglee';
  if (f.date_echeance && f.date_echeance < todayISO()) return 'impayee';
  if (totalEncaisse > 0) return 'partiellement_reglee';
  return 'a_encaisser';
}

/** Statut à persister après un encaissement. */
export function statutApresEncaissement(totalHT: number, totalEncaisse: number): StatutFactureMedicale {
  if (totalEncaisse >= totalHT - 0.01) return 'reglee';
  if (totalEncaisse > 0) return 'partiellement_reglee';
  return 'a_encaisser';
}

// ─── Détection du module non installé ────────────────────────────────────
/** Vrai si l'erreur signifie que les tables médicales n'existent pas encore. */
export function isModuleAbsent(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === 'PGRST205' || e.code === '42P01') return true;
  return /Could not find the table|does not exist|schema cache/i.test(e.message || '');
}
