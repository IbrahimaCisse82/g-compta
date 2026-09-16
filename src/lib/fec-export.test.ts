import { describe, it, expect } from 'vitest';
import { buildFec, controleFec, type FecLine } from './fec-export';

const base = (over: Partial<FecLine> = {}): FecLine => ({
  date_ecriture: '2026-01-15',
  piece: 'P001',
  journal_code: 'VT',
  compte: '7010000',
  intitule: 'Ventes de marchandises',
  libelle: 'Vente',
  debit: 0,
  credit: 100000,
  ...over,
});

describe('buildFec — numéro persistant', () => {
  it('utilise ecritures.numero quand il est fourni (non recalculé)', () => {
    const lines = [base({ numero: 'VT-2026-000001', compte: '411CLI001', debit: 100000, credit: 0, intitule: 'Client X' }), base({ compte: '7010000' })];
    const out = buildFec(lines);
    const rows = out.split('\r\n').slice(1);
    expect(rows[0].split('|')[2]).toBe('VT-2026-000001');
  });

  it('recalcule un numéro de secours pour les lignes sans numero (historique)', () => {
    const lines = [base({ compte: '411CLI001', debit: 100000, credit: 0 }), base({ compte: '7010000' })];
    const out = buildFec(lines);
    const rows = out.split('\r\n').slice(1);
    expect(rows[0].split('|')[2]).toBe('VT000001');
    expect(rows[1].split('|')[2]).toBe('VT000001');
  });
});

describe('buildFec — auxiliaires tiers', () => {
  it('sépare collectif (préfixe numérique) et auxiliaire pour 411CLI001', () => {
    const out = buildFec([base({ compte: '411CLI001', intitule: 'Client X', debit: 100000, credit: 0 }), base({ compte: '7010000' })]);
    const row = out.split('\r\n')[1].split('|');
    expect(row[4]).toBe('411');       // CompteNum = collectif
    expect(row[6]).toBe('411CLI001'); // CompAuxNum = auxiliaire
    expect(row[7]).toBe('Client X'); // CompAuxLib
  });

  it('sépare collectif et auxiliaire pour 401FRN001 (fournisseur)', () => {
    const out = buildFec([base({ journal_code: 'AC', compte: '401FRN001', intitule: 'Fournisseur Y', debit: 0, credit: 50000 }), base({ journal_code: 'AC', compte: '6010000', debit: 50000, credit: 0 })]);
    const row = out.split('\r\n')[1].split('|');
    expect(row[4]).toBe('401');
    expect(row[6]).toBe('401FRN001');
  });

  it('ne split pas un compte numérique pur (pas un auxiliaire)', () => {
    const out = buildFec([base({ compte: '7010000', debit: 0, credit: 100000 }), base({ compte: '4110000', debit: 100000, credit: 0 })]);
    const rows = out.split('\r\n').slice(1);
    expect(rows[1].split('|')[6]).toBe(''); // CompAuxNum vide
    expect(rows[1].split('|')[4]).toBe('4110000');
  });

  it('ne split pas un compte hors tiers (521BQ)', () => {
    const out = buildFec([base({ journal_code: 'BQ', compte: '521BQ', intitule: 'Banque', debit: 100000, credit: 0 }), base({ journal_code: 'BQ', compte: '411CLI001', intitule: 'Client', debit: 0, credit: 100000 })]);
    const row = out.split('\r\n')[1].split('|');
    expect(row[4]).toBe('521BQ');
    expect(row[6]).toBe('');
  });

  it('utilise compte_aux explicite quand fourni (GC-012)', () => {
    const out = buildFec([base({ compte: '411', compte_aux: '411CLI001', intitule: 'Clients', intitule_aux: 'Client X', debit: 100000, credit: 0 }), base({ compte: '7010000' })]);
    const row = out.split('\r\n')[1].split('|');
    expect(row[4]).toBe('411');
    expect(row[6]).toBe('411CLI001');
    expect(row[7]).toBe('Client X');
  });
});

describe('controleFec', () => {
  it('signale un équilibre correct sans anomalie', () => {
    const lines = [base({ compte: '411CLI001', debit: 100000, credit: 0 }), base({ compte: '7010000', debit: 0, credit: 100000 })];
    const r = controleFec(lines);
    expect(r.equilibre).toBe(true);
    expect(r.anomalies).toHaveLength(0);
    expect(r.totalDebit).toBe(100000);
    expect(r.totalCredit).toBe(100000);
    expect(r.nbPieces).toBe(1);
  });

  it('détecte un déséquilibre débit ≠ crédit', () => {
    const lines = [base({ compte: '411CLI001', debit: 100000, credit: 0 }), base({ compte: '7010000', debit: 0, credit: 90000 })];
    const r = controleFec(lines);
    expect(r.equilibre).toBe(false);
    expect(r.anomalies.some(a => a.includes('Déséquilibre'))).toBe(true);
  });

  it('détecte une ligne à montant nul', () => {
    const lines = [base({ compte: '411CLI001', debit: 100000, credit: 0 }), base({ compte: '7010000', debit: 0, credit: 100000 }), base({ compte: '6010000', debit: 0, credit: 0 })];
    const r = controleFec(lines);
    expect(r.equilibre).toBe(false);
    expect(r.anomalies.some(a => a.includes('débit et crédit nuls'))).toBe(true);
  });
});
