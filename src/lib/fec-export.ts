/**
 * Export FEC — format 18 colonnes (exigences DGID à confirmer par GROW HUB).
 * Format: TXT pipe-separated (|), encodage UTF-8, 18 colonnes normalisées.
 *
 * Colonnes :
 *  1  JournalCode
 *  2  JournalLib
 *  3  EcritureNum
 *  4  EcritureDate (AAAAMMJJ)
 *  5  CompteNum
 *  6  CompteLib
 *  7  CompAuxNum
 *  8  CompAuxLib
 *  9  PieceRef
 * 10  PieceDate (AAAAMMJJ)
 * 11  EcritureLib
 * 12  Debit
 * 13  Credit
 * 14  EcritureLet
 * 15  DateLet (AAAAMMJJ)
 * 16  ValidDate (AAAAMMJJ)
 * 17  Montantdevise
 * 18  Idevise
 */

export interface FecLine {
  date_ecriture: string;
  piece: string;
  journal_code: string;
  compte: string;
  intitule: string;
  libelle: string;
  debit: number;
  credit: number;
  created_at?: string;
  id?: string;
  /** Numéro persistant de l'écriture serveur (prioritaire sur la numérotation d'export). */
  ecriture_numero?: string | null;
  numero_sequence?: number | null;
  /** Date de validation persistée. */
  valide_le?: string | null;
  /** Compte auxiliaire (tiers). */
  compte_auxiliaire?: string | null;
  compte_auxiliaire_lib?: string | null;
}

const JOURNAL_LIBELLES: Record<string, string> = {
  AC: 'Achats',
  VT: 'Ventes',
  BQ: 'Banque',
  CA: 'Caisse',
  OD: 'Opérations diverses',
  AN: 'À nouveau',
  PA: 'Paie',
};

function toFecDate(d: string | null | undefined): string {
  if (!d) return '';
  const date = d.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const dt = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(dt.getTime()) || dt.toISOString().slice(0, 10) !== date) return '';
  return date.replace(/-/g, '');
}

function num(v: number): string {
  return (Number(v) || 0).toFixed(2).replace('.', ',');
}

function clean(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).replace(/[\|\r\n\t]/g, ' ').trim();
}

export function buildFec(
  lines: FecLine[],
  opts: { entrepriseNom: string; ninea?: string; exerciceAnnee: number; lettrage?: Record<string, { code: string; date: string }> } = {} as any,
): string {
  const headers = [
    'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate',
    'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib',
    'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit',
    'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise',
  ];

  const rows = lines.map(l => {
    const ecrNum = clean(l.ecriture_numero);
    const dateEc = toFecDate(l.date_ecriture);
    const lett = opts.lettrage?.[l.id || ''];
    return [
      clean(l.journal_code),
      clean(JOURNAL_LIBELLES[l.journal_code] || l.journal_code),
      ecrNum,
      dateEc,
      clean(l.compte),
      clean(l.intitule),
      clean(l.compte_auxiliaire),
      clean(l.compte_auxiliaire_lib),
      clean(l.piece),
      dateEc,
      clean(l.libelle),
      num(l.debit),
      num(l.credit),
      clean(lett?.code || ''),
      toFecDate(lett?.date),
      toFecDate(l.valide_le),
      num(0),
      'XOF',
    ].join('|');
  });

  // Ordre indépendant des réponses du service, du filtre UI et de la locale.
  rows.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  return [headers.join('|'), ...rows].join('\r\n');
}

export function downloadFec(content: string, entrepriseNinea: string, exerciceAnnee: number, dateCloture: string) {
  const filename = `${entrepriseNinea || 'FEC'}FEC${toFecDate(dateCloture)}.txt`;
  const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface FecControlOptions {
  dateDebut?: string;
  dateFin?: string;
  comptes?: readonly string[];
}

/** Les bornes et le plan doivent être ceux du dossier exporté. */
export function controlerFec(lines: FecLine[], opts: FecControlOptions = {}) {
  const sansNumero = lines.filter(l => !l.ecriture_numero).length;
  const sansValidation = lines.filter(l => !toFecDate(l.valide_le)).length;
  const pieces = new Map<string, number>();
  const sequences = new Map<string, Set<number>>();
  let sequencesInvalides = 0;
  let montantsInvalides = 0;
  let soldeCentimes = 0;
  for (const l of lines) {
    const debit = Number(l.debit), credit = Number(l.credit);
    if (!Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0) montantsInvalides++;
    const net = Math.round((debit || 0) * 100) - Math.round((credit || 0) * 100);
    soldeCentimes += net;
    const k = `${l.journal_code}|${l.ecriture_numero || l.piece}`;
    pieces.set(k, (pieces.get(k) || 0) + net);
    if (l.ecriture_numero) {
      const seq = l.numero_sequence ?? Number(l.ecriture_numero.match(/(\d+)$/)?.[1]);
      if (!Number.isSafeInteger(seq) || seq < 1) { sequencesInvalides++; continue; }
      const journal = sequences.get(l.journal_code) ?? new Set<number>();
      journal.add(seq);
      sequences.set(l.journal_code, journal);
    }
  }
  const trousNumerotation: { journal: string; debut: number; fin: number }[] = [];
  for (const [journal, values] of [...sequences.entries()].sort()) {
    let previous = 0;
    for (const seq of [...values].sort((a, b) => a - b)) {
      if (seq > previous + 1) trousNumerotation.push({ journal, debut: previous + 1, fin: seq - 1 });
      previous = seq;
    }
  }
  const desequilibrees = [...pieces.values()].filter(v => v !== 0).length;
  const horsExercice = lines.filter(l => !toFecDate(l.date_ecriture)
    || (opts.dateDebut && l.date_ecriture.slice(0, 10) < opts.dateDebut)
    || (opts.dateFin && l.date_ecriture.slice(0, 10) > opts.dateFin)).length;
  const horsPlan = opts.comptes ? lines.filter(l => !opts.comptes?.includes(l.compte)).length : 0;
  return {
    lignes: lines.length, sansNumero, sansValidation, desequilibrees, horsExercice, horsPlan,
    trousNumerotation, sequencesInvalides, montantsInvalides, ecartGlobal: soldeCentimes / 100,
    conforme: lines.length > 0 && sansNumero === 0 && sansValidation === 0 && desequilibrees === 0
      && horsExercice === 0 && horsPlan === 0 && trousNumerotation.length === 0
      && sequencesInvalides === 0 && montantsInvalides === 0 && soldeCentimes === 0,
  };
}
