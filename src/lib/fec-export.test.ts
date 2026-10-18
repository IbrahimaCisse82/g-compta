import { describe, expect, it } from 'vitest';
import { buildFec, controlerFec, type FecLine } from './fec-export';

const entry = (seq: number, journal = 'VT'): FecLine[] => [
  { id: `${journal}-${seq}-a`, date_ecriture: '2026-01-10', piece: 'P', journal_code: journal,
    compte: '411', intitule: 'Client', libelle: 'Vente', debit: 118, credit: 0,
    ecriture_numero: `${journal}-2026-${String(seq).padStart(6, '0')}`, numero_sequence: seq,
    valide_le: '2026-01-12T23:30:00Z', compte_auxiliaire: 'C001', compte_auxiliaire_lib: 'Client A' },
  { id: `${journal}-${seq}-b`, date_ecriture: '2026-01-10', piece: 'P', journal_code: journal,
    compte: '701', intitule: 'Ventes', libelle: 'Vente', debit: 0, credit: 118,
    ecriture_numero: `${journal}-2026-${String(seq).padStart(6, '0')}`, numero_sequence: seq,
    valide_le: '2026-01-12T23:30:00Z' },
];
const options = { dateDebut: '2026-01-01', dateFin: '2026-12-31', comptes: ['411', '701'] };

describe('CA-3.1 — FEC stable et contrôlé', () => {
  it('produit exactement les mêmes octets après inversion des réponses', () => {
    const lines = [...entry(1), ...entry(2)];
    expect(new TextEncoder().encode(buildFec(lines))).toEqual(new TextEncoder().encode(buildFec([...lines].reverse())));
    expect(buildFec(lines).split('\r\n')[1].split('|')).toHaveLength(18);
  });
  it('détecte le numéro 2 injecté comme manquant entre 1 et 3', () => {
    const report = controlerFec([...entry(1), ...entry(3)], options);
    expect(report.trousNumerotation).toEqual([{ journal: 'VT', debut: 2, fin: 2 }]);
    expect(report.conforme).toBe(false);
  });
  it('détecte aussi un début manquant sans compter plusieurs lignes comme plusieurs numéros', () => {
    expect(controlerFec(entry(3), options).trousNumerotation).toEqual([{ journal: 'VT', debut: 1, fin: 2 }]);
  });
  it('vérifie les séquences séparément par journal', () => {
    expect(controlerFec([...entry(1), ...entry(2), ...entry(1, 'AC')], options).conforme).toBe(true);
  });
  it('ne fabrique ni numéro ni validation à partir de la création', () => {
    const line = { ...entry(1)[0], ecriture_numero: null, valide_le: null, created_at: '2026-01-11' };
    const columns = buildFec([line]).split('\r\n')[1].split('|');
    expect(columns[2]).toBe('');
    expect(columns[15]).toBe('');
    expect(controlerFec([line], options).sansValidation).toBe(1);
  });
  it('refuse un compte hors plan', () => {
    expect(controlerFec(entry(1), { ...options, comptes: ['701'] }).horsPlan).toBe(1);
  });
  it('refuse une date hors exercice', () => {
    expect(controlerFec(entry(1), { ...options, dateDebut: '2026-02-01' }).horsExercice).toBe(2);
  });
  it('détecte un déséquilibre global même si les montants ont des centimes', () => {
    const lines = entry(1);
    lines[0].debit = 118.01;
    expect(controlerFec(lines, options).ecartGlobal).toBe(0.01);
    expect(controlerFec(lines, options).desequilibrees).toBe(1);
  });
  it('reprend les deux colonnes auxiliaires et la validation réelle', () => {
    const row = buildFec([entry(1)[0]]).split('\r\n')[1].split('|');
    expect(row.slice(6, 8)).toEqual(['C001', 'Client A']);
    expect(row[15]).toBe('20260112');
  });
});