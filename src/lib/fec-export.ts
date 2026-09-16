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
  /** Numéro d'écriture persistant (ecritures.numero) — prioritaire sur le recalcul. */
  numero?: string;
  /** Compte auxiliaire explicite (GC-012). Si fourni, surcharge la dérivation. */
  compte_aux?: string;
  intitule_aux?: string;
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

/**
 * Sépare le compte collectif du compte auxiliaire pour les tiers (40x/41x).
 * - Auxiliaire explicite (GC-012) → CompteNum = compte, CompAuxNum = compte_aux.
 * - Tiers avec suffixe non numérique (ex. 411CLI001) → collectif = préfixe
 *   numérique (racine), auxiliaire = compte complet.
 * - Sinon (compte numérique pur, hors tiers) → pas d'auxiliaire.
 */
function splitAux(l: FecLine): { compteNum: string; auxNum: string; auxLib: string } {
  if (l.compte_aux) {
    return { compteNum: l.compte, auxNum: l.compte_aux, auxLib: l.intitule_aux || '' };
  }
  const m = /^(\d+)(\D.*)$/.exec(l.compte);
  if (m && /^(40|41)/.test(m[1]) && m[1].length >= 3) {
    return { compteNum: m[1], auxNum: l.compte, auxLib: l.intitule };
  }
  return { compteNum: l.compte, auxNum: '', auxLib: '' };
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

  // Numérotation de secours par pièce (lignes historiques sans numero persistant).
  const pieceNum = new Map<string, number>();
  let seq = 0;
  for (const l of lines) {
    if (l.numero) continue;
    const key = `${l.journal_code}|${l.piece}`;
    if (!pieceNum.has(key)) { seq++; pieceNum.set(key, seq); }
  }

  const rows = lines.map(l => {
    const key = `${l.journal_code}|${l.piece}`;
    const ecrNum = l.numero || `${l.journal_code}${String(pieceNum.get(key) || 0).padStart(6, '0')}`;
    const dateEc = toFecDate(l.date_ecriture);
    const lett = opts.lettrage?.[l.id || ''];
    const { compteNum, auxNum, auxLib } = splitAux(l);
    return [
      clean(l.journal_code),
      clean(JOURNAL_LIBELLES[l.journal_code] || l.journal_code),
      clean(ecrNum),
      dateEc,
      clean(compteNum),
      clean(l.intitule),
      clean(auxNum),
      clean(auxLib),
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

export interface RapportFec {
  nbLignes: number;
  nbPieces: number;
  totalDebit: number;
  totalCredit: number;
  equilibre: boolean;
  anomalies: string[];
}

/** Rapport de contrôle du FEC : équilibre, exhaustivité, montants. */
export function controleFec(lines: FecLine[]): RapportFec {
  const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const anomalies: string[] = [];
  const totalDebit = r2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const totalCredit = r2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  const pieces = new Set(lines.map(l => `${l.journal_code}|${l.piece}`));
  lines.forEach((l, i) => {
    if (!l.date_ecriture) anomalies.push(`Ligne ${i + 1} : date d'écriture manquante`);
    if (!l.compte) anomalies.push(`Ligne ${i + 1} : compte manquant`);
    if (!Number(l.debit) && !Number(l.credit)) anomalies.push(`Ligne ${i + 1} : débit et crédit nuls`);
    if (Number(l.debit) < 0 || Number(l.credit) < 0) anomalies.push(`Ligne ${i + 1} : montant négatif`);
  });
  if (Math.abs(totalDebit - totalCredit) > 0.01) anomalies.push(`Déséquilibre : débit ${totalDebit} ≠ crédit ${totalCredit}`);
  return { nbLignes: lines.length, nbPieces: pieces.size, totalDebit, totalCredit, equilibre: anomalies.length === 0, anomalies };
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
