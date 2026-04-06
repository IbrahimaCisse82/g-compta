// ─── FORMATTING ────────────────────────────────────────
export const fmt = (n: number | null | undefined, dash = true): string => {
  if (n === null || n === undefined) return dash ? '—' : '';
  const v = typeof n === 'number' ? n : parseFloat(String(n));
  if (isNaN(v)) return dash ? '—' : '';
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

export const fmtSigned = (n: number | null | undefined): string => {
  if (n == null) return '—';
  const a = Math.abs(Math.round(n)).toLocaleString('fr-FR');
  return n < 0 ? `(${a})` : a;
};

export const fmtPct = (n: number | null | undefined): string => {
  if (!n || isNaN(n) || !isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)} %`;
};

export const pf = (s: string | number): number =>
  parseFloat(String(s || '0').replace(/[\s\u00a0]/g, '').replace(',', '.')) || 0;

export const isBilan = (c: string): boolean => /^[1-5]/.test(String(c || '').trim());

export const inRange = (compte: string, ranges: string[][]): boolean => {
  const c = String(compte).replace(/\D/g, '').padEnd(10, '0');
  return ranges.some(([f, t]) =>
    c >= f.replace(/\D/g, '').padEnd(10, '0') && c <= t.replace(/\D/g, '').padEnd(10, '0')
  );
};

// ─── TYPES ─────────────────────────────────────────────
export interface BalanceLine {
  compte: string;
  intitule: string;
  sd: number; sc: number;   // soldes initiaux
  md: number; mc: number;   // mouvements
  sfd: number; sfc: number; // soldes finaux
  id?: string;
  exercice_id?: string;
  entreprise_id?: string;
}

export interface JournalLine {
  id: string;
  exercice_id: string;
  entreprise_id: string;
  date_ecriture: string;
  piece: string;
  journal_code: string;
  libelle: string;
  compte: string;
  intitule: string;
  debit: number;
  credit: number;
}

export interface PlanCompte {
  id: string;
  entreprise_id: string;
  numero: string;
  intitule: string;
  classe: string;
  sens: string;
  type_compte: string;
  actif: boolean;
}

export interface Entreprise {
  id: string;
  nom: string;
  sigle: string;
  ninea: string;
  rccm: string;
  tel: string;
  adresse: string;
  forme_juridique: string;
  secteur: string;
  monnaie: string;
  cabinet_id?: string;
}

export interface Exercice {
  id: string;
  entreprise_id: string;
  annee: number;
  date_debut: string;
  date_fin: string;
  statut: 'en_cours' | 'cloture';
}

// ─── MAPPING DEFINITION ────────────────────────────────
export interface MapLine {
  id: string;
  label: string;
  type?: 'sect' | 'total' | 'gtotal';
  c?: string[][];
  s?: string;
  m?: string;
  refs?: string[];
  f?: (v: Record<string, number>) => number;
  srcCR?: string;
}

// ─── AGGREGATION ──────────────────────────────────────
export function aggBalance(balance: BalanceLine[], ranges: string[][], sens: string, mode = 'auto'): number {
  let sum = 0;
  for (const l of balance) {
    if (!inRange(l.compte, ranges)) continue;
    const sdN = (l.sfd || 0) - (l.sfc || 0);
    const sdN1 = (l.sd || 0) - (l.sc || 0);
    let val = 0;
    switch (mode) {
      case 'n':
        val = sens === 'D' ? l.md || 0 : sens === 'C' ? l.mc || 0 : (l.md || 0) - (l.mc || 0);
        break;
      case 'n1':
        val = sens === 'D' ? l.sd || 0 : sens === 'C' ? l.sc || 0 : sdN1;
        break;
      case 'solde':
        val = sens === 'D' ? Math.max(sdN, 0) : sens === 'C' ? Math.max(-sdN, 0) : sdN;
        break;
      case 'solde_n1':
        val = sens === 'D' ? Math.max(sdN1, 0) : sens === 'C' ? Math.max(-sdN1, 0) : sdN1;
        break;
      default:
        if (isBilan(l.compte)) {
          val = sens === 'D' ? Math.max(sdN, 0) : sens === 'C' ? Math.max(-sdN, 0) : sdN;
        } else {
          val = sens === 'D' ? l.md || 0 : sens === 'C' ? l.mc || 0 : (l.md || 0) - (l.mc || 0);
        }
    }
    sum += val;
  }
  return sum;
}

export function aggVar(balance: BalanceLine[], ranges: string[][], sens: string): number {
  let sN = 0, sN1 = 0;
  for (const l of balance) {
    if (!inRange(l.compte, ranges)) continue;
    const sdN = (l.sfd || 0) - (l.sfc || 0);
    const sdN1 = (l.sd || 0) - (l.sc || 0);
    if (sens === 'D') { sN += Math.max(sdN, 0); sN1 += Math.max(sdN1, 0); }
    else if (sens === 'C') { sN += Math.max(-sdN, 0); sN1 += Math.max(-sdN1, 0); }
    else { sN += sdN; sN1 += sdN1; }
  }
  return sN - sN1;
}

export function calc(balance: BalanceLine[], def: MapLine[], extra: Record<string, number> = {}): Record<string, number> {
  const v: Record<string, number> = { ...extra };
  for (const l of def) {
    if (l.type || l.srcCR || !l.c) continue;
    if (l.m === 'var') v[l.id] = aggVar(balance, l.c, l.s || 'D');
    else v[l.id] = aggBalance(balance, l.c, l.s || 'D', l.m || 'auto');
  }
  for (const l of def) { if (l.srcCR) v[l.id] = extra[l.srcCR] ?? 0; }
  for (let i = 0; i < 10; i++) {
    for (const l of def) {
      if (!l.type || l.type === 'sect') continue;
      const val = l.f ? l.f(v) : l.refs?.reduce((s, r) => s + (v[r] ?? 0), 0);
      if (val !== undefined) v[l.id] = val;
    }
  }
  return v;
}

// ─── SYSCOHADA MAPPINGS ──────────────────────────────
export const ACTIF: MapLine[] = [
  { id: 'S_IA', label: 'ACTIF IMMOBILISÉ', type: 'sect' },
  { id: 'AA', label: 'Charges immobilisées', c: [['201', '209']], s: 'D' },
  { id: 'AB', label: 'Immobilisations incorporelles', c: [['211', '219']], s: 'D' },
  { id: 'AC', label: 'Terrains', c: [['221', '229']], s: 'D' },
  { id: 'AD', label: 'Bâtiments, installations techniques', c: [['231', '239']], s: 'D' },
  { id: 'AE', label: 'Matériel, mobilier & actifs biologiques', c: [['241', '244'], ['246', '248']], s: 'D' },
  { id: 'AG', label: 'Matériels de transport', c: [['245', '245']], s: 'D' },
  { id: 'AH', label: 'Avances et acomptes sur immobilisations', c: [['25', '259']], s: 'D' },
  { id: 'T_IC', label: 'TOTAL IMMO. CORPORELLES', type: 'total', refs: ['AC', 'AD', 'AE', 'AF', 'AG'] },
  { id: 'AI', label: 'Titres de participation', c: [['261', '263']], s: 'D' },
  { id: 'AJ', label: 'Autres immobilisations financières', c: [['264', '269'], ['271', '279']], s: 'D' },
  { id: 'T_IF', label: 'TOTAL IMMO. FINANCIÈRES', type: 'total', refs: ['AI', 'AJ'] },
  { id: 'T_IA', label: 'TOTAL ACTIF IMMOBILISÉ (I)', type: 'gtotal', refs: ['AA', 'AB', 'T_IC', 'AH', 'T_IF'] },
  { id: 'S_AC', label: 'ACTIF CIRCULANT', type: 'sect' },
  { id: 'BA', label: 'Actif circulant HAO', c: [['475', '475']], s: 'D' },
  { id: 'BB', label: 'Stocks de marchandises', c: [['31', '319']], s: 'D' },
  { id: 'BC', label: 'Stocks mat. premières & fournitures', c: [['32', '329']], s: 'D' },
  { id: 'BD', label: 'En-cours de production', c: [['33', '349']], s: 'D' },
  { id: 'BE', label: 'Stocks de produits fabriqués', c: [['35', '369']], s: 'D' },
  { id: 'T_ST', label: 'TOTAL STOCKS', type: 'total', refs: ['BB', 'BC', 'BD', 'BE'] },
  { id: 'BF', label: 'Fournisseurs, avances versées', c: [['4091', '4098']], s: 'D' },
  { id: 'BG', label: 'Clients', c: [['411', '4198']], s: 'D' },
  { id: 'BH', label: 'Autres créances', c: [['42', '47']], s: 'D' },
  { id: 'T_CR', label: 'TOTAL CRÉANCES', type: 'total', refs: ['BF', 'BG', 'BH'] },
  { id: 'T_AC', label: 'TOTAL ACTIF CIRCULANT (II)', type: 'gtotal', refs: ['BA', 'T_ST', 'T_CR'] },
  { id: 'S_TA', label: 'TRÉSORERIE — ACTIF', type: 'sect' },
  { id: 'BJ', label: 'Titres de placement', c: [['50', '509']], s: 'D' },
  { id: 'BK', label: 'Valeurs à encaisser', c: [['511', '519']], s: 'D' },
  { id: 'BL', label: 'Banques, chèques postaux, caisse', c: [['521', '585']], s: 'D' },
  { id: 'T_TA', label: 'TOTAL TRÉSORERIE ACTIF (III)', type: 'total', refs: ['BJ', 'BK', 'BL'] },
  { id: 'T_ACT', label: 'TOTAL GÉNÉRAL ACTIF (I+II+III)', type: 'gtotal', refs: ['T_IA', 'T_AC', 'T_TA'] },
];

export const PASSIF: MapLine[] = [
  { id: 'S_CP', label: 'CAPITAUX PROPRES', type: 'sect' },
  { id: 'CA', label: 'Capital social', c: [['101', '104']], s: 'C' },
  { id: 'CB', label: 'Primes liées au capital', c: [['105', '105'], ['107', '109']], s: 'C' },
  { id: 'CC', label: 'Écarts de réévaluation', c: [['106', '106']], s: 'C' },
  { id: 'CD', label: 'Réserves indisponibles', c: [['111', '113']], s: 'C' },
  { id: 'CE', label: 'Réserves libres', c: [['114', '119']], s: 'C' },
  { id: 'CF', label: 'Report à nouveau (+/−)', c: [['121', '129']], s: 'SC' },
  { id: 'CG', label: 'Résultat net (+/−)', c: [['130', '139']], s: 'SC' },
  { id: 'CH', label: "Subventions d'investissement", c: [['14', '149']], s: 'C' },
  { id: 'CI', label: 'Provisions réglementées', c: [['15', '159']], s: 'C' },
  { id: 'T_CP', label: 'TOTAL CAPITAUX PROPRES (I)', type: 'gtotal', refs: ['CA', 'CB', 'CC', 'CD', 'CE', 'CF', 'CG', 'CH', 'CI'] },
  { id: 'S_DF', label: 'DETTES FINANCIÈRES', type: 'sect' },
  { id: 'DA', label: 'Emprunts & dettes financières', c: [['161', '169']], s: 'C' },
  { id: 'DB', label: 'Dettes de location-acquisition', c: [['17', '179']], s: 'C' },
  { id: 'DC', label: 'Provisions pour risques & charges', c: [['19', '199']], s: 'C' },
  { id: 'T_DF', label: 'TOTAL DETTES FINANCIÈRES (II)', type: 'total', refs: ['DA', 'DB', 'DC'] },
  { id: 'S_PC', label: 'PASSIF CIRCULANT', type: 'sect' },
  { id: 'DH', label: 'Passif circulant HAO', c: [['479', '479']], s: 'C' },
  { id: 'DI', label: 'Clients, avances reçues', c: [['4191', '4198']], s: 'C' },
  { id: 'DJ', label: "Fournisseurs d'exploitation", c: [['401', '408']], s: 'C' },
  { id: 'DK', label: 'Dettes fiscales & sociales', c: [['421', '459']], s: 'C' },
  { id: 'DL', label: 'Autres dettes & provisions CT', c: [['46', '478']], s: 'C' },
  { id: 'T_PC', label: 'TOTAL PASSIF CIRCULANT (III)', type: 'gtotal', refs: ['DH', 'DI', 'DJ', 'DK', 'DL'] },
  { id: 'S_TP', label: 'TRÉSORERIE — PASSIF', type: 'sect' },
  { id: 'DM', label: 'Banques, crédits de trésorerie', c: [['561', '569']], s: 'C' },
  { id: 'T_TP', label: 'TOTAL TRÉSORERIE PASSIF (IV)', type: 'total', refs: ['DM'] },
  { id: 'T_PAS', label: 'TOTAL GÉNÉRAL PASSIF (I+II+III+IV)', type: 'gtotal', refs: ['T_CP', 'T_DF', 'T_PC', 'T_TP'] },
];

export const CR: MapLine[] = [
  { id: 'TA', label: 'Ventes de marchandises A', c: [['701', '701']], s: 'C', m: 'n' },
  { id: 'RA', label: '(−) Achats de marchandises B', c: [['601', '601']], s: 'D', m: 'n' },
  { id: 'RB', label: '(±) Variation stocks marchands C', c: [['6031', '6031']], s: 'SC', m: 'n' },
  { id: 'MARGE', label: 'MARGE COMMERCIALE', type: 'gtotal', f: v => v.TA - v.RA - v.RB },
  { id: 'TB', label: 'Ventes produits fabriqués D', c: [['702', '702']], s: 'C', m: 'n' },
  { id: 'TC', label: 'Travaux & services vendus E', c: [['703', '706']], s: 'C', m: 'n' },
  { id: 'TD', label: 'Produits accessoires F', c: [['707', '708']], s: 'C', m: 'n' },
  { id: 'TE2', label: 'Produits divers G', c: [['71', '719']], s: 'C', m: 'n' },
  { id: 'XB', label: "CHIFFRE D'AFFAIRES", type: 'gtotal', f: v => v.TA + v.TB + v.TC + v.TD + v.TE2 },
  { id: 'TE', label: '(±) Production stockée H', c: [['73', '739']], s: 'SC', m: 'n' },
  { id: 'TF', label: 'Production immobilisée I', c: [['72', '729']], s: 'C', m: 'n' },
  { id: 'RC', label: '(−) Achats mat. premières J', c: [['602', '602']], s: 'D', m: 'n' },
  { id: 'RD', label: '(±) Variation stocks matières K', c: [['6032', '6032']], s: 'SC', m: 'n' },
  { id: 'RE', label: '(−) Autres achats L', c: [['604', '609']], s: 'D', m: 'n' },
  { id: 'RF', label: '(±) Variation autres stocks M', c: [['6033', '6039']], s: 'SC', m: 'n' },
  { id: 'RG', label: '(−) Transports N', c: [['61', '619']], s: 'D', m: 'n' },
  { id: 'RH', label: '(−) Services extérieurs O', c: [['62', '629']], s: 'D', m: 'n' },
  { id: 'RI', label: '(−) Impôts & taxes P', c: [['63', '639']], s: 'D', m: 'n' },
  { id: 'RJ', label: '(−) Autres charges Q', c: [['64', '649']], s: 'D', m: 'n' },
  { id: 'VA', label: 'VALEUR AJOUTÉE', type: 'gtotal', f: v => v.MARGE + v.TB + v.TC + v.TD + v.TE2 + v.TE + v.TF - v.RC - v.RD - v.RE - v.RF - v.RG - v.RH - v.RI - v.RJ },
  { id: 'TG', label: "Subventions d'exploitation R", c: [['75', '759']], s: 'C', m: 'n' },
  { id: 'RK', label: '(−) Charges de personnel S', c: [['66', '669']], s: 'D', m: 'n' },
  { id: 'EBE', label: "EXCÉDENT BRUT D'EXPLOITATION (EBE)", type: 'gtotal', f: v => v.VA + v.TG - v.RK },
  { id: 'TH', label: 'Reprises amort. & provisions expl. T', c: [['791', '795']], s: 'C', m: 'n' },
  { id: 'TI', label: 'Transferts de charges expl. U', c: [['781', '781']], s: 'C', m: 'n' },
  { id: 'RL', label: '(−) Dotations amort. expl. V', c: [['681', '681']], s: 'D', m: 'n' },
  { id: 'RM', label: '(−) Dotations provisions expl. W', c: [['691', '693']], s: 'D', m: 'n' },
  { id: 'RN', label: '(−) Autres charges expl. X', c: [['65', '659']], s: 'D', m: 'n' },
  { id: 'RE_E', label: "RÉSULTAT D'EXPLOITATION", type: 'gtotal', f: v => v.EBE + v.TH + v.TI - v.RL - v.RM - v.RN },
  { id: 'TJ', label: 'Revenus financiers Y', c: [['77', '779']], s: 'C', m: 'n' },
  { id: 'TK', label: 'Reprises provisions fin. Z', c: [['796', '796']], s: 'C', m: 'n' },
  { id: 'TK2', label: 'Transferts de charges fin. AA', c: [['787', '787']], s: 'C', m: 'n' },
  { id: 'RO', label: '(−) Frais financiers AB', c: [['67', '679']], s: 'D', m: 'n' },
  { id: 'RP', label: '(−) Dotations prov. fin. AC', c: [['697', '697']], s: 'D', m: 'n' },
  { id: 'RE_F', label: 'RÉSULTAT FINANCIER', type: 'gtotal', f: v => v.TJ + v.TK + v.TK2 - v.RO - v.RP },
  { id: 'RAO', label: 'RÉSULTAT ACTIVITÉS ORDINAIRES (RAO)', type: 'gtotal', f: v => v.RE_E + v.RE_F },
  { id: 'TL', label: 'Produits HAO AD', c: [['82', '849']], s: 'C', m: 'n' },
  { id: 'TM', label: 'Produits cessions immo. AE', c: [['85', '859']], s: 'C', m: 'n' },
  { id: 'RQ', label: '(−) Charges HAO AF', c: [['83', '839']], s: 'D', m: 'n' },
  { id: 'RS', label: '(−) VCN immo. cédées AG', c: [['81', '819']], s: 'D', m: 'n' },
  { id: 'RE_H', label: 'RÉSULTAT HAO', type: 'gtotal', f: v => v.TL + v.TM - v.RQ - v.RS },
  { id: 'RU', label: '(−) Participation travailleurs AH', c: [['664', '664']], s: 'D', m: 'n' },
  { id: 'RV', label: '(−) Impôts sur le résultat AI', c: [['89', '899'], ['694', '699']], s: 'D', m: 'n' },
  { id: 'RN_', label: "RÉSULTAT NET DE L'EXERCICE", type: 'gtotal', f: v => v.RAO + v.RE_H - v.RU - v.RV },
];

export const TFT: MapLine[] = [
  { id: 'S_OP', label: 'FLUX OPÉRATIONNELS', type: 'sect' },
  { id: 'FA', label: "Résultat net de l'exercice", srcCR: 'RN_' },
  { id: 'FB', label: '+ Dotations aux amortissements', c: [['681', '689']], s: 'D', m: 'n' },
  { id: 'FC', label: '+ Dotations aux provisions', c: [['691', '699']], s: 'D', m: 'n' },
  { id: 'FD', label: '− Reprises amort. & provisions', c: [['781', '799']], s: 'C', m: 'n' },
  { id: 'FE', label: '± Variation stocks', c: [['31', '39']], s: 'D', m: 'var' },
  { id: 'FF', label: '± Variation créances clients', c: [['411', '419']], s: 'D', m: 'var' },
  { id: 'FG', label: '± Variation dettes fournisseurs', c: [['401', '409']], s: 'C', m: 'var' },
  { id: 'FH', label: '± Variation autres postes', c: [['421', '499']], s: 'SC', m: 'var' },
  { id: 'T_OP', label: 'FLUX NET OPÉRATIONNEL (A)', type: 'gtotal', refs: ['FA', 'FB', 'FC', 'FD', 'FE', 'FF', 'FG', 'FH'] },
  { id: 'S_IV', label: "FLUX D'INVESTISSEMENT", type: 'sect' },
  { id: 'FI', label: "− Acquisitions d'immobilisations", c: [['20', '29']], s: 'D', m: 'var' },
  { id: 'FJ', label: '+ Produits de cessions', c: [['485', '485']], s: 'C', m: 'n' },
  { id: 'FK', label: '± Variation immo. financières', c: [['26', '27']], s: 'D', m: 'var' },
  { id: 'T_IV', label: "FLUX NET D'INVESTISSEMENT (B)", type: 'gtotal', f: v => -v.FI + v.FJ - v.FK },
  { id: 'S_FN', label: 'FLUX DE FINANCEMENT', type: 'sect' },
  { id: 'FL', label: '+ Augmentation capital', c: [['101', '103']], s: 'C', m: 'n' },
  { id: 'FM', label: '+ Nouveaux emprunts', c: [['161', '169']], s: 'C', m: 'n' },
  { id: 'FN', label: '− Remboursements emprunts', c: [['161', '169']], s: 'D', m: 'n' },
  { id: 'FO', label: '− Dividendes versés', c: [['465', '465']], s: 'D', m: 'n' },
  { id: 'T_FN', label: 'FLUX NET DE FINANCEMENT (C)', type: 'gtotal', f: v => v.FL + v.FM - v.FN - v.FO },
  { id: 'T_TFT', label: 'VARIATION NETTE DE TRÉSORERIE (A+B+C)', type: 'gtotal', refs: ['T_OP', 'T_IV', 'T_FN'] },
  { id: 'FP', label: "Trésorerie d'ouverture (N-1)", c: [['521', '585']], s: 'D', m: 'solde_n1' },
  { id: 'T_TC', label: 'TRÉSORERIE DE CLÔTURE (N)', type: 'gtotal', f: v => v.T_TFT + v.FP },
];

// computeIndicateurs removed — use calc(balance, CR) instead for proper SIG computation
