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
  noteNum: number | string;
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

// ─── Text note component ───────────────────────────────
function NoteText({ noteNum, title, content }: { noteNum: number | string; title: string; content: React.ReactNode }) {
  return (
    <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-border">
        <span className="text-xs font-bold text-primary">📋 Note {noteNum} — {title}</span>
      </div>
      <div className="px-4 py-3 text-[11px] text-fg2 leading-relaxed space-y-2">
        {content}
      </div>
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
  const { balance, journal, entreprise, exercice } = useApp();
  const [tab, setTab] = useState('resume');

  // ─── Computed notes (account-based) ────────────────
  const immos = useMemo(() => buildNote(
    balance.filter(b => !/^(28|29)/.test(b.compte)), /^(20|21|22|23|24|25|26|27)/,
    [
      { key: 'brut_debut', getter: b => b.sd || 0 },
      { key: 'acquisitions', getter: b => b.md || 0 },
      { key: 'cessions', getter: b => b.mc || 0 },
      { key: 'brut_fin', getter: b => b.sfd || 0 },
    ],
    r => r.brut_debut > 0 || r.brut_fin > 0,
  ), [balance]);

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

  const emprunts = useMemo(() => buildNote(
    balance, /^(16|17|18)/,
    [
      { key: 'debut', getter: b => b.sc || 0 },
      { key: 'souscription', getter: b => b.mc || 0 },
      { key: 'remboursement', getter: b => b.md || 0 },
      { key: 'fin', getter: b => b.sfc || 0 },
    ],
    r => r.debut > 0 || r.fin > 0,
  ), [balance]);

  const stocks = useMemo(() => buildNote(
    balance, /^(3[0-8])/,
    [
      { key: 'debut', getter: b => b.sd || 0 },
      { key: 'fin', getter: b => b.sfd || 0 },
      { key: 'variation', getter: b => (b.sfd || 0) - (b.sd || 0) },
    ],
  ), [balance]);

  const creances = useMemo(() => buildNote(
    balance, /^(4[0-9])/,
    [
      { key: 'debiteur', getter: b => b.sfd || 0 },
      { key: 'crediteur', getter: b => b.sfc || 0 },
    ],
    r => r.debiteur > 0 || r.crediteur > 0,
  ), [balance]);

  const tresorerie = useMemo(() => buildNote(
    balance, /^(5[0-9])/,
    [
      { key: 'debit', getter: b => b.sfd || 0 },
      { key: 'credit', getter: b => b.sfc || 0 },
      { key: 'solde', getter: b => (b.sfd || 0) - (b.sfc || 0) },
    ],
  ), [balance]);

  const ca = useMemo(() => buildNote(
    balance, /^(70)/,
    [{ key: 'montant', getter: b => (b.sfc || 0) || (b.mc || 0) }],
  ), [balance]);

  const achats = useMemo(() => buildNote(
    balance, /^(60|61|62)/,
    [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }],
  ), [balance]);

  const autresCharges = useMemo(() => buildNote(
    balance, /^(63|64|65)/,
    [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }],
  ), [balance]);

  const personnel = useMemo(() => buildNote(
    balance, /^(66)/,
    [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }],
  ), [balance]);

  const financierCharges = useMemo(() => buildNote(
    balance, /^(67)/,
    [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }],
  ), [balance]);

  const financierProduits = useMemo(() => buildNote(
    balance, /^(77)/,
    [{ key: 'montant', getter: b => (b.sfc || 0) || (b.mc || 0) }],
  ), [balance]);

  const haoCharges = useMemo(() => buildNote(
    balance, /^(81|83|85)/,
    [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }],
  ), [balance]);

  const haoProduits = useMemo(() => buildNote(
    balance, /^(82|84|86)/,
    [{ key: 'montant', getter: b => (b.sfc || 0) || (b.mc || 0) }],
  ), [balance]);

  const impots = useMemo(() => buildNote(
    balance, /^(64|69)/,
    [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }],
  ), [balance]);

  const autresProduits = useMemo(() => buildNote(
    balance, /^(71|72|73|74|75|78)/,
    [{ key: 'montant', getter: b => (b.sfc || 0) || (b.mc || 0) }],
  ), [balance]);

  const subventions = useMemo(() => buildNote(
    balance, /^(14|71)/,
    [
      { key: 'debut', getter: b => b.sc || 0 },
      { key: 'recu', getter: b => b.mc || 0 },
      { key: 'repris', getter: b => b.md || 0 },
      { key: 'fin', getter: b => b.sfc || 0 },
    ],
    r => r.debut > 0 || r.fin > 0,
  ), [balance]);

  const chargesConstatees = useMemo(() => buildNote(
    balance, /^(476|477|478|48)/,
    [
      { key: 'debit', getter: b => b.sfd || 0 },
      { key: 'credit', getter: b => b.sfc || 0 },
    ],
  ), [balance]);

  const comptesRegul = useMemo(() => buildNote(
    balance, /^(47)/,
    [
      { key: 'debit', getter: b => b.sfd || 0 },
      { key: 'credit', getter: b => b.sfc || 0 },
    ],
  ), [balance]);

  const dotationsAmort = useMemo(() => buildNote(
    balance, /^(681|691)/,
    [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }],
  ), [balance]);

  const dotationsProv = useMemo(() => buildNote(
    balance, /^(689|699|659)/,
    [{ key: 'montant', getter: b => (b.sfd || 0) || (b.md || 0) }],
  ), [balance]);

  const reprisesAll = useMemo(() => buildNote(
    balance, /^(791|797|799|759)/,
    [{ key: 'montant', getter: b => (b.sfc || 0) || (b.mc || 0) }],
  ), [balance]);

  const transfertsCharges = useMemo(() => buildNote(
    balance, /^(78|79)/,
    [{ key: 'montant', getter: b => (b.sfc || 0) || (b.mc || 0) }],
  ), [balance]);

  const participations = useMemo(() => buildNote(
    balance, /^(26|27)/,
    [
      { key: 'debut', getter: b => b.sd || 0 },
      { key: 'fin', getter: b => b.sfd || 0 },
      { key: 'produits', getter: b => b.mc || 0 },
    ],
    r => r.debut > 0 || r.fin > 0,
  ), [balance]);

  // ─── Summary metrics ──────────────────────────────
  const totalActif = balance.filter(b => /^[2-5]/.test(b.compte)).reduce((s, b) => s + (b.sfd || 0), 0);
  const totalPassif = balance.filter(b => /^[1-5]/.test(b.compte)).reduce((s, b) => s + (b.sfc || 0), 0);
  const totalCA = totalOf(ca, 'montant');
  const totalCharges = totalOf(achats, 'montant') + totalOf(autresCharges, 'montant') + totalOf(personnel, 'montant');
  const totalTreso = totalOf(tresorerie, 'solde');
  const nbEcritures = journal.length;

  const handleExportImmo = () => {
    exportCsv(
      ['Compte', 'Intitulé', 'Brut Début', 'Acquisitions', 'Cessions', 'Brut Fin'],
      immos.map(r => [r.compte, r.intitule, r.brut_debut, r.acquisitions, r.cessions, r.brut_fin]),
      `note_immo_${exercice?.annee}`,
    );
  };

  const tabGroups = [
    {
      label: '📊 Synthèse',
      tabs: [{ id: 'resume', label: 'Résumé' }],
    },
    {
      label: '🏢 Bilan',
      tabs: [
        { id: 'immo', label: '1. Immobilisations' },
        { id: 'amort', label: '2. Amortissements' },
        { id: 'prov', label: '3. Provisions' },
        { id: 'capitaux', label: '4. Capitaux Propres' },
        { id: 'emprunts', label: '5. Emprunts' },
        { id: 'stocks', label: '6. Stocks' },
        { id: 'creances', label: '7. Créances & Dettes' },
        { id: 'tresorerie', label: '8. Trésorerie' },
        { id: 'participations', label: '9. Participations' },
        { id: 'subventions', label: '10. Subventions' },
        { id: 'regul', label: '11. Comptes Régul.' },
        { id: 'constatees', label: '12. Charges Constatées' },
      ],
    },
    {
      label: '📈 Résultat',
      tabs: [
        { id: 'ca', label: '13. Chiffre d\'Affaires' },
        { id: 'achats', label: '14. Achats' },
        { id: 'charges', label: '15. Autres Charges' },
        { id: 'personnel', label: '16. Personnel' },
        { id: 'dotamort', label: '17. Dotations Amort.' },
        { id: 'dotprov', label: '18. Dotations Prov.' },
        { id: 'reprises', label: '19. Reprises' },
        { id: 'transferts', label: '20. Transferts Charges' },
        { id: 'produits', label: '21. Autres Produits' },
        { id: 'fincharges', label: '22. Ch. Financières' },
        { id: 'finproduits', label: '23. Pr. Financiers' },
        { id: 'haocharges', label: '24. Charges HAO' },
        { id: 'haoproduits', label: '25. Produits HAO' },
        { id: 'impots', label: '26. Impôts & Taxes' },
      ],
    },
    {
      label: '📝 Informations',
      tabs: [
        { id: 'methodes', label: '27. Méthodes Comptables' },
        { id: 'engagements', label: '28. Engagements HB' },
        { id: 'parties', label: '29. Parties Liées' },
        { id: 'effectifs', label: '30. Effectifs' },
        { id: 'evenements', label: '31. Événements Post.' },
        { id: 'fiscalite', label: '32. Régime Fiscal' },
        { id: 'identification', label: '33. Identification' },
        { id: 'approbation', label: '34. Approbation' },
      ],
    },
  ];

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">Notes Annexes</div>
          <div className="text-[10px] text-fg3 font-mono">SYSCOHADA Révisé — {entreprise?.nom} — Exercice {exercice?.annee} — 34 notes</div>
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
                    <TabsTrigger key={t.id} value={t.id} className="text-[9px] px-1.5 py-0.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      {t.label}
                    </TabsTrigger>
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
                        <button key={t.id} onClick={() => setTab(t.id)} className="block text-[10px] text-fg3 hover:text-primary py-0.5 pl-2">
                          {t.label}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Bilan notes */}
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
          <TabsContent value="participations">
            <NoteTable noteNum={9} title="Participations & Titres" headers={['Compte', 'Intitulé', 'Début', 'Fin', 'Produits']}
              rows={participations} colKeys={['debut', 'fin', 'produits']} />
          </TabsContent>
          <TabsContent value="subventions">
            <NoteTable noteNum={10} title="Subventions" headers={['Compte', 'Intitulé', 'Début', 'Reçu', 'Repris', 'Fin']}
              rows={subventions} colKeys={['debut', 'recu', 'repris', 'fin']}
              colStyles={{ recu: 'text-success' }} />
          </TabsContent>
          <TabsContent value="regul">
            <NoteTable noteNum={11} title="Comptes de Régularisation" headers={['Compte', 'Intitulé', 'Débit', 'Crédit']}
              rows={comptesRegul} colKeys={['debit', 'credit']} />
          </TabsContent>
          <TabsContent value="constatees">
            <NoteTable noteNum={12} title="Charges & Produits Constatés d'Avance" headers={['Compte', 'Intitulé', 'Débit', 'Crédit']}
              rows={chargesConstatees} colKeys={['debit', 'credit']} />
          </TabsContent>

          {/* Résultat notes */}
          <TabsContent value="ca">
            <NoteTable noteNum={13} title="Chiffre d'Affaires Détaillé" headers={['Compte', 'Intitulé', 'Montant']}
              rows={ca} colKeys={['montant']} />
          </TabsContent>
          <TabsContent value="achats">
            <NoteTable noteNum={14} title="Achats & Services Extérieurs" headers={['Compte', 'Intitulé', 'Montant']}
              rows={achats} colKeys={['montant']} />
          </TabsContent>
          <TabsContent value="charges">
            <NoteTable noteNum={15} title="Autres Charges d'Exploitation" headers={['Compte', 'Intitulé', 'Montant']}
              rows={autresCharges} colKeys={['montant']} />
          </TabsContent>
          <TabsContent value="personnel">
            <NoteTable noteNum={16} title="Charges de Personnel" headers={['Compte', 'Intitulé', 'Montant']}
              rows={personnel} colKeys={['montant']} />
          </TabsContent>
          <TabsContent value="dotamort">
            <NoteTable noteNum={17} title="Dotations aux Amortissements" headers={['Compte', 'Intitulé', 'Montant']}
              rows={dotationsAmort} colKeys={['montant']} />
          </TabsContent>
          <TabsContent value="dotprov">
            <NoteTable noteNum={18} title="Dotations aux Provisions" headers={['Compte', 'Intitulé', 'Montant']}
              rows={dotationsProv} colKeys={['montant']} />
          </TabsContent>
          <TabsContent value="reprises">
            <NoteTable noteNum={19} title="Reprises de Provisions & Amortissements" headers={['Compte', 'Intitulé', 'Montant']}
              rows={reprisesAll} colKeys={['montant']} colStyles={{ montant: 'text-success' }} />
          </TabsContent>
          <TabsContent value="transferts">
            <NoteTable noteNum={20} title="Transferts de Charges" headers={['Compte', 'Intitulé', 'Montant']}
              rows={transfertsCharges} colKeys={['montant']} />
          </TabsContent>
          <TabsContent value="produits">
            <NoteTable noteNum={21} title="Autres Produits" headers={['Compte', 'Intitulé', 'Montant']}
              rows={autresProduits} colKeys={['montant']} />
          </TabsContent>
          <TabsContent value="fincharges">
            <NoteTable noteNum={22} title="Charges Financières" headers={['Compte', 'Intitulé', 'Montant']}
              rows={financierCharges} colKeys={['montant']} colStyles={{ montant: 'text-destructive' }} />
          </TabsContent>
          <TabsContent value="finproduits">
            <NoteTable noteNum={23} title="Produits Financiers" headers={['Compte', 'Intitulé', 'Montant']}
              rows={financierProduits} colKeys={['montant']} colStyles={{ montant: 'text-success' }} />
          </TabsContent>
          <TabsContent value="haocharges">
            <NoteTable noteNum={24} title="Charges HAO" headers={['Compte', 'Intitulé', 'Montant']}
              rows={haoCharges} colKeys={['montant']} colStyles={{ montant: 'text-destructive' }} />
          </TabsContent>
          <TabsContent value="haoproduits">
            <NoteTable noteNum={25} title="Produits HAO" headers={['Compte', 'Intitulé', 'Montant']}
              rows={haoProduits} colKeys={['montant']} colStyles={{ montant: 'text-success' }} />
          </TabsContent>
          <TabsContent value="impots">
            <NoteTable noteNum={26} title="Impôts & Taxes" headers={['Compte', 'Intitulé', 'Montant']}
              rows={impots} colKeys={['montant']} />
          </TabsContent>

          {/* Informational notes */}
          <TabsContent value="methodes">
            <NoteText noteNum={27} title="Méthodes Comptables" content={
              <div className="space-y-3">
                <p><strong>Référentiel :</strong> Les états financiers sont établis conformément au Système Comptable OHADA révisé (Acte Uniforme du 15 février 2017).</p>
                <p><strong>Convention de base :</strong> Continuité de l'exploitation, coût historique, prudence, permanence des méthodes, indépendance des exercices.</p>
                <p><strong>Immobilisations corporelles :</strong> Comptabilisées au coût d'acquisition ou de production, amorties selon le mode linéaire sur leur durée d'utilité estimée.</p>
                <p><strong>Immobilisations incorporelles :</strong> Frais de développement activés lorsque les conditions de l'Acte Uniforme sont remplies.</p>
                <p><strong>Stocks :</strong> Évalués au coût moyen pondéré (CUMP) ou au premier entré, premier sorti (PEPS/FIFO).</p>
                <p><strong>Créances :</strong> Comptabilisées à leur valeur nominale. Les créances douteuses font l'objet de provisions pour dépréciation.</p>
                <p><strong>Provisions :</strong> Constituées dès qu'il existe une obligation présente résultant d'un fait générateur passé dont le montant peut être estimé de façon fiable.</p>
                <p><strong>Opérations en devises :</strong> Converties au cours de change en vigueur à la date de la transaction. Les écarts de conversion sont constatés en résultat.</p>
                <p><strong>Monnaie de présentation :</strong> {entreprise?.monnaie || 'FCFA'}</p>
              </div>
            } />
          </TabsContent>

          <TabsContent value="engagements">
            <NoteText noteNum={28} title="Engagements Hors Bilan" content={
              <div className="space-y-3">
                <p className="font-bold text-fg2">Engagements donnés :</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Cautions et garanties données : <span className="font-mono text-fg3">À renseigner</span></li>
                  <li>Effets escomptés non échus : <span className="font-mono text-fg3">À renseigner</span></li>
                  <li>Engagements de crédit-bail : <span className="font-mono text-fg3">À renseigner</span></li>
                  <li>Hypothèques et nantissements : <span className="font-mono text-fg3">À renseigner</span></li>
                </ul>
                <p className="font-bold text-fg2 mt-3">Engagements reçus :</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Cautions et garanties reçues : <span className="font-mono text-fg3">À renseigner</span></li>
                  <li>Lignes de crédit confirmées non utilisées : <span className="font-mono text-fg3">À renseigner</span></li>
                  <li>Avals et cautionnements : <span className="font-mono text-fg3">À renseigner</span></li>
                </ul>
                <p className="text-fg3 italic mt-2">Note : Les engagements hors bilan doivent être complétés manuellement par le responsable comptable.</p>
              </div>
            } />
          </TabsContent>

          <TabsContent value="parties">
            <NoteText noteNum={29} title="Transactions avec les Parties Liées" content={
              <div className="space-y-3">
                <p>Conformément à l'Acte Uniforme OHADA, les transactions significatives avec les parties liées doivent être mentionnées :</p>
                <div className="bg-bg3 rounded p-3 space-y-2">
                  <p><strong>Dirigeants :</strong></p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Rémunérations des dirigeants : <span className="font-mono text-fg3">À renseigner</span></li>
                    <li>Avances et prêts aux dirigeants : <span className="font-mono text-fg3">À renseigner</span></li>
                  </ul>
                  <p className="mt-2"><strong>Sociétés apparentées :</strong></p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Ventes et achats intragroupe : <span className="font-mono text-fg3">À renseigner</span></li>
                    <li>Comptes courants associés : <span className="font-mono text-fg3">À renseigner</span></li>
                  </ul>
                </div>
                <p className="text-fg3 italic">Note : Ces informations doivent être renseignées par la direction.</p>
              </div>
            } />
          </TabsContent>

          <TabsContent value="effectifs">
            <NoteText noteNum={30} title="Effectifs Moyens" content={
              <div className="space-y-3">
                <p>Effectif moyen de l'exercice {exercice?.annee} par catégorie :</p>
                <div className="bg-bg3 rounded overflow-hidden">
                  <table className="w-full">
                    <thead><tr>
                      <th className="px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">Catégorie</th>
                      <th className="px-3 py-1.5 text-right text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">Exercice N</th>
                      <th className="px-3 py-1.5 text-right text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">Exercice N-1</th>
                    </tr></thead>
                    <tbody>
                      {['Cadres supérieurs', 'Cadres', 'Agents de maîtrise', 'Employés', 'Ouvriers', 'Apprentis / Stagiaires'].map(c => (
                        <tr key={c}><td className="px-3 py-1 text-[10px] border-b border-border/30">{c}</td>
                          <td className="px-3 py-1 text-[10px] font-mono text-right border-b border-border/30 text-fg3">—</td>
                          <td className="px-3 py-1 text-[10px] font-mono text-right border-b border-border/30 text-fg3">—</td>
                        </tr>
                      ))}
                      <tr className="font-bold"><td className="px-3 py-1.5 text-[10px] border-t border-border">TOTAL</td>
                        <td className="px-3 py-1.5 text-[10px] font-mono text-right border-t border-border text-fg3">—</td>
                        <td className="px-3 py-1.5 text-[10px] font-mono text-right border-t border-border text-fg3">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-fg3 italic">Masse salariale totale : {fmt(totalOf(personnel, 'montant'))} {entreprise?.monnaie || 'FCFA'}</p>
              </div>
            } />
          </TabsContent>

          <TabsContent value="evenements">
            <NoteText noteNum={31} title="Événements Postérieurs à la Clôture" content={
              <div className="space-y-3">
                <p>Événements significatifs survenus entre la date de clôture ({exercice?.annee ? `31/12/${exercice.annee}` : '—'}) et la date d'arrêté des comptes :</p>
                <div className="bg-bg3 rounded p-3">
                  <ul className="list-disc pl-5 space-y-1 text-fg3">
                    <li>Aucun événement significatif postérieur à la clôture n'est à signaler.</li>
                  </ul>
                </div>
                <p className="text-fg3 italic">Note : Mentionner tout événement ayant une incidence significative sur les états financiers (sinistres, litiges, restructurations, etc.).</p>
              </div>
            } />
          </TabsContent>

          <TabsContent value="fiscalite">
            <NoteText noteNum={32} title="Régime Fiscal" content={
              <div className="space-y-3">
                <p><strong>Régime d'imposition :</strong> <span className="text-fg3">À renseigner (réel normal / réel simplifié / forfait)</span></p>
                <p><strong>Impôt sur les sociétés (IS) :</strong> <span className="text-fg3">Taux applicable à renseigner</span></p>
                <p><strong>TVA :</strong> <span className="text-fg3">Régime et taux applicables à renseigner</span></p>
                <p><strong>Patente :</strong> <span className="text-fg3">Montant à renseigner</span></p>
                <p><strong>Déficits reportables :</strong> <span className="text-fg3">À renseigner (montant et échéances)</span></p>
                <p><strong>Avantages fiscaux :</strong> <span className="text-fg3">À renseigner (Code des Investissements, Zone Franche, etc.)</span></p>
                <div className="bg-bg3 rounded p-3 mt-2">
                  <p className="text-[10px] font-bold mb-1">Charge d'impôt de l'exercice :</p>
                  <p className="font-mono text-sm">{fmt(totalOf(impots, 'montant'))} {entreprise?.monnaie || 'FCFA'}</p>
                </div>
              </div>
            } />
          </TabsContent>

          <TabsContent value="identification">
            <NoteText noteNum={33} title="Identification de l'Entreprise" content={
              <div className="space-y-2">
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
            } />
          </TabsContent>

          <TabsContent value="approbation">
            <NoteText noteNum={34} title="Approbation des États Financiers" content={
              <div className="space-y-3">
                <p>Les états financiers de l'exercice clos le {exercice?.annee ? `31/12/${exercice.annee}` : '—'} ont été arrêtés par :</p>
                <div className="bg-bg3 rounded p-4 space-y-3">
                  <div>
                    <p className="text-[10px] text-fg3 uppercase tracking-wider font-mono mb-1">Le Directeur Général / Gérant</p>
                    <div className="border-b border-border/50 w-64 h-8" />
                    <p className="text-[9px] text-fg3 mt-1">Nom, prénom et signature</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-fg3 uppercase tracking-wider font-mono mb-1">Le Commissaire aux Comptes</p>
                    <div className="border-b border-border/50 w-64 h-8" />
                    <p className="text-[9px] text-fg3 mt-1">Nom, prénom et signature</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-fg3 uppercase tracking-wider font-mono mb-1">L'Expert-Comptable</p>
                    <div className="border-b border-border/50 w-64 h-8" />
                    <p className="text-[9px] text-fg3 mt-1">Nom, prénom et signature</p>
                  </div>
                  <div className="mt-4 flex gap-8">
                    <div>
                      <p className="text-[10px] text-fg3 font-mono">Fait à :</p>
                      <div className="border-b border-border/50 w-40 h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] text-fg3 font-mono">Le :</p>
                      <div className="border-b border-border/50 w-40 h-6" />
                    </div>
                  </div>
                </div>
              </div>
            } />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
