import { describe, it, expect } from 'vitest';
import {
  montantLigne, totalBrut, calculerPriseEnCharge, calculerFacture,
  lignesEcritureFacture, calculerStats, evaluerConsommable, evaluerConsommables,
  valeurTotaleConsommables, consommablesEnAlerte,
  COMPTES_SANTE, CATALOGUE_DEFAUT,
  type LignePrestation, type PriseEnCharge, type FacturePatientInput,
} from './sante';

// ─── Helpers ───────────────────────────────────────────

const ligne = (code: string, designation: string, type: any, qte: number, pu: number): LignePrestation =>
  ({ acte_id: '', code, designation, type, quantite: qte, prix_unitaire: pu });

const pcPartielle = (taux: number, plafond: number | null = null): PriseEnCharge =>
  ({ organisme: 'IPM', taux, plafond, statut: 'partielle' });

// ─── montantLigne ───────────────────────────────────────

describe('montantLigne', () => {
  it('calcule le montant brut d\'une ligne', () => {
    expect(montantLigne(ligne('CONS', 'Consultation', 'consultation', 2, 5000))).toBe(10000);
  });
  it('retourne 0 si quantité nulle', () => {
    expect(montantLigne(ligne('CONS', 'Consultation', 'consultation', 0, 5000))).toBe(0);
  });
  it('retourne 0 si prix nul', () => {
    expect(montantLigne(ligne('CONS', 'Consultation', 'consultation', 3, 0))).toBe(0);
  });
});

// ─── totalBrut ─────────────────────────────────────────

describe('totalBrut', () => {
  it('additionne les montants de toutes les lignes', () => {
    const lignes = [
      ligne('CONS', 'Consultation', 'consultation', 1, 5000),
      ligne('RADIO', 'Radio', 'imagerie', 2, 15000),
    ];
    expect(totalBrut(lignes)).toBe(35000);
  });
  it('retourne 0 pour un tableau vide', () => {
    expect(totalBrut([])).toBe(0);
  });
});

// ─── calculerPriseEnCharge ─────────────────────────────

describe('calculerPriseEnCharge', () => {
  it('retourne null si aucune prise en charge', () => {
    expect(calculerPriseEnCharge(50000, null)).toBeNull();
  });
  it('retourne null si taux = 0', () => {
    expect(calculerPriseEnCharge(50000, pcPartielle(0))).toBeNull();
  });
  it('calcule le montant selon le taux', () => {
    const res = calculerPriseEnCharge(50000, pcPartielle(0.8));
    expect(res).not.toBeNull();
    expect(res!.montant).toBe(40000);
    expect(res!.taux).toBe(0.8);
  });
  it('plafonne le montant au plafond', () => {
    const res = calculerPriseEnCharge(50000, pcPartielle(0.8, 30000));
    expect(res!.montant).toBe(30000);
  });
  it('ne plafonne pas si montant < plafond', () => {
    const res = calculerPriseEnCharge(20000, pcPartielle(0.5, 30000));
    expect(res!.montant).toBe(10000);
  });
});

// ─── calculerFacture ───────────────────────────────────

