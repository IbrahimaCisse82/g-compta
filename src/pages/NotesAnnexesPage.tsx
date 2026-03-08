import { useMemo, useState } from 'react';
import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { exportCsv } from '@/lib/csv-export';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// ─── Types ─────────────────────────────────────────────
interface NoteLine {
  compte: string;
  intitule: string;
  [key: string]: string | number;
}

function buildNote(
  balance: any[],
  pattern: RegExp,
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

// ─── Reusable table component ──────────────────────────
function NoteTable({
  title,
  noteNum,
  headers,
  rows,
  colKeys,
  colStyles,
  onExport,
}: {
  title: string;
  noteNum: number;
  headers: string[];
  rows: NoteLine[];
  colKeys: string[];
  colStyles?: Record<string, string>;
  onExport?: () => void;
}) {
  const styles = colStyles || {};
  return (
    <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between">
        <span className="text-xs font-bold text-primary">📋 Note {noteNum} — {title}</span>
        {onExport && (
          <button onClick={onExport} className="text-[10px] text-fg3 hover:text-primary">📥 CSV</button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {headers.map(h => (
                <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[0.5px] font-mono border-b border-border">{h}</th>
              ))}
            </tr>
          </thead>
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
            {rows.length === 0 && (
              <tr><td colSpan={headers.length} className="px-3 py-4 text-center text-fg3 text-xs">Aucune donnée</td></tr>
            )}
            {rows.length > 0 && (
              <tr className="bg-bg3 font-bold">
                <td colSpan={2} className="px-3 py-1.5 text-[10px] border-t border-border">TOTAL</td>
                {colKeys.map(k => (
                  <td key={k} className={`px-3 py-1.5 text-[10px] font-mono text-right border-t border-border ${styles[k] || ''}`}>
                    {fmt(totalOf(rows, k))}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────
export default function NotesAnnexesPage() {
  const { balance, journal, entreprise, exercice } = useApp();
  const [tab, setTab] = useState('immo');

  // Note 1: Immobilisations
  const immos = useMemo(() => buildNote(
    balance.filter(b => !/^(28|29)/.test(b.compte)),
    /^(20|21|22|23|24|25|26|27)/,
    [
      { key: 'brut_debut', getter: b => b.sd || 0 },
      { key: 'acquisitions', getter: b => b.md || 0 },
      { key: 'cessions', getter: b => b.mc || 0 },
      { key: 'brut_fin', getter: b => b.sfd || 0 },
    ],
    r => r.brut_debut > 0 || r.brut_fin > 0,
  ), [balance]);

  // Note 2: Amortissements
  const amorts = useMemo(() => buildNote(
    balance, /^(28|29)/,
    [
      { key: 'cumul_debut', getter: b => b.sc || 0 },
      { key: 'dotation', getter: b => b.mc || 0 },
      { key: 'reprises', getter: b => b.md || 0 },
      { key: 'cumul_fin', getter: b => b.sfc || 0 },
    ],
    r => r.cumul_debut > 0 || r.cumul_fin > 0,
  ), [balance]);

  // Note 3: Provisions
  const provisions = useMemo(() => buildNote(
    balance, /^(15|19|39|49)/,
    [
      { key: 'debut', getter: b => b.sc || 0 },
      { key: 'dotation', getter: b => b.mc || 0 },
      { key: 'reprises', getter: b => b.md || 0 },
      { key: 'fin', getter: b => b.sfc || 0 },
    ],
    r => r.debut > 0 || r.fin > 0,
  ), [balance]);

  // Note 4: Créances & Dettes
  const creances = useMemo(() => buildNote(
    balance, /^(4[0-9])/,
    [
      { key: 'debiteur', getter: b => b.sfd || 0 },
      { key: 'crediteur', getter: b => b.sfc || 0 },
    ],
    r => r.debiteur > 0 || r.crediteur > 0,
  ), [balance]);

  // Note 5: Personnel
  const personnel = useMemo(() => buildNote(
    balance, /^(66)/,
    [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }],
  ), [balance]);

  // Note 6: CA détaillé
  const ca = useMemo(() => buildNote(
    balance, /^(70)/,
    [{ key: 'montant', getter: b => (b.sfc || 0) || (b.mc || 0) }],
  ), [balance]);

  // Note 7: Capitaux propres
  const capitaux = useMemo(() => buildNote(
    balance, /^(10|11|12|13|14)/,
    [
      { key: 'debut', getter: b => b.sc || 0 },
      { key: 'augmentation', getter: b => b.mc || 0 },
      { key: 'diminution', getter: b => b.md || 0 },
      { key: 'fin', getter: b => b.sfc || 0 },
    ],
    r => r.debut > 0 || r.fin > 0,
  ), [balance]);

  // Note 8: Emprunts & dettes financières
  const emprunts = useMemo(() => buildNote(
    balance, /^(16|17)/,
    [
      { key: 'debut', getter: b => b.sc || 0 },
      { key: 'souscription', getter: b => b.mc || 0 },
      { key: 'remboursement', getter: b => b.md || 0 },
      { key: 'fin', getter: b => b.sfc || 0 },
    ],
    r => r.debut > 0 || r.fin > 0,
  ), [balance]);

  // Note 9: Stocks
  const stocks = useMemo(() => buildNote(
    balance, /^(3[0-8])/,
    [
      { key: 'debut', getter: b => b.sd || 0 },
      { key: 'fin', getter: b => b.sfd || 0 },
      { key: 'variation', getter: b => (b.sfd || 0) - (b.sd || 0) },
    ],
  ), [balance]);

  // Note 10: Trésorerie
  const tresorerie = useMemo(() => buildNote(
    balance, /^(5[0-9])/,
    [
      { key: 'debit', getter: b => b.sfd || 0 },
      { key: 'credit', getter: b => b.sfc || 0 },
      { key: 'solde', getter: b => (b.sfd || 0) - (b.sfc || 0) },
    ],
  ), [balance]);

  // Note 11: Achats
  const achats = useMemo(() => buildNote(
    balance, /^(60|61|62)/,
    [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }],
  ), [balance]);

  // Note 12: Autres charges d'exploitation
  const autresCharges = useMemo(() => buildNote(
    balance, /^(63|64|65)/,
    [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }],
  ), [balance]);

  // Note 13: Charges & produits financiers
  const financier = useMemo(() => buildNote(
    balance, /^(67|77)/,
    [
      { key: 'charges', getter: b => (b.sfd || 0) || (b.md || 0) },
      { key: 'produits', getter: b => (b.sfc || 0) || (b.mc || 0) },
    ],
  ), [balance]);

  // Note 14: Charges & produits HAO
  const hao = useMemo(() => buildNote(
    balance, /^(81|82|83|84|85|86|87|88)/,
    [
      { key: 'charges', getter: b => (b.sfd || 0) || (b.md || 0) },
      { key: 'produits', getter: b => (b.sfc || 0) || (b.mc || 0) },
    ],
  ), [balance]);

  // Note 15: Impôts & taxes
  const impots = useMemo(() => buildNote(
    balance, /^(64|69)/,
    [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }],
  ), [balance]);

  // Note 16: Autres produits
  const autresProduits = useMemo(() => buildNote(
    balance, /^(71|72|73|74|75|78)/,
    [{ key: 'montant', getter: b => (b.sfc || 0) || (b.mc || 0) }],
  ), [balance]);

  const handleExportImmo = () => {
    exportCsv(
      ['Compte', 'Intitulé', 'Brut Début', 'Acquisitions', 'Cessions', 'Brut Fin'],
      immos.map(r => [r.compte, r.intitule, r.brut_debut, r.acquisitions, r.cessions, r.brut_fin]),
      `note_immo_${exercice?.annee}`,
    );
  };

  const tabs = [
    { id: 'immo', label: 'Immobilisations' },
    { id: 'amort', label: 'Amortissements' },
    { id: 'prov', label: 'Provisions' },
    { id: 'capitaux', label: 'Capitaux Propres' },
    { id: 'emprunts', label: 'Emprunts' },
    { id: 'stocks', label: 'Stocks' },
    { id: 'creances', label: 'Créances & Dettes' },
    { id: 'tresorerie', label: 'Trésorerie' },
    { id: 'ca', label: 'Chiffre d\'Affaires' },
    { id: 'achats', label: 'Achats' },
    { id: 'charges', label: 'Autres Charges' },
    { id: 'personnel', label: 'Personnel' },
    { id: 'financier', label: 'Financier' },
    { id: 'hao', label: 'HAO' },
    { id: 'impots', label: 'Impôts' },
    { id: 'produits', label: 'Autres Produits' },
  ];

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">Notes Annexes</div>
          <div className="text-[10px] text-fg3 font-mono">SYSCOHADA Révisé — {entreprise?.nom} — Exercice {exercice?.annee}</div>
        </div>
      </div>

      <div className="p-5">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-bg2 p-1.5 mb-4">
            {tabs.map(t => (
              <TabsTrigger key={t.id} value={t.id} className="text-[10px] px-2 py-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="immo">
            <NoteTable noteNum={1} title="Tableau des Immobilisations" headers={['Compte', 'Intitulé', 'Brut Début', 'Acquisitions', 'Cessions', 'Brut Fin']}
              rows={immos} colKeys={['brut_debut', 'acquisitions', 'cessions', 'brut_fin']}
              colStyles={{ acquisitions: 'text-success', cessions: 'text-destructive' }} onExport={handleExportImmo} />
          </TabsContent>

          <TabsContent value="amort">
            <NoteTable noteNum={2} title="Tableau des Amortissements" headers={['Compte', 'Intitulé', 'Cumul Début', 'Dotation', 'Reprises', 'Cumul Fin']}
              rows={amorts} colKeys={['cumul_debut', 'dotation', 'reprises', 'cumul_fin']}
              colStyles={{ dotation: 'text-destructive', reprises: 'text-success' }} />
          </TabsContent>

          <TabsContent value="prov">
            <NoteTable noteNum={3} title="Tableau des Provisions" headers={['Compte', 'Intitulé', 'Début', 'Dotation', 'Reprises', 'Fin']}
              rows={provisions} colKeys={['debut', 'dotation', 'reprises', 'fin']} />
          </TabsContent>

          <TabsContent value="capitaux">
            <NoteTable noteNum={4} title="Variation des Capitaux Propres" headers={['Compte', 'Intitulé', 'Début', 'Augmentation', 'Diminution', 'Fin']}
              rows={capitaux} colKeys={['debut', 'augmentation', 'diminution', 'fin']}
              colStyles={{ augmentation: 'text-success', diminution: 'text-destructive' }} />
          </TabsContent>

          <TabsContent value="emprunts">
            <NoteTable noteNum={5} title="Emprunts & Dettes Financières" headers={['Compte', 'Intitulé', 'Début', 'Souscription', 'Remboursement', 'Fin']}
              rows={emprunts} colKeys={['debut', 'souscription', 'remboursement', 'fin']}
              colStyles={{ souscription: 'text-destructive', remboursement: 'text-success' }} />
          </TabsContent>

          <TabsContent value="stocks">
            <NoteTable noteNum={6} title="État des Stocks" headers={['Compte', 'Intitulé', 'Début', 'Fin', 'Variation']}
              rows={stocks} colKeys={['debut', 'fin', 'variation']} />
          </TabsContent>

          <TabsContent value="creances">
            <NoteTable noteNum={7} title="Détail des Créances & Dettes (Classe 4)" headers={['Compte', 'Intitulé', 'Solde Débiteur', 'Solde Créditeur']}
              rows={creances} colKeys={['debiteur', 'crediteur']}
              colStyles={{ debiteur: 'text-primary', crediteur: 'text-success' }} />
          </TabsContent>

          <TabsContent value="tresorerie">
            <NoteTable noteNum={8} title="État de la Trésorerie" headers={['Compte', 'Intitulé', 'Débit', 'Crédit', 'Solde']}
              rows={tresorerie} colKeys={['debit', 'credit', 'solde']} />
          </TabsContent>

          <TabsContent value="ca">
            <NoteTable noteNum={9} title="Chiffre d'Affaires Détaillé" headers={['Compte', 'Intitulé', 'Montant']}
              rows={ca} colKeys={['montant']} />
          </TabsContent>

          <TabsContent value="achats">
            <NoteTable noteNum={10} title="Achats & Services Extérieurs" headers={['Compte', 'Intitulé', 'Montant']}
              rows={achats} colKeys={['montant']} />
          </TabsContent>

          <TabsContent value="charges">
            <NoteTable noteNum={11} title="Autres Charges d'Exploitation" headers={['Compte', 'Intitulé', 'Montant']}
              rows={autresCharges} colKeys={['montant']} />
          </TabsContent>

          <TabsContent value="personnel">
            <NoteTable noteNum={12} title="Charges de Personnel" headers={['Compte', 'Intitulé', 'Montant']}
              rows={personnel} colKeys={['montant']} />
          </TabsContent>

          <TabsContent value="financier">
            <NoteTable noteNum={13} title="Charges & Produits Financiers" headers={['Compte', 'Intitulé', 'Charges', 'Produits']}
              rows={financier} colKeys={['charges', 'produits']}
              colStyles={{ charges: 'text-destructive', produits: 'text-success' }} />
          </TabsContent>

          <TabsContent value="hao">
            <NoteTable noteNum={14} title="Charges & Produits HAO" headers={['Compte', 'Intitulé', 'Charges', 'Produits']}
              rows={hao} colKeys={['charges', 'produits']}
              colStyles={{ charges: 'text-destructive', produits: 'text-success' }} />
          </TabsContent>

          <TabsContent value="impots">
            <NoteTable noteNum={15} title="Impôts & Taxes" headers={['Compte', 'Intitulé', 'Montant']}
              rows={impots} colKeys={['montant']} />
          </TabsContent>

          <TabsContent value="produits">
            <NoteTable noteNum={16} title="Autres Produits" headers={['Compte', 'Intitulé', 'Montant']}
              rows={autresProduits} colKeys={['montant']} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
