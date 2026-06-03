/**
 * Export FEC officiel (Fichier des Écritures Comptables)
 * Conforme aux exigences OHADA / Administration fiscale
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
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
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

  // Numérotation séquentielle par pièce (groupée)
  const pieceNum = new Map<string, number>();
  let seq = 0;
  for (const l of lines) {
    const key = `${l.journal_code}|${l.piece}`;
    if (!pieceNum.has(key)) { seq++; pieceNum.set(key, seq); }
  }

  const rows = lines.map(l => {
    const key = `${l.journal_code}|${l.piece}`;
    const ecrNum = `${l.journal_code}${String(pieceNum.get(key)).padStart(6, '0')}`;
    const dateEc = toFecDate(l.date_ecriture);
    const lett = opts.lettrage?.[l.id || ''];
    return [
      clean(l.journal_code),
      clean(JOURNAL_LIBELLES[l.journal_code] || l.journal_code),
      ecrNum,
      dateEc,
      clean(l.compte),
      clean(l.intitule),
      '', // CompAuxNum (non géré)
      '',
      clean(l.piece),
      dateEc,
      clean(l.libelle),
      num(l.debit),
      num(l.credit),
      clean(lett?.code || ''),
      toFecDate(lett?.date),
      toFecDate(l.created_at),
      num(0),
      'XOF',
    ].join('|');
  });

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