describe('calculerFacture', () => {
  it('calcule une facture simple sans prise en charge', () => {
    const input: FacturePatientInput = {
      patient: 'Dial',
      date: '2026-01-15',
      lignes: [ligne('CONS', 'Consultation', 'consultation', 1, 5000)],
      prise_en_charge: null,
      remise: 0,
    };
    const f = calculerFacture(input);
    expect(f.total_brut).toBe(5000);
    expect(f.remise).toBe(0);
    expect(f.net_patient).toBe(5000);
    expect(f.prise_en_charge).toBeNull();
    expect(f.net_a_payer).toBe(5000);
  });

  it('applique une remise', () => {
    const input: FacturePatientInput = {
      patient: 'Dial',
      date: '2026-01-15',
      lignes: [ligne('CONS', 'Consultation', 'consultation', 1, 10000)],
      prise_en_charge: null,
      remise: 2000,
    };
    const f = calculerFacture(input);
    expect(f.total_brut).toBe(10000);
    expect(f.remise).toBe(2000);
    expect(f.net_patient).toBe(8000);
    expect(f.net_a_payer).toBe(8000);
  });

  it('plafonne la remise au total brut', () => {
    const input: FacturePatientInput = {
      patient: 'Dial',
      date: '2026-01-15',
      lignes: [ligne('CONS', 'Consultation', 'consultation', 1, 5000)],
      prise_en_charge: null,
      remise: 99999,
    };
    const f = calculerFacture(input);
    expect(f.remise).toBe(5000);
    expect(f.net_patient).toBe(0);
  });

  it('déduit la prise en charge du net à payer', () => {
    const input: FacturePatientInput = {
      patient: 'Dial',
      date: '2026-01-15',
      lignes: [ligne('CHIR', 'Chirurgie', 'chirurgie', 1, 150000)],
      prise_en_charge: pcPartielle(0.8),
      remise: 0,
    };
    const f = calculerFacture(input);
    expect(f.total_brut).toBe(150000);
    expect(f.prise_en_charge!.montant).toBe(120000);
    expect(f.net_a_payer).toBe(30000);
  });

  it('applique le plafond de prise en charge', () => {
    const input: FacturePatientInput = {
      patient: 'Dial',
      date: '2026-01-15',
      lignes: [ligne('CHIR', 'Chirurgie', 'chirurgie', 1, 200000)],
      prise_en_charge: pcPartielle(0.8, 100000),
      remise: 0,
    };
    const f = calculerFacture(input);
    expect(f.prise_en_charge!.montant).toBe(100000);
    expect(f.net_a_payer).toBe(100000);
  });

  it('calcule avec remise + prise en charge combinées', () => {
    const input: FacturePatientInput = {
      patient: 'Dial',
      date: '2026-01-15',
      lignes: [ligne('HOSP1', 'Hosp 1j', 'hospitalisation', 1, 25000)],
      prise_en_charge: pcPartielle(0.6),
      remise: 5000,
    };
    const f = calculerFacture(input);
    expect(f.total_brut).toBe(25000);
    expect(f.remise).toBe(5000);
    expect(f.net_patient).toBe(20000);
    expect(f.prise_en_charge!.montant).toBe(12000);
    expect(f.net_a_payer).toBe(8000);
  });
});

// ─── lignesEcritureFacture ──────────────────────────────

describe('lignesEcritureFacture', () => {
  it('génère débit patient + crédit 7061 sans prise en charge', () => {
    const f = calculerFacture({
      patient: 'Dial', date: '2026-01-15',
      lignes: [ligne('CONS', 'Consultation', 'consultation', 1, 5000)],
      prise_en_charge: null, remise: 0,
    });
    const ec = lignesEcritureFacture(f, 'Dial');
    expect(ec).toHaveLength(2);
    expect(ec[0].compte).toBe(COMPTES_SANTE.clients_patients);
    expect(ec[0].debit).toBe(5000);
    expect(ec[1].compte).toBe(COMPTES_SANTE.vente_prestations);
    expect(ec[1].credit).toBe(5000);
  });

  it('génère débit patient + débit organisme + crédit 7061 avec prise en charge', () => {
    const f = calculerFacture({
      patient: 'Dial', date: '2026-01-15',
      lignes: [ligne('CHIR', 'Chirurgie', 'chirurgie', 1, 100000)],
      prise_en_charge: pcPartielle(0.7), remise: 0,
    });
    const ec = lignesEcritureFacture(f, 'Dial');
    expect(ec).toHaveLength(3);
    // Patient = 30000
    expect(ec.find(l => l.compte === COMPTES_SANTE.clients_patients)!.debit).toBe(30000);
    // Organisme = 70000
    expect(ec.find(l => l.compte === COMPTES_SANTE.clients_organismes)!.debit).toBe(70000);
    // Vente = 100000
    expect(ec.find(l => l.compte === COMPTES_SANTE.vente_prestations)!.credit).toBe(100000);
  });

  it('sépare 7061 (soins) et 701 (pharmacie)', () => {
    const f = calculerFacture({
      patient: 'Dial', date: '2026-01-15',
      lignes: [
        ligne('CONS', 'Consultation', 'consultation', 1, 5000),
        ligne('MED', 'Médicament', 'pharmacie', 10, 1000),
      ],
      prise_en_charge: null, remise: 0,
    });
    const ec = lignesEcritureFacture(f, 'Dial');
    expect(ec.filter(l => l.compte === COMPTES_SANTE.vente_prestations).length).toBe(1);
    expect(ec.filter(l => l.compte === COMPTES_SANTE.vente_pharmacie).length).toBe(1);
    expect(ec.find(l => l.compte === COMPTES_SANTE.vente_prestations)!.credit).toBe(5000);
    expect(ec.find(l => l.compte === COMPTES_SANTE.vente_pharmacie)!.credit).toBe(10000);
  });

  it('les lignes sont équilibrées (débit = crédit)', () => {
    const f = calculerFacture({
      patient: 'Dial', date: '2026-01-15',
      lignes: [
        ligne('CONS', 'Consultation', 'consultation', 2, 5000),
        ligne('MED', 'Médicament', 'pharmacie', 5, 2000),
      ],
      prise_en_charge: pcPartielle(0.5), remise: 1000,
    });
    const ec = lignesEcritureFacture(f, 'Dial');
    const totD = ec.reduce((s, l) => s + l.debit, 0);
    const totC = ec.reduce((s, l) => s + l.credit, 0);
    expect(Math.abs(totD - totC)).toBe(0);
  });
});

