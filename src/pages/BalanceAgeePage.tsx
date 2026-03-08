import { useState, useMemo } from 'react';
import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { exportCsv } from '@/lib/csv-export';

type AgeBucket = '0_30' | '30_60' | '60_90' | '90_plus';
const BUCKET_LABELS: Record<AgeBucket, string> = { '0_30': '0-30 j', '30_60': '30-60 j', '60_90': '60-90 j', '90_plus': '+90 j' };

interface AgedLine {
  compte: string;
  intitule: string;
  total: number;
  buckets: Record<AgeBucket, number>;
}

function daysBetween(d1: string, d2: string): number {
  return Math.floor((new Date(d2).getTime() - new Date(d1).getTime()) / 86400000);
}

export default function BalanceAgeePage() {
  const { journal, balance, exercice, entreprise } = useApp();
  const [mode, setMode] = useState<'clients' | 'fournisseurs'>('clients');
  const [refDate, setRefDate] = useState(exercice?.date_fin || new Date().toISOString().slice(0, 10));

  const prefix = mode === 'clients' ? '411' : '401';
  const sens = mode === 'clients' ? 1 : -1; // clients = débit net, fournisseurs = crédit net

  const agedData = useMemo(() => {
    // Get accounts matching prefix
    const accountNums = new Set<string>();
    for (const j of journal) { if (j.compte.startsWith(prefix)) accountNums.add(j.compte); }
    for (const b of balance) { if (b.compte.startsWith(prefix)) accountNums.add(b.compte); }

    const result: AgedLine[] = [];

    for (const compte of Array.from(accountNums).sort()) {
      const balLine = balance.find(b => b.compte === compte);
      const entries = journal.filter(j => j.compte === compte).sort((a, b) => a.date_ecriture.localeCompare(b.date_ecriture));

      // Group entries by piece to track individual transactions
      const pieceMap = new Map<string, { date: string; net: number; intitule: string }>();
      for (const e of entries) {
        const key = e.piece;
        if (!pieceMap.has(key)) pieceMap.set(key, { date: e.date_ecriture, net: 0, intitule: e.intitule });
        const p = pieceMap.get(key)!;
        p.net += (e.debit || 0) - (e.credit || 0);
      }

      // Filter pieces with outstanding balance
      const buckets: Record<AgeBucket, number> = { '0_30': 0, '30_60': 0, '60_90': 0, '90_plus': 0 };
      let total = 0;

      for (const [, piece] of pieceMap) {
        const outstanding = piece.net * sens;
        if (outstanding <= 0) continue; // Already settled

        const days = daysBetween(piece.date, refDate);
        const bucket: AgeBucket = days <= 30 ? '0_30' : days <= 60 ? '30_60' : days <= 90 ? '60_90' : '90_plus';
        buckets[bucket] += outstanding;
        total += outstanding;
      }

      // If balance line exists but no journal detail, use balance total
      if (total === 0 && balLine) {
        const solde = mode === 'clients' ? (balLine.sfd || 0) : (balLine.sfc || 0);
        if (solde > 0) {
          buckets['90_plus'] = solde;
          total = solde;
        }
      }

      if (total > 0) {
        const intitule = balLine?.intitule || entries[0]?.intitule || compte;
        result.push({ compte, intitule, total, buckets });
      }
    }

    return result;
  }, [journal, balance, prefix, sens, refDate, mode]);

  const totals = useMemo(() => {
    const t: Record<AgeBucket, number> = { '0_30': 0, '30_60': 0, '60_90': 0, '90_plus': 0 };
    let total = 0;
    for (const line of agedData) {
      total += line.total;
      for (const b of Object.keys(t) as AgeBucket[]) t[b] += line.buckets[b];
    }
    return { ...t, total };
  }, [agedData]);

  const handleExport = () => {
    exportCsv(
      ['Compte', 'Intitulé', 'Total', '0-30 j', '30-60 j', '60-90 j', '+90 j'],
      [
        ...agedData.map(r => [r.compte, r.intitule, r.total, r.buckets['0_30'], r.buckets['30_60'], r.buckets['60_90'], r.buckets['90_plus']]),
        ['TOTAL', '', totals.total, totals['0_30'], totals['30_60'], totals['60_90'], totals['90_plus']],
      ],
      `balance_agee_${mode}_${exercice?.annee}`,
    );
  };

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">Balance Âgée</div>
          <div className="text-[10px] text-fg3 font-mono">{entreprise?.nom} — Exercice {exercice?.annee}</div>
        </div>
        <button onClick={handleExport} className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-border text-fg2 hover:bg-bg3">📥 Export CSV</button>
      </div>
      <div className="p-5">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex bg-bg3 rounded-lg p-0.5">
            <button onClick={() => setMode('clients')} className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${mode === 'clients' ? 'bg-primary text-primary-foreground' : 'text-fg2'}`}>
              👤 Clients (411)
            </button>
            <button onClick={() => setMode('fournisseurs')} className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${mode === 'fournisseurs' ? 'bg-primary text-primary-foreground' : 'text-fg2'}`}>
              🏭 Fournisseurs (401)
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[9px] text-fg3 uppercase tracking-wider font-mono">Date de référence</label>
            <input type="date" value={refDate} onChange={e => setRefDate(e.target.value)}
              className="bg-bg3 border border-border rounded px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary font-mono" />
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[9px] text-fg3 uppercase tracking-[1px] font-mono">Total</div>
            <div className="text-lg font-bold font-mono text-primary">{fmt(totals.total)}</div>
          </div>
          {(Object.keys(BUCKET_LABELS) as AgeBucket[]).map(b => (
            <div key={b} className={`bg-bg2 border rounded-lg p-3 ${b === '90_plus' ? 'border-destructive/30' : 'border-border'}`}>
              <div className="text-[9px] text-fg3 uppercase tracking-[1px] font-mono">{BUCKET_LABELS[b]}</div>
              <div className={`text-sm font-bold font-mono ${b === '90_plus' && totals[b] > 0 ? 'text-destructive' : 'text-foreground'}`}>{fmt(totals[b])}</div>
              {totals.total > 0 && <div className="text-[9px] text-fg3">{Math.round(totals[b] / totals.total * 100)}%</div>}
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border">
            <span className="text-xs font-semibold">{agedData.length} compte(s) avec solde ouvert</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr>
                {['Compte', 'Intitulé', 'Total', '0-30 j', '30-60 j', '60-90 j', '+90 j'].map(h => (
                  <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {agedData.map(r => (
                  <tr key={r.compte} className="hover:bg-[rgba(56,189,248,.02)]">
                    <td className="px-3 py-1.5 text-[11px] text-primary font-bold font-mono border-b border-border/50">{r.compte}</td>
                    <td className="px-3 py-1.5 text-[11px] border-b border-border/50">{r.intitule}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right font-bold border-b border-border/50">{fmt(r.total)}</td>
                    {(Object.keys(BUCKET_LABELS) as AgeBucket[]).map(b => (
                      <td key={b} className={`px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50 ${b === '90_plus' && r.buckets[b] > 0 ? 'text-destructive font-bold' : ''}`}>
                        {r.buckets[b] ? fmt(r.buckets[b]) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                {agedData.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-fg3 text-xs">Aucun solde ouvert pour les comptes {mode}</td></tr>
                )}
                {agedData.length > 0 && (
                  <tr className="bg-bg3 font-bold">
                    <td colSpan={2} className="px-3 py-1.5 text-[11px] border-t border-border">TOTAUX</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right border-t border-border">{fmt(totals.total)}</td>
                    {(Object.keys(BUCKET_LABELS) as AgeBucket[]).map(b => (
                      <td key={b} className={`px-3 py-1.5 text-[11px] font-mono text-right border-t border-border ${b === '90_plus' && totals[b] > 0 ? 'text-destructive' : ''}`}>
                        {fmt(totals[b])}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
