import { useMemo, useState, useCallback } from 'react';
import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { exportCsv } from '@/lib/csv-export';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useNotesData } from '@/hooks/use-notes-data';

// ─── Types ─────────────────────────────────────────────
interface NoteLine {
  compte: string;
  intitule: string;
  [key: string]: string | number;
}

function buildNote(
  balance: any[], pattern: RegExp,
  cols: { key: string; getter: (b: any) => number }[],
  filterFn?: (row: any) => boolean,
): NoteLine[] {
  return balance
    .filter(b => pattern.test(b.compte))
    .map(b => {
      const row: any = { compte: b.compte, intitule: b.intitule };
      cols.forEach(c => (row[c.key] = c.getter(b)));
      return row as NoteLine;
    })
    .filter(filterFn || (r => cols.some(c => (r[c.key] as number) !== 0)))
    .sort((a, b) => a.compte.localeCompare(b.compte));
}

function totalOf(lines: NoteLine[], key: string): number {
  return lines.reduce((s, r) => s + ((r[key] as number) || 0), 0);
}

// ─── Reusable table ────────────────────────────────────
function NoteTable({ title, noteNum, headers, rows, colKeys, colStyles, onExport }: {
  title: string; noteNum: number | string; headers: string[]; rows: NoteLine[];
  colKeys: string[]; colStyles?: Record<string, string>; onExport?: () => void;
}) {
  const styles = colStyles || {};
  return (
    <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between">
        <span className="text-xs font-bold text-primary">📋 Note {noteNum} — {title}</span>
        {onExport && <button onClick={onExport} className="text-[10px] text-fg3 hover:text-primary">📥 CSV</button>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead><tr>
            {headers.map(h => <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[0.5px] font-mono border-b border-border">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.compte} className="hover:bg-[rgba(56,189,248,.02)]">
                <td className="px-3 py-1 text-[10px] text-primary font-mono font-bold border-b border-border/30">{r.compte}</td>
                <td className="px-3 py-1 text-[10px] border-b border-border/30">{r.intitule}</td>
                {colKeys.map(k => (
                  <td key={k} className={`px-3 py-1 text-[10px] font-mono text-right border-b border-border/30 ${styles[k] || ''}`}>
                    {(r[k] as number) ? fmt(r[k] as number) : '—'}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={headers.length} className="px-3 py-4 text-center text-fg3 text-xs">Aucune donnée</td></tr>}
            {rows.length > 0 && (
              <tr className="bg-bg3 font-bold">
                <td colSpan={2} className="px-3 py-1.5 text-[10px] border-t border-border">TOTAL</td>
                {colKeys.map(k => (
                  <td key={k} className={`px-3 py-1.5 text-[10px] font-mono text-right border-t border-border ${styles[k] || ''}`}>{fmt(totalOf(rows, k))}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Editable field ────────────────────────────────────
function EditableField({ label, noteKey, notesData, onSave }: {
  label: string; noteKey: string;
  notesData: Record<string, string>;
  onSave: (key: string, val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const current = notesData[noteKey] || '';

  const startEdit = () => { setVal(current); setEditing(true); };
  const save = () => { onSave(noteKey, val); setEditing(false); };
  const cancel = () => setEditing(false);

  return (
    <div className="flex items-start gap-2">
      <span className="text-fg3 shrink-0 w-[180px]">{label} :</span>
      {editing ? (
        <div className="flex-1 flex items-center gap-1">
          <input value={val} onChange={e => setVal(e.target.value)}
            className="flex-1 bg-bg3 border border-border rounded px-2 py-0.5 text-[11px] text-foreground font-mono"
            autoFocus onKeyDown={e => e.key === 'Enter' && save()} />
          <button onClick={save} className="text-[9px] text-success font-bold">✓</button>
          <button onClick={cancel} className="text-[9px] text-destructive font-bold">✕</button>
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-1">
          <span className="font-mono">{current || <span className="text-fg3 italic">À renseigner</span>}</span>
          <button onClick={startEdit} className="text-[9px] text-primary hover:text-primary/80 ml-1">✏️</button>
        </div>
      )}
    </div>
  );
}

// ─── Summary card ──────────────────────────────────────
function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-bg2 border border-border rounded-lg px-3.5 py-2.5">
      <div className="text-[9px] text-fg3 uppercase tracking-wider font-mono">{label}</div>
      <div className="text-sm font-bold font-mono mt-0.5">{value}</div>
      {sub && <div className="text-[9px] text-fg3 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────
export default function NotesAnnexesPage() {
  const { balance, journal, entreprise, exercice, demo } = useApp();
  const [tab, setTab] = useState('resume');
  const { data: notesData, save: saveNote } = useNotesData(entreprise?.id, exercice?.id);

  // All computed notes
  // Note 3A — Immobilisations brutes (avec apports/scissions/réévaluations)
  const immos = useMemo(() => buildNote(balance.filter(b => !/^(28|29)/.test(b.compte)), /^(20|21|22|23|24|25|26|27)/,
    [
      { key: 'brut_debut', getter: b => b.sd || 0 },
      { key: 'acquisitions', getter: b => b.md || 0 },
      { key: 'apports', getter: () => 0 },
      { key: 'scissions', getter: () => 0 },
      { key: 'reevaluations', getter: () => 0 },
      { key: 'cessions', getter: b => b.mc || 0 },
      { key: 'brut_fin', getter: b => b.sfd || 0 },
    ],
    r => (r.brut_debut as number) > 0 || (r.brut_fin as number) > 0), [balance]);

  // Note 3B — Crédit-bail (immobilisations en location-acquisition)
  const creditBail = useMemo(() => buildNote(balance, /^(2[0-7])5/,
    [{ key: 'valeur_origine', getter: b => b.sd || 0 },
     { key: 'redevances', getter: b => b.md || 0 },
     { key: 'amort_cumule', getter: b => b.sc || 0 },
     { key: 'vnc', getter: b => (b.sfd || 0) - (b.sfc || 0) }]), [balance]);

  // Note 3D — Plus et moins-values de cession (comptes 81 vs 82)
  const plusMoinsValues = useMemo(() => {
    const cessions: NoteLine[] = [];
    const comptes81 = balance.filter(b => /^81/.test(b.compte));
    const comptes82 = balance.filter(b => /^82/.test(b.compte));
    comptes82.forEach(b82 => {
      const suffix = b82.compte.slice(2);
      const b81 = comptes81.find(b => b.compte.slice(2) === suffix);
      const prixCession = b82.mc || b82.sfc || 0;
      const vnc = b81?.md || b81?.sfd || 0;
      const pv = prixCession - vnc;
      if (prixCession > 0 || vnc > 0) {
        cessions.push({
          compte: b82.compte, intitule: b82.intitule,
          prix_cession: prixCession, vnc, plus_value: pv > 0 ? pv : 0, moins_value: pv < 0 ? -pv : 0,
        });
      }
    });
    return cessions;
  }, [balance]);

  // Note 3E — Écarts de réévaluation (compte 106)
  const reevaluations = useMemo(() => buildNote(balance, /^106/,
    [{ key: 'debut', getter: b => b.sc || 0 },
     { key: 'augmentation', getter: b => b.mc || 0 },
     { key: 'diminution', getter: b => b.md || 0 },
     { key: 'fin', getter: b => b.sfc || 0 }]), [balance]);

  // Note 5 — Actifs et Dettes circulants HAO (475 / 481-489)
  const actifsHAO = useMemo(() => buildNote(balance, /^475/,
    [{ key: 'brut', getter: b => b.sfd || 0 },
     { key: 'depreciation', getter: b => b.sfc || 0 },
     { key: 'net', getter: b => (b.sfd || 0) - (b.sfc || 0) }]), [balance]);
  const dettesHAO = useMemo(() => buildNote(balance, /^48/,
    [{ key: 'debut', getter: b => b.sc || 0 },
     { key: 'augmentation', getter: b => b.mc || 0 },
     { key: 'diminution', getter: b => b.md || 0 },
     { key: 'fin', getter: b => b.sfc || 0 }]), [balance]);

  const amorts = useMemo(() => buildNote(balance, /^(28|29)/,
    [{ key: 'cumul_debut', getter: b => b.sc || 0 }, { key: 'dotation', getter: b => b.mc || 0 }, { key: 'reprises', getter: b => b.md || 0 }, { key: 'cumul_fin', getter: b => b.sfc || 0 }],
    r => r.cumul_debut > 0 || r.cumul_fin > 0), [balance]);

  const provisions = useMemo(() => buildNote(balance, /^(15|19|39|49)/,
    [{ key: 'debut', getter: b => b.sc || 0 }, { key: 'dotation', getter: b => b.mc || 0 }, { key: 'reprises', getter: b => b.md || 0 }, { key: 'fin', getter: b => b.sfc || 0 }],
    r => r.debut > 0 || r.fin > 0), [balance]);

  const capitaux = useMemo(() => buildNote(balance, /^(10|11|12|13|14)/,
    [{ key: 'debut', getter: b => b.sc || 0 }, { key: 'augmentation', getter: b => b.mc || 0 }, { key: 'diminution', getter: b => b.md || 0 }, { key: 'fin', getter: b => b.sfc || 0 }],
    r => r.debut > 0 || r.fin > 0), [balance]);

  const emprunts = useMemo(() => buildNote(balance, /^(16|17|18)/,
    [{ key: 'debut', getter: b => b.sc || 0 }, { key: 'souscription', getter: b => b.mc || 0 }, { key: 'remboursement', getter: b => b.md || 0 }, { key: 'fin', getter: b => b.sfc || 0 }],
    r => r.debut > 0 || r.fin > 0), [balance]);

  const stocks = useMemo(() => buildNote(balance, /^(3[0-8])/,
    [{ key: 'debut', getter: b => b.sd || 0 }, { key: 'fin', getter: b => b.sfd || 0 }, { key: 'variation', getter: b => (b.sfd || 0) - (b.sd || 0) }]), [balance]);

  // ─── Notes officielles 7-15A (plaquettes SYSCOHADA) ────────
  // Note 7 — Clients (411, 412, 413, 414, 416, 418, 419, 491)
  const note7Clients = useMemo(() => buildNote(balance, /^(411|412|413|414|416|418|419|491)/,
    [{ key: 'brut', getter: b => b.sfd || 0 },
     { key: 'depreciation', getter: b => b.sfc || 0 },
     { key: 'net', getter: b => (b.sfd || 0) - (b.sfc || 0) }],
    r => (r.brut as number) > 0 || (r.depreciation as number) > 0), [balance]);

  // Note 8 — Autres créances (42, 43, 44 hors 478, 45, 46)
  const note8Autres = useMemo(() => buildNote(balance, /^(42|43|44|45|46)/,
    [{ key: 'brut', getter: b => b.sfd || 0 },
     { key: 'depreciation', getter: b => b.sfc || 0 },
     { key: 'net', getter: b => (b.sfd || 0) - (b.sfc || 0) }],
    r => (r.brut as number) > 0 || (r.depreciation as number) > 0), [balance]);

  // Note 8A — Étalement charges immobilisées (compte 20 — frais d'établissement, charges à répartir, primes obligations)
  const note8AEtalement = useMemo(() => buildNote(balance, /^20/,
    [{ key: 'montant_brut', getter: b => b.sfd || 0 },
     { key: 'amort_cumule', getter: b => b.sfc || 0 },
     { key: 'net', getter: b => (b.sfd || 0) - (b.sfc || 0) }]), [balance]);

  // Note 9 — Titres de placement (50)
  const note9Titres = useMemo(() => buildNote(balance, /^50/,
    [{ key: 'brut', getter: b => b.sfd || 0 },
     { key: 'depreciation', getter: b => b.sfc || 0 },
     { key: 'net', getter: b => (b.sfd || 0) - (b.sfc || 0) }]), [balance]);

  // Note 10 — Valeurs à encaisser (51)
  const note10Valeurs = useMemo(() => buildNote(balance, /^51/,
    [{ key: 'brut', getter: b => b.sfd || 0 },
     { key: 'depreciation', getter: b => b.sfc || 0 },
     { key: 'net', getter: b => (b.sfd || 0) - (b.sfc || 0) }]), [balance]);

  // Note 11 — Banques, CCP, Caisses (52, 53, 54, 57, 58)
  const note11Banques = useMemo(() => buildNote(balance, /^(52|53|54|57|58)/,
    [{ key: 'debit', getter: b => b.sfd || 0 },
     { key: 'credit', getter: b => b.sfc || 0 },
     { key: 'solde', getter: b => (b.sfd || 0) - (b.sfc || 0) }]), [balance]);

  // Note 12 — Écarts de conversion (478/479) et transferts de charges (781/787)
  const note12Ecarts = useMemo(() => buildNote(balance, /^(478|479|781|787)/,
    [{ key: 'debit', getter: b => b.sfd || 0 },
     { key: 'credit', getter: b => b.sfc || 0 }]), [balance]);

  // Note 13 — Capital (101 à 109)
  const note13Capital = useMemo(() => buildNote(balance, /^10/,
    [{ key: 'debut', getter: b => b.sc || 0 },
     { key: 'augmentation', getter: b => b.mc || 0 },
     { key: 'diminution', getter: b => b.md || 0 },
     { key: 'fin', getter: b => b.sfc || 0 }],
    r => (r.debut as number) > 0 || (r.fin as number) > 0), [balance]);

  // Note 14 — Primes (105) et réserves (111-118), Report à nouveau (12)
  const note14Primes = useMemo(() => buildNote(balance, /^(105|11|12)/,
    [{ key: 'debut', getter: b => b.sc || 0 },
     { key: 'augmentation', getter: b => b.mc || 0 },
     { key: 'diminution', getter: b => b.md || 0 },
     { key: 'fin', getter: b => b.sfc || 0 }],
    r => (r.debut as number) > 0 || (r.fin as number) > 0), [balance]);

  // Note 15A — Subventions d'investissement (14) et provisions réglementées (15)
  const note15ASubvProv = useMemo(() => buildNote(balance, /^(14|15)/,
    [{ key: 'debut', getter: b => b.sc || 0 },
     { key: 'augmentation', getter: b => b.mc || 0 },
     { key: 'diminution', getter: b => b.md || 0 },
     { key: 'fin', getter: b => b.sfc || 0 }],
    r => (r.debut as number) > 0 || (r.fin as number) > 0), [balance]);

  // ─── Notes héritées (à remapper aux prochains lots 16+) ─────
  const tresorerie = useMemo(() => buildNote(balance, /^(5[0-9])/,
    [{ key: 'debit', getter: b => b.sfd || 0 }, { key: 'credit', getter: b => b.sfc || 0 }, { key: 'solde', getter: b => (b.sfd || 0) - (b.sfc || 0) }]), [balance]);

  const participations = useMemo(() => buildNote(balance, /^(26|27)/,
    [{ key: 'debut', getter: b => b.sd || 0 }, { key: 'fin', getter: b => b.sfd || 0 }, { key: 'produits', getter: b => b.mc || 0 }],
    r => r.debut > 0 || r.fin > 0), [balance]);

  const ca = useMemo(() => buildNote(balance, /^(70)/, [{ key: 'montant', getter: b => (b.sfc || 0) || (b.mc || 0) }]), [balance]);
  const achats = useMemo(() => buildNote(balance, /^(60|61|62)/, [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }]), [balance]);
  const autresCharges = useMemo(() => buildNote(balance, /^(63|64|65)/, [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }]), [balance]);
  const personnel = useMemo(() => buildNote(balance, /^(66)/, [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }]), [balance]);
  const dotationsAmort = useMemo(() => buildNote(balance, /^(681|691)/, [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }]), [balance]);
  const dotationsProv = useMemo(() => buildNote(balance, /^(689|699|659)/, [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }]), [balance]);
  const reprisesAll = useMemo(() => buildNote(balance, /^(791|797|799|759)/, [{ key: 'montant', getter: b => (b.sfc || 0) || (b.mc || 0) }]), [balance]);
  const transfertsCharges = useMemo(() => buildNote(balance, /^(78|79)/, [{ key: 'montant', getter: b => (b.sfc || 0) || (b.mc || 0) }]), [balance]);
  const autresProduits = useMemo(() => buildNote(balance, /^(71|72|73|74|75|78)/, [{ key: 'montant', getter: b => (b.sfc || 0) || (b.mc || 0) }]), [balance]);
  const financierCharges = useMemo(() => buildNote(balance, /^(67)/, [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }]), [balance]);
  const financierProduits = useMemo(() => buildNote(balance, /^(77)/, [{ key: 'montant', getter: b => (b.sfc || 0) || (b.mc || 0) }]), [balance]);
  const haoCharges = useMemo(() => buildNote(balance, /^(81|83|85)/, [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }]), [balance]);
  const haoProduits = useMemo(() => buildNote(balance, /^(82|84|86)/, [{ key: 'montant', getter: b => (b.sfc || 0) || (b.mc || 0) }]), [balance]);
  const impots = useMemo(() => buildNote(balance, /^(64|69)/, [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }]), [balance]);

  const totalActif = balance.filter(b => /^[2-5]/.test(b.compte)).reduce((s, b) => s + (b.sfd || 0), 0);
  const totalPassif = balance.filter(b => /^[1-5]/.test(b.compte)).reduce((s, b) => s + (b.sfc || 0), 0);
  const totalCA = totalOf(ca, 'montant');
  const totalCharges = totalOf(achats, 'montant') + totalOf(autresCharges, 'montant') + totalOf(personnel, 'montant');
  const totalTreso = totalOf(tresorerie, 'solde');
  const nbEcritures = journal.length;

  const handleExportImmo = () => {
    exportCsv(['Compte', 'Intitulé', 'Brut Début', 'Acquisitions', 'Cessions', 'Brut Fin'],
      immos.map(r => [r.compte, r.intitule, r.brut_debut, r.acquisitions, r.cessions, r.brut_fin]),
      `note_immo_${exercice?.annee}`);
  };

  const tabGroups = [
    { label: '📊 Synthèse', tabs: [{ id: 'resume', label: 'Résumé' }] },
    { label: '🛡 Notes générales (1-2)', tabs: [
      { id: 'engagements', label: '1. Dettes garanties' },
      { id: 'methodes', label: '2. Méthodes comptables' },
    ]},
    { label: '🏢 Actif immobilisé (3A-3E)', tabs: [
      { id: 'immo', label: '3A. Immo. brutes' },
      { id: 'creditbail', label: '3B. Crédit-bail' },
      { id: 'amort', label: '3C. Amortissements' },
      { id: 'plusmoins', label: '3D. +/- values' },
      { id: 'reeval', label: '3E. Réévaluations' },
    ]},
    { label: '💼 Bilan (4-12)', tabs: [
      { id: 'participations', label: '4. Immo. financières' },
      { id: 'haoactif', label: '5A. Actifs HAO' },
      { id: 'haopassif', label: '5B. Dettes HAO' },
      { id: 'stocks', label: '6. Stocks' },
      { id: 'creances', label: '7. Créances' },
      { id: 'tresorerie', label: '8. Trésorerie' },
      { id: 'capitaux', label: '9. Capitaux propres' },
      { id: 'subventions', label: '10. Subventions' },
      { id: 'prov', label: '11. Provisions' },
      { id: 'emprunts', label: '12. Emprunts' },
      { id: 'regul', label: '13. Régularisation' },
      { id: 'constatees', label: '14. Constatés' },
    ]},
    { label: '📈 Compte de résultat (21-29)', tabs: [
      { id: 'ca', label: '21. CA' },
      { id: 'achats', label: '22. Achats' },
      { id: 'charges', label: '23. Autres charges' },
      { id: 'personnel', label: '24. Personnel' },
      { id: 'dotamort', label: '25. Dot. amort.' },
      { id: 'dotprov', label: '26. Dot. prov.' },
      { id: 'reprises', label: '27. Reprises' },
      { id: 'transferts', label: '28. Transferts' },
      { id: 'produits', label: '29. Autres pr.' },
      { id: 'fincharges', label: '30. Ch. fin.' },
      { id: 'finproduits', label: '31. Pr. fin.' },
      { id: 'haocharges', label: '32. Ch. HAO' },
      { id: 'haoproduits', label: '33. Pr. HAO' },
      { id: 'impots', label: '34. Impôts' },
    ]},
    { label: '📝 Informations (35-38)', tabs: [
      { id: 'parties', label: '35. Parties liées' },
      { id: 'effectifs', label: '36. Effectifs' },
      { id: 'evenements', label: '37. Événements' },
      { id: 'fiscalite', label: '38. Régime fiscal' },
      { id: 'identification', label: '39. Identification' },
      { id: 'approbation', label: '40. Approbation' },
    ]},
  ];

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">Notes Annexes</div>
          <div className="text-[10px] text-fg3 font-mono">SYSCOHADA Révisé — {entreprise?.nom} — Exercice {exercice?.annee} — Notes 1 à 40 (plaquettes officielles)</div>
        </div>
      </div>

      <div className="p-5">
        <Tabs value={tab} onValueChange={setTab}>
          <div className="space-y-2 mb-4">
            {tabGroups.map(g => (
              <div key={g.label}>
                <div className="text-[9px] text-fg3 font-mono uppercase tracking-wider mb-1 px-1">{g.label}</div>
                <TabsList className="flex flex-wrap h-auto gap-0.5 bg-bg2 p-1">
                  {g.tabs.map(t => (
                    <TabsTrigger key={t.id} value={t.id} className="text-[9px] px-1.5 py-0.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t.label}</TabsTrigger>
                  ))}
                </TabsList>
              </div>
            ))}
          </div>

          {/* Résumé */}
          <TabsContent value="resume">
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <SummaryCard label="Total Actif" value={fmt(totalActif)} />
                <SummaryCard label="Total Passif" value={fmt(totalPassif)} />
                <SummaryCard label="Chiffre d'Affaires" value={fmt(totalCA)} />
                <SummaryCard label="Charges Exploit." value={fmt(totalCharges)} />
                <SummaryCard label="Trésorerie Nette" value={fmt(totalTreso)} />
                <SummaryCard label="Écritures" value={String(nbEcritures)} sub={`Exercice ${exercice?.annee}`} />
              </div>
              <div className="bg-bg2 border border-border rounded-lg p-4">
                <h3 className="text-xs font-bold text-primary mb-2">Sommaire des Notes Annexes</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5">
                  {tabGroups.slice(1).map(g => (
                    <div key={g.label}>
                      <div className="text-[10px] font-bold text-fg2 mt-2 mb-1">{g.label}</div>
                      {g.tabs.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)} className="block text-[10px] text-fg3 hover:text-primary py-0.5 pl-2">{t.label}</button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Bilan notes — numérotation officielle SYSCOHADA */}
          <TabsContent value="immo"><NoteTable noteNum="3A" title="Immobilisations brutes (acquisitions, apports, scissions, réévaluations, cessions)" headers={['Compte', 'Intitulé', 'Brut Début', 'Acquisitions', 'Apports', 'Scissions', 'Réévaluations', 'Cessions', 'Brut Fin']} rows={immos} colKeys={['brut_debut', 'acquisitions', 'apports', 'scissions', 'reevaluations', 'cessions', 'brut_fin']} colStyles={{ acquisitions: 'text-success', cessions: 'text-destructive' }} onExport={handleExportImmo} /></TabsContent>
          <TabsContent value="creditbail"><NoteTable noteNum="3B" title="Immobilisations acquises en crédit-bail et contrats assimilés" headers={['Compte', 'Intitulé', 'Valeur d\'origine', 'Redevances', 'Amort. cumulé', 'VNC']} rows={creditBail} colKeys={['valeur_origine', 'redevances', 'amort_cumule', 'vnc']} /></TabsContent>
          <TabsContent value="amort"><NoteTable noteNum="3C" title="Amortissements" headers={['Compte', 'Intitulé', 'Cumul Début', 'Dotation', 'Reprises', 'Cumul Fin']} rows={amorts} colKeys={['cumul_debut', 'dotation', 'reprises', 'cumul_fin']} colStyles={{ dotation: 'text-destructive', reprises: 'text-success' }} /></TabsContent>
          <TabsContent value="plusmoins"><NoteTable noteNum="3D" title="Plus-values et moins-values de cession d'immobilisations" headers={['Compte', 'Intitulé', 'Prix de cession', 'VNC', 'Plus-value', 'Moins-value']} rows={plusMoinsValues} colKeys={['prix_cession', 'vnc', 'plus_value', 'moins_value']} colStyles={{ plus_value: 'text-success', moins_value: 'text-destructive' }} /></TabsContent>
          <TabsContent value="reeval"><NoteTable noteNum="3E" title="Écarts de réévaluation (compte 106)" headers={['Compte', 'Intitulé', 'Début', 'Augmentation', 'Diminution', 'Fin']} rows={reevaluations} colKeys={['debut', 'augmentation', 'diminution', 'fin']} /></TabsContent>
          <TabsContent value="participations"><NoteTable noteNum={4} title="Immobilisations financières (titres de participation, prêts, dépôts)" headers={['Compte', 'Intitulé', 'Début', 'Fin', 'Produits / Dividendes']} rows={participations} colKeys={['debut', 'fin', 'produits']} /></TabsContent>
          <TabsContent value="haoactif"><NoteTable noteNum="5A" title="Actifs circulants HAO (compte 475)" headers={['Compte', 'Intitulé', 'Brut', 'Dépréciation', 'Net']} rows={actifsHAO} colKeys={['brut', 'depreciation', 'net']} /></TabsContent>
          <TabsContent value="haopassif"><NoteTable noteNum="5B" title="Dettes circulantes HAO (comptes 481-489)" headers={['Compte', 'Intitulé', 'Début', 'Augmentation', 'Diminution', 'Fin']} rows={dettesHAO} colKeys={['debut', 'augmentation', 'diminution', 'fin']} /></TabsContent>
          <TabsContent value="stocks"><NoteTable noteNum={6} title="Stocks et en-cours" headers={['Compte', 'Intitulé', 'Début', 'Fin', 'Variation']} rows={stocks} colKeys={['debut', 'fin', 'variation']} /></TabsContent>
          {/* Notes officielles 7 à 15A — alignées plaquettes SYSCOHADA */}
          <TabsContent value="creances"><NoteTable noteNum={7} title="Clients (411, 412, 413, 414, 416, 418, 419, 491)" headers={['Compte', 'Intitulé', 'Brut', 'Dépréciation', 'Net']} rows={note7Clients} colKeys={['brut', 'depreciation', 'net']} colStyles={{ brut: 'text-primary', depreciation: 'text-destructive' }} /></TabsContent>
          <TabsContent value="tresorerie"><NoteTable noteNum={8} title="Autres créances (Personnel, Organismes sociaux, État, Débiteurs divers — 42, 43, 44, 45, 46)" headers={['Compte', 'Intitulé', 'Brut', 'Dépréciation', 'Net']} rows={note8Autres} colKeys={['brut', 'depreciation', 'net']} /></TabsContent>
          <TabsContent value="etalement"><NoteTable noteNum="8A" title="Tableau d'étalement des charges immobilisées (frais d'établissement, charges à répartir, primes obligations — compte 20)" headers={['Compte', 'Intitulé', 'Montant brut', 'Amort. cumulé', 'Net']} rows={note8AEtalement} colKeys={['montant_brut', 'amort_cumule', 'net']} /></TabsContent>
          <TabsContent value="capitaux"><NoteTable noteNum={9} title="Titres de placement (actions, obligations, bons — compte 50)" headers={['Compte', 'Intitulé', 'Brut', 'Dépréciation', 'Net']} rows={note9Titres} colKeys={['brut', 'depreciation', 'net']} /></TabsContent>
          <TabsContent value="subventions"><NoteTable noteNum={10} title="Valeurs à encaisser (effets, chèques, cartes de crédit — compte 51)" headers={['Compte', 'Intitulé', 'Brut', 'Dépréciation', 'Net']} rows={note10Valeurs} colKeys={['brut', 'depreciation', 'net']} /></TabsContent>
          <TabsContent value="prov"><NoteTable noteNum={11} title="Banques, chèques postaux et caisses (52, 53, 54, 57, 58)" headers={['Compte', 'Intitulé', 'Débit', 'Crédit', 'Solde']} rows={note11Banques} colKeys={['debit', 'credit', 'solde']} colStyles={{ solde: 'text-success' }} /></TabsContent>
          <TabsContent value="emprunts"><NoteTable noteNum={12} title="Écarts de conversion (478/479) et transferts de charges (781/787)" headers={['Compte', 'Intitulé', 'Débit', 'Crédit']} rows={note12Ecarts} colKeys={['debit', 'credit']} /></TabsContent>
          <TabsContent value="regul"><NoteTable noteNum={13} title="Capital social (compte 10 — 101 à 109)" headers={['Compte', 'Intitulé', 'Début', 'Augmentation', 'Diminution', 'Fin']} rows={note13Capital} colKeys={['debut', 'augmentation', 'diminution', 'fin']} colStyles={{ augmentation: 'text-success' }} /></TabsContent>
          <TabsContent value="constatees"><NoteTable noteNum={14} title="Primes (105) et Réserves (11) — Report à nouveau (12)" headers={['Compte', 'Intitulé', 'Début', 'Augmentation', 'Diminution', 'Fin']} rows={note14Primes} colKeys={['debut', 'augmentation', 'diminution', 'fin']} /></TabsContent>
          <TabsContent value="subvprov"><NoteTable noteNum="15A" title="Subventions d'investissement (14) et Provisions réglementées (15)" headers={['Compte', 'Intitulé', 'Début', 'Augmentation', 'Diminution', 'Fin']} rows={note15ASubvProv} colKeys={['debut', 'augmentation', 'diminution', 'fin']} /></TabsContent>

          {/* Résultat notes — Notes 21 à 34 */}
          <TabsContent value="ca"><NoteTable noteNum={21} title="Chiffre d'affaires détaillé" headers={['Compte', 'Intitulé', 'Montant']} rows={ca} colKeys={['montant']} /></TabsContent>
          <TabsContent value="achats"><NoteTable noteNum={22} title="Achats et services extérieurs" headers={['Compte', 'Intitulé', 'Montant']} rows={achats} colKeys={['montant']} /></TabsContent>
          <TabsContent value="charges"><NoteTable noteNum={23} title="Autres charges d'exploitation" headers={['Compte', 'Intitulé', 'Montant']} rows={autresCharges} colKeys={['montant']} /></TabsContent>
          <TabsContent value="personnel"><NoteTable noteNum={24} title="Charges de personnel" headers={['Compte', 'Intitulé', 'Montant']} rows={personnel} colKeys={['montant']} /></TabsContent>
          <TabsContent value="dotamort"><NoteTable noteNum={25} title="Dotations aux amortissements" headers={['Compte', 'Intitulé', 'Montant']} rows={dotationsAmort} colKeys={['montant']} /></TabsContent>
          <TabsContent value="dotprov"><NoteTable noteNum={26} title="Dotations aux provisions et dépréciations" headers={['Compte', 'Intitulé', 'Montant']} rows={dotationsProv} colKeys={['montant']} /></TabsContent>
          <TabsContent value="reprises"><NoteTable noteNum={27} title="Reprises de provisions, amortissements et dépréciations" headers={['Compte', 'Intitulé', 'Montant']} rows={reprisesAll} colKeys={['montant']} colStyles={{ montant: 'text-success' }} /></TabsContent>
          <TabsContent value="transferts"><NoteTable noteNum={28} title="Transferts de charges" headers={['Compte', 'Intitulé', 'Montant']} rows={transfertsCharges} colKeys={['montant']} /></TabsContent>
          <TabsContent value="produits"><NoteTable noteNum={29} title="Autres produits" headers={['Compte', 'Intitulé', 'Montant']} rows={autresProduits} colKeys={['montant']} /></TabsContent>
          <TabsContent value="fincharges"><NoteTable noteNum={30} title="Charges financières" headers={['Compte', 'Intitulé', 'Montant']} rows={financierCharges} colKeys={['montant']} colStyles={{ montant: 'text-destructive' }} /></TabsContent>
          <TabsContent value="finproduits"><NoteTable noteNum={31} title="Produits financiers" headers={['Compte', 'Intitulé', 'Montant']} rows={financierProduits} colKeys={['montant']} colStyles={{ montant: 'text-success' }} /></TabsContent>
          <TabsContent value="haocharges"><NoteTable noteNum={32} title="Charges HAO" headers={['Compte', 'Intitulé', 'Montant']} rows={haoCharges} colKeys={['montant']} colStyles={{ montant: 'text-destructive' }} /></TabsContent>
          <TabsContent value="haoproduits"><NoteTable noteNum={33} title="Produits HAO" headers={['Compte', 'Intitulé', 'Montant']} rows={haoProduits} colKeys={['montant']} colStyles={{ montant: 'text-success' }} /></TabsContent>
          <TabsContent value="impots"><NoteTable noteNum={34} title="Impôts sur le résultat" headers={['Compte', 'Intitulé', 'Montant']} rows={impots} colKeys={['montant']} /></TabsContent>

          {/* Note 1 — Dettes garanties par des sûretés réelles (officielle SYSCOHADA) */}
          <TabsContent value="engagements">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 1 — Dettes garanties par des sûretés réelles & engagements hors bilan</span>
              </div>
              <div className="px-4 py-3 text-[11px] text-fg2 leading-relaxed space-y-2">
                <p className="font-bold">Sûretés réelles consenties (sur biens de l'entreprise) :</p>
                <EditableField label="Hypothèques sur immeubles" noteKey="sur_hypotheques" notesData={notesData} onSave={saveNote} />
                <EditableField label="Nantissements sur fonds de commerce" noteKey="sur_nant_fonds" notesData={notesData} onSave={saveNote} />
                <EditableField label="Nantissements sur titres" noteKey="sur_nant_titres" notesData={notesData} onSave={saveNote} />
                <EditableField label="Gages sur matériel / véhicules" noteKey="sur_gages" notesData={notesData} onSave={saveNote} />
                <EditableField label="Privilèges (Trésor, sécurité sociale)" noteKey="sur_privileges" notesData={notesData} onSave={saveNote} />

                <p className="font-bold mt-3">Engagements donnés :</p>
                <EditableField label="Cautions & garanties données" noteKey="eng_cautions_donnees" notesData={notesData} onSave={saveNote} />
                <EditableField label="Effets escomptés non échus" noteKey="eng_effets" notesData={notesData} onSave={saveNote} />
                <EditableField label="Engagements de crédit-bail restants" noteKey="eng_credit_bail" notesData={notesData} onSave={saveNote} />

                <p className="font-bold mt-3">Engagements reçus :</p>
                <EditableField label="Cautions & garanties reçues" noteKey="eng_cautions_recues" notesData={notesData} onSave={saveNote} />
                <EditableField label="Lignes de crédit non utilisées" noteKey="eng_lignes_credit" notesData={notesData} onSave={saveNote} />
                <EditableField label="Avals & cautionnements reçus" noteKey="eng_avals" notesData={notesData} onSave={saveNote} />
              </div>
            </div>
          </TabsContent>

          {/* Note 2 — Méthodes comptables (enrichi : dérogations + infos complémentaires) */}
          <TabsContent value="methodes">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 2 — Règles et méthodes comptables</span>
              </div>
              <div className="px-4 py-3 text-[11px] text-fg2 leading-relaxed space-y-2">
                <p><strong>Référentiel :</strong> SYSCOHADA révisé (Acte Uniforme du 26 janvier 2017).</p>
                <p><strong>Conventions de base :</strong> Continuité d'exploitation, coût historique, prudence, permanence des méthodes, spécialisation des exercices, intangibilité du bilan d'ouverture, importance significative.</p>

                <p className="font-bold mt-2">Méthodes appliquées :</p>
                <EditableField label="Méthode d'amortissement" noteKey="methode_amort" notesData={notesData} onSave={saveNote} />
                <EditableField label="Méthode d'évaluation des stocks" noteKey="methode_stocks" notesData={notesData} onSave={saveNote} />
                <EditableField label="Traitement des devises" noteKey="methode_devises" notesData={notesData} onSave={saveNote} />
                <EditableField label="Méthode de comptabilisation des produits" noteKey="methode_produits" notesData={notesData} onSave={saveNote} />
                <EditableField label="Provisions et dépréciations" noteKey="methode_prov" notesData={notesData} onSave={saveNote} />

                <p className="font-bold mt-3">Dérogations aux principes comptables :</p>
                <EditableField label="Dérogation appliquée" noteKey="derogation_1" notesData={notesData} onSave={saveNote} />
                <EditableField label="Justification & impact" noteKey="derogation_just" notesData={notesData} onSave={saveNote} />

                <p className="font-bold mt-3">Changements de méthode :</p>
                <EditableField label="Changement n°1" noteKey="changement_1" notesData={notesData} onSave={saveNote} />
                <EditableField label="Impact sur les capitaux propres" noteKey="changement_impact" notesData={notesData} onSave={saveNote} />

                <p className="font-bold mt-3">Informations complémentaires :</p>
                <EditableField label="Méthodes spécifiques au secteur" noteKey="info_secteur" notesData={notesData} onSave={saveNote} />
                <EditableField label="Autres informations utiles" noteKey="info_autres" notesData={notesData} onSave={saveNote} />

                <p className="mt-2"><strong>Monnaie :</strong> {entreprise?.monnaie || 'FCFA'}</p>
              </div>
            </div>
          </TabsContent>

          {/* Note 35 — Parties Liées */}
          <TabsContent value="parties">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 35 — Parties liées</span>
              </div>
              <div className="px-4 py-3 text-[11px] text-fg2 leading-relaxed space-y-2">
                <EditableField label="Rémunérations des dirigeants" noteKey="pl_remunerations" notesData={notesData} onSave={saveNote} />
                <EditableField label="Avances aux dirigeants" noteKey="pl_avances" notesData={notesData} onSave={saveNote} />
                <EditableField label="Ventes/achats intragroupe" noteKey="pl_intragroupe" notesData={notesData} onSave={saveNote} />
                <EditableField label="Comptes courants associés" noteKey="pl_courants" notesData={notesData} onSave={saveNote} />
                <EditableField label="Autres transactions" noteKey="pl_autres" notesData={notesData} onSave={saveNote} />
              </div>
            </div>
          </TabsContent>

          {/* Note 36 — Effectifs */}
          <TabsContent value="effectifs">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 36 — Effectifs et masse salariale</span>
              </div>
              <div className="px-4 py-3 text-[11px] text-fg2 leading-relaxed space-y-2">
                <p>Effectif moyen de l'exercice {exercice?.annee} :</p>
                <EditableField label="Cadres supérieurs" noteKey="eff_cadres_sup" notesData={notesData} onSave={saveNote} />
                <EditableField label="Cadres" noteKey="eff_cadres" notesData={notesData} onSave={saveNote} />
                <EditableField label="Agents de maîtrise" noteKey="eff_maitrise" notesData={notesData} onSave={saveNote} />
                <EditableField label="Employés" noteKey="eff_employes" notesData={notesData} onSave={saveNote} />
                <EditableField label="Ouvriers" noteKey="eff_ouvriers" notesData={notesData} onSave={saveNote} />
                <EditableField label="Stagiaires / Apprentis" noteKey="eff_stagiaires" notesData={notesData} onSave={saveNote} />
                <EditableField label="Effectif total" noteKey="eff_total" notesData={notesData} onSave={saveNote} />
                <p className="text-fg3 italic mt-2">Masse salariale : {fmt(totalOf(personnel, 'montant'))} {entreprise?.monnaie || 'FCFA'}</p>
              </div>
            </div>
          </TabsContent>

          {/* Note 37 — Événements postérieurs */}
          <TabsContent value="evenements">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 37 — Événements postérieurs à la clôture</span>
              </div>
              <div className="px-4 py-3 text-[11px] text-fg2 leading-relaxed space-y-2">
                <p>Événements significatifs survenus après la clôture ({exercice?.annee ? `31/12/${exercice.annee}` : '—'}) :</p>
                <EditableField label="Événement 1" noteKey="evt_1" notesData={notesData} onSave={saveNote} />
                <EditableField label="Événement 2" noteKey="evt_2" notesData={notesData} onSave={saveNote} />
                <EditableField label="Événement 3" noteKey="evt_3" notesData={notesData} onSave={saveNote} />
                <EditableField label="Commentaire" noteKey="evt_commentaire" notesData={notesData} onSave={saveNote} />
              </div>
            </div>
          </TabsContent>

          {/* Note 38 — Régime fiscal */}
          <TabsContent value="fiscalite">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 38 — Régime fiscal et information sectorielle</span>
              </div>
              <div className="px-4 py-3 text-[11px] text-fg2 leading-relaxed space-y-2">
                <EditableField label="Régime d'imposition" noteKey="fisc_regime" notesData={notesData} onSave={saveNote} />
                <EditableField label="Taux IS applicable" noteKey="fisc_taux_is" notesData={notesData} onSave={saveNote} />
                <EditableField label="Régime TVA" noteKey="fisc_tva" notesData={notesData} onSave={saveNote} />
                <EditableField label="Patente" noteKey="fisc_patente" notesData={notesData} onSave={saveNote} />
                <EditableField label="Déficits reportables" noteKey="fisc_deficits" notesData={notesData} onSave={saveNote} />
                <EditableField label="Avantages fiscaux" noteKey="fisc_avantages" notesData={notesData} onSave={saveNote} />
                <div className="bg-bg3 rounded p-3 mt-2">
                  <p className="text-[10px] font-bold mb-1">Charge d'impôt :</p>
                  <p className="font-mono text-sm">{fmt(totalOf(impots, 'montant'))} {entreprise?.monnaie || 'FCFA'}</p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Note 39 — Identification (fiche signalétique R1) */}
          <TabsContent value="identification">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 39 — Fiche signalétique de l'entreprise</span>
              </div>
              <div className="px-4 py-3">
                <div className="bg-bg3 rounded p-4 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div><span className="text-fg3">Dénomination :</span> <strong>{entreprise?.nom || '—'}</strong></div>
                    <div><span className="text-fg3">Sigle :</span> <strong>{entreprise?.sigle || '—'}</strong></div>
                    <div><span className="text-fg3">Forme juridique :</span> <strong>{entreprise?.forme_juridique || '—'}</strong></div>
                    <div><span className="text-fg3">Secteur :</span> <strong>{entreprise?.secteur || '—'}</strong></div>
                    <div><span className="text-fg3">NINEA :</span> <strong className="font-mono">{entreprise?.ninea || '—'}</strong></div>
                    <div><span className="text-fg3">RCCM :</span> <strong className="font-mono">{entreprise?.rccm || '—'}</strong></div>
                    <div><span className="text-fg3">Adresse :</span> <strong>{entreprise?.adresse || '—'}</strong></div>
                    <div><span className="text-fg3">Téléphone :</span> <strong>{entreprise?.tel || '—'}</strong></div>
                    <div><span className="text-fg3">Monnaie :</span> <strong>{entreprise?.monnaie || 'FCFA'}</strong></div>
                    <div><span className="text-fg3">Exercice :</span> <strong>{exercice?.annee || '—'} ({exercice?.statut || '—'})</strong></div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Note 40 — Approbation */}
          <TabsContent value="approbation">
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border">
                <span className="text-xs font-bold text-primary">📋 Note 40 — Approbation des états financiers</span>
              </div>
              <div className="px-4 py-3 text-[11px] text-fg2 leading-relaxed space-y-3">
                <p>États financiers de l'exercice clos le {exercice?.annee ? `31/12/${exercice.annee}` : '—'} :</p>
                <div className="bg-bg3 rounded p-4 space-y-3">
                  <EditableField label="Directeur Général / Gérant" noteKey="appro_dg" notesData={notesData} onSave={saveNote} />
                  <EditableField label="Commissaire aux Comptes" noteKey="appro_cac" notesData={notesData} onSave={saveNote} />
                  <EditableField label="Expert-Comptable" noteKey="appro_ec" notesData={notesData} onSave={saveNote} />
                  <EditableField label="Lieu" noteKey="appro_lieu" notesData={notesData} onSave={saveNote} />
                  <EditableField label="Date" noteKey="appro_date" notesData={notesData} onSave={saveNote} />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