// ─── calculerStats ─────────────────────────────────────

describe('calculerStats', () => {
  it('calcule les statistiques sur un ensemble de factures', () => {
    const f1 = calculerFacture({
      patient: 'A', date: '2026-01-01',
      lignes: [ligne('CONS', 'Cons', 'consultation', 1, 5000)],
      prise_en_charge: null, remise: 0,
    });
    const f2 = calculerFacture({
      patient: 'B', date: '2026-01-02',
      lignes: [ligne('CHIR', 'Chir', 'chirurgie', 1, 100000)],
      prise_en_charge: pcPartielle(0.8), remise: 0,
    });
    const stats = calculerStats([f1, f2]);
    expect(stats.nb_factures).toBe(2);
    expect(stats.ca_total).toBe(105000);
    expect(stats.ca_patient).toBe(25000);  // 5000 + 20000
    expect(stats.ca_organismes).toBe(80000);
    expect(stats.par_type.consultation).toBe(5000);
    expect(stats.par_type.chirurgie).toBe(100000);
  });

  it('retourne des zéros pour un tableau vide', () => {
    const stats = calculerStats([]);
    expect(stats.nb_factures).toBe(0);
    expect(stats.ca_total).toBe(0);
    expect(stats.taux_recouvrement).toBe(0);
  });
});

// ─── Consommables ──────────────────────────────────────

describe('Consommables médicaux', () => {
  it('évalue un consommable', () => {
    const c = evaluerConsommable({ code: 'GANT', designation: 'Gants', quantite: 100, prix_unitaire: 50, seuil_alerte: 20 });
    expect(c.valeur_stock).toBe(5000);
    expect(c.en_alerte).toBe(false);
  });
  it('détecte un consommable en alerte', () => {
    const c = evaluerConsommable({ code: 'GANT', designation: 'Gants', quantite: 10, prix_unitaire: 50, seuil_alerte: 20 });
    expect(c.en_alerte).toBe(true);
  });
  it('évalue plusieurs consommables', () => {
    const items = evaluerConsommables([
      { code: 'GANT', designation: 'Gants', quantite: 100, prix_unitaire: 50, seuil_alerte: 20 },
      { code: 'SER', designation: 'Seringues', quantite: 5, prix_unitaire: 100, seuil_alerte: 10 },
    ]);
    expect(items).toHaveLength(2);
    expect(items[1].en_alerte).toBe(true);
  });
  it('calcule la valeur totale des consommables', () => {
    const items = evaluerConsommables([
      { code: 'GANT', designation: 'Gants', quantite: 100, prix_unitaire: 50, seuil_alerte: 20 },
      { code: 'SER', designation: 'Seringues', quantite: 50, prix_unitaire: 100, seuil_alerte: 10 },
    ]);
    expect(valeurTotaleConsommables(items)).toBe(10000);
  });
  it('compte les consommables en alerte', () => {
    const items = evaluerConsommables([
      { code: 'GANT', designation: 'Gants', quantite: 100, prix_unitaire: 50, seuil_alerte: 20 },
      { code: 'SER', designation: 'Seringues', quantite: 5, prix_unitaire: 100, seuil_alerte: 10 },
      { code: 'COMP', designation: 'Compresses', quantite: 3, prix_unitaire: 30, seuil_alerte: 50 },
    ]);
    expect(consommablesEnAlerte(items)).toBe(2);
  });
});

// ─── Catalogue par défaut ──────────────────────────────

describe('Catalogue par défaut', () => {
  it('contient au moins 10 actes', () => {
    expect(CATALOGUE_DEFAUT.length).toBeGreaterThanOrEqual(10);
  });
  it('chaque acte a un code unique', () => {
    const codes = CATALOGUE_DEFAUT.map(a => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
  it('chaque acte a un prix positif', () => {
    for (const a of CATALOGUE_DEFAUT) {
      expect(a.prix_unitaire).toBeGreaterThan(0);
    }
  });
});
