/**
 * Contrôles de cohérence comptable SYSCOHADA — librairie pure (testable hors React).
 * Aucun appel réseau : toutes les fonctions prennent les données déjà chargées.
 */

export type NiveauAnomalie = 'bloquant' | 'majeur' | 'info';

export interface Anomalie {
  code: string;
  niveau: NiveauAnomalie;
  libelle: string;
  detail: string;
  /** Référence exploitable (pièce, compte, id de ligne) pour aller à la donnée fautive. */
  reference?: string;
  page?: string;
}

export interface LigneControle {
  id?: string;
  date_ecriture: string;
  piece?: string | null;
  journal_code: string;
  compte: string;
  intitule?: string | null;
  libelle?: string | null;
  debit?: number | null;
  credit?: number | null;
  ecriture_id?: string | null;
}

export interface BalanceControle {
  compte: string;
  md: number;
  mc: number;
  sfd: number;
  sfc: number;
}

export interface ContexteControle {
  journal: LigneControle[];
  balance: BalanceControle[];
  comptesPlan: string[];
  exercice?: { date_debut: string; date_fin: string; statut?: string } | null;
}

export const JOURNAUX_AUTORISES = ['AN', 'AC', 'VT', 'BQ', 'CA', 'OD', 'PA'];

export const r2 = (n: number) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

/** Contrôle 1 — équilibre global du journal. */
export function ctrlEquilibreGlobal(journal: LigneControle[]): Anomalie[] {
  const d = r2(journal.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const c = r2(journal.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  if (d === c) return [];
  return [{
    code: 'EQ-GLOBAL',
    niveau: 'bloquant',
    libelle: 'Journal déséquilibré',
    detail: `Total débit ${d} ≠ total crédit ${c} (écart ${r2(d - c)})`,
    page: 'journal',
  }];
}

/** Contrôle 2 — équilibre pièce par pièce. */
export function ctrlEquilibreParPiece(journal: LigneControle[]): Anomalie[] {
  const m = new Map<string, { d: number; c: number }>();
  for (const l of journal) {
    const cle = `${l.journal_code}|${l.piece || '(sans pièce)'}|${l.date_ecriture}`;
    const t = m.get(cle) || { d: 0, c: 0 };
    t.d += Number(l.debit) || 0;
    t.c += Number(l.credit) || 0;
    m.set(cle, t);
  }
  const out: Anomalie[] = [];
  for (const [cle, t] of m) {
    if (r2(t.d) !== r2(t.c)) {
      out.push({
        code: 'EQ-PIECE',
        niveau: 'bloquant',
        libelle: 'Pièce déséquilibrée',
        detail: `${cle} — débit ${r2(t.d)} ≠ crédit ${r2(t.c)}`,
        reference: cle,
        page: 'journal',
      });
    }
  }
  return out;
}

/** Contrôle 3 — balance stockée ≠ balance recalculée depuis le journal. */
export function ctrlBalanceVsJournal(journal: LigneControle[], balance: BalanceControle[]): Anomalie[] {
  const calc = new Map<string, { md: number; mc: number }>();
  for (const l of journal) {
    const t = calc.get(l.compte) || { md: 0, mc: 0 };
    t.md += Number(l.debit) || 0;
    t.mc += Number(l.credit) || 0;
    calc.set(l.compte, t);
  }
  const out: Anomalie[] = [];
  const comptes = new Set<string>([...calc.keys(), ...balance.map(b => b.compte)]);
  for (const compte of comptes) {
    const c = calc.get(compte) || { md: 0, mc: 0 };
    const b = balance.find(x => x.compte === compte) || { md: 0, mc: 0 };
    const ed = r2(r2(b.md) - r2(c.md));
    const ec = r2(r2(b.mc) - r2(c.mc));
    if (ed !== 0 || ec !== 0) {
      out.push({
        code: 'BAL-ECART',
        niveau: 'bloquant',
        libelle: 'Écart balance ↔ journal',
        detail: `Compte ${compte} — écart débit ${ed}, écart crédit ${ec}`,
        reference: compte,
        page: 'balance',
      });
    }
  }
  return out;
}

/** Contrôle 4 — compte mouvementé absent du plan comptable. */
export function ctrlComptesHorsPlan(journal: LigneControle[], comptesPlan: string[]): Anomalie[] {
  const plan = new Set(comptesPlan);
  const vus = new Set<string>();
  const out: Anomalie[] = [];
  for (const l of journal) {
    if (vus.has(l.compte)) continue;
    vus.add(l.compte);
    const rattache = plan.has(l.compte) || comptesPlan.some(p => l.compte.startsWith(p) && p.length >= 3);
    if (!rattache) {
      out.push({
        code: 'PLAN-ABSENT',
        niveau: 'majeur',
        libelle: 'Compte hors plan comptable',
        detail: `Le compte ${l.compte} est mouvementé mais absent du plan comptable`,
        reference: l.compte,
        page: 'plan',
      });
    }
  }
  return out;
}

/** Contrôle 5 — structure des lignes (pièce, sens, montant). */
export function ctrlStructureLignes(journal: LigneControle[]): Anomalie[] {
  const out: Anomalie[] = [];
  for (const l of journal) {
    const d = Number(l.debit) || 0;
    const c = Number(l.credit) || 0;
    if (!l.piece || !String(l.piece).trim()) {
      out.push({
        code: 'PIECE-ABSENTE', niveau: 'majeur', libelle: 'Ligne sans pièce justificative',
        detail: `${l.date_ecriture} — ${l.compte} — ${l.libelle || ''}`, reference: l.id, page: 'journal',
      });
    }
    if (d > 0 && c > 0) {
      out.push({
        code: 'SENS-DOUBLE', niveau: 'bloquant', libelle: 'Ligne débitée et créditée',
        detail: `${l.compte} — débit ${d} et crédit ${c} sur la même ligne`, reference: l.id, page: 'journal',
      });
    }
    if (d === 0 && c === 0) {
      out.push({
        code: 'MONTANT-NUL', niveau: 'majeur', libelle: 'Ligne de montant nul',
        detail: `${l.date_ecriture} — ${l.compte}`, reference: l.id, page: 'journal',
      });
    }
    if (d < 0 || c < 0) {
      out.push({
        code: 'MONTANT-NEGATIF', niveau: 'bloquant', libelle: 'Montant négatif',
        detail: `${l.compte} — débit ${d}, crédit ${c}`, reference: l.id, page: 'journal',
      });
    }
    if (!/^[1-9]/.test(l.compte) || l.compte.length < 3) {
      out.push({
        code: 'COMPTE-INVALIDE', niveau: 'majeur', libelle: 'Numéro de compte non conforme',
        detail: `« ${l.compte} » — un compte SYSCOHADA comporte au moins 3 chiffres et débute par la classe 1 à 9`,
        reference: l.compte, page: 'plan',
      });
    }
    if (!JOURNAUX_AUTORISES.includes(l.journal_code)) {
      out.push({
        code: 'JOURNAL-NON-NORMALISE', niveau: 'majeur', libelle: 'Code journal non normalisé',
        detail: `« ${l.journal_code} » hors ${JOURNAUX_AUTORISES.join('/')}`, reference: l.id, page: 'journal',
      });
    }
  }
  return out;
}

/** Contrôle 6 — dates hors période de l'exercice. */
export function ctrlDatesPeriode(journal: LigneControle[], exercice?: { date_debut: string; date_fin: string } | null): Anomalie[] {
  if (!exercice) return [];
  const out: Anomalie[] = [];
  for (const l of journal) {
    if (l.date_ecriture < exercice.date_debut || l.date_ecriture > exercice.date_fin) {
      out.push({
        code: 'DATE-HORS-PERIODE', niveau: 'bloquant', libelle: 'Écriture hors période',
        detail: `${l.date_ecriture} hors de l'exercice ${exercice.date_debut} → ${exercice.date_fin}`,
        reference: l.id, page: 'journal',
      });
    }
  }
  return out;
}

/** Contrôle 7 — comptes de résultat 13X mouvementés hors clôture. */
export function ctrlCompteResultat(journal: LigneControle[]): Anomalie[] {
  return journal
    .filter(l => /^13/.test(l.compte) && l.journal_code !== 'AN' && l.journal_code !== 'OD')
    .map(l => ({
      code: 'RESULTAT-13X', niveau: 'bloquant' as const, libelle: 'Compte de résultat mouvementé en saisie',
      detail: `${l.compte} sur le journal ${l.journal_code} — le résultat est déterminé par la clôture`,
      reference: l.id, page: 'journal',
    }));
}

/** Contrôle 8 — lignes historiques non rattachées à une écriture serveur. */
export function ctrlLignesOrphelines(journal: LigneControle[]): Anomalie[] {
  const orphelines = journal.filter(l => !l.ecriture_id);
  if (!orphelines.length) return [];
  return [{
    code: 'LIGNE-ORPHELINE',
    niveau: 'majeur',
    libelle: 'Lignes sans écriture rattachée',
    detail: `${orphelines.length} ligne(s) historiques ne sont pas rattachées à une écriture serveur : elles échappent au contrôle d'immuabilité`,
    page: 'journal',
  }];
}

/** Contrôle 9 — cohérence des soldes de la balance (sens unique par compte). */
export function ctrlSensBalance(balance: BalanceControle[]): Anomalie[] {
  return balance
    .filter(b => r2(b.sfd) > 0 && r2(b.sfc) > 0)
    .map(b => ({
      code: 'SOLDE-DOUBLE', niveau: 'majeur' as const, libelle: 'Compte avec solde débiteur et créditeur',
      detail: `Compte ${b.compte} — solde débiteur ${r2(b.sfd)} et créditeur ${r2(b.sfc)}`,
      reference: b.compte, page: 'balance',
    }));
}

/** Contrôle 10 — équilibre de la balance (Σ soldes débiteurs = Σ soldes créditeurs). */
export function ctrlEquilibreBalance(balance: BalanceControle[]): Anomalie[] {
  if (!balance.length) return [];
  const sd = r2(balance.reduce((s, b) => s + (Number(b.sfd) || 0), 0));
  const sc = r2(balance.reduce((s, b) => s + (Number(b.sfc) || 0), 0));
  if (sd === sc) return [];
  return [{
    code: 'BAL-DESEQUILIBRE', niveau: 'bloquant', libelle: 'Balance déséquilibrée',
    detail: `Σ soldes débiteurs ${sd} ≠ Σ soldes créditeurs ${sc} (écart ${r2(sd - sc)})`,
    page: 'balance',
  }];
}

/** Exécute l'ensemble des contrôles et trie par criticité. */
export function executerControles(ctx: ContexteControle): Anomalie[] {
  const ordre: Record<NiveauAnomalie, number> = { bloquant: 0, majeur: 1, info: 2 };
  const all = [
    ...ctrlEquilibreGlobal(ctx.journal),
    ...ctrlEquilibreParPiece(ctx.journal),
    ...ctrlBalanceVsJournal(ctx.journal, ctx.balance),
    ...ctrlComptesHorsPlan(ctx.journal, ctx.comptesPlan),
    ...ctrlStructureLignes(ctx.journal),
    ...ctrlDatesPeriode(ctx.journal, ctx.exercice),
    ...ctrlCompteResultat(ctx.journal),
    ...ctrlLignesOrphelines(ctx.journal),
    ...ctrlSensBalance(ctx.balance),
    ...ctrlEquilibreBalance(ctx.balance),
  ];
  return all.sort((a, b) => ordre[a.niveau] - ordre[b.niveau] || a.code.localeCompare(b.code));
}

export function resumeAnomalies(anomalies: Anomalie[]) {
  return {
    bloquant: anomalies.filter(a => a.niveau === 'bloquant').length,
    majeur: anomalies.filter(a => a.niveau === 'majeur').length,
    info: anomalies.filter(a => a.niveau === 'info').length,
    total: anomalies.length,
    clotureAutorisee: anomalies.every(a => a.niveau !== 'bloquant'),
  };
}
