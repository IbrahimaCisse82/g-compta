import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { useState } from 'react';

export default function JournalPage() {
  const { journal, deleteJournalEntry } = useApp();
  const [filter, setFilter] = useState('');
  const rows = journal.filter(r => !filter || r.libelle?.toLowerCase().includes(filter.toLowerCase()) || r.compte?.includes(filter));
  const td = rows.reduce((s, r) => s + (r.debit || 0), 0);
  const tc = rows.reduce((s, r) => s + (r.credit || 0), 0);

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div><div className="font-serif text-[17px]">Journal des Opérations</div><div className="text-[10px] text-fg3 font-mono">Partie double — Débit = Crédit</div></div>
      </div>
      <div className="p-5">
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Journal — {rows.length} ligne(s)</span>
            <input className="bg-bg3 border border-border rounded-md px-2.5 py-1 text-[11px] text-foreground outline-none focus:border-primary w-40" placeholder="Rechercher..." value={filter} onChange={e => setFilter(e.target.value)} />
          </div>
          <table className="w-full border-collapse">
            <thead><tr>
              {['Date', 'Pièce', 'Journal', 'Compte', 'Libellé', 'Débit', 'Crédit', ''].map(h => (
                <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-[rgba(56,189,248,.02)]">
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{r.date_ecriture}</td>
                  <td className="px-3 py-1.5 text-[11px] border-b border-border/50"><span className="bg-[rgba(56,189,248,.12)] text-primary rounded-lg px-1.5 py-0.5 text-[9px] font-bold font-mono">{r.piece || '—'}</span></td>
                  <td className="px-3 py-1.5 text-[9px] text-fg3 border-b border-border/50">{r.journal_code}</td>
                  <td className="px-3 py-1.5 text-[11px] text-primary font-mono border-b border-border/50">{r.compte}</td>
                  <td className="px-3 py-1.5 text-[11px] border-b border-border/50">{r.libelle}<br /><small className="text-fg3">{r.intitule}</small></td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-primary border-b border-border/50">{r.debit ? fmt(r.debit) : ''}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-success border-b border-border/50">{r.credit ? fmt(r.credit) : ''}</td>
                  <td className="px-3 py-1.5 border-b border-border/50"><button onClick={() => deleteJournalEntry(r.id)} className="text-destructive text-xs hover:underline">🗑</button></td>
                </tr>
              ))}
              <tr className="bg-bg3 font-bold">
                <td colSpan={5} className="px-3 py-1.5 text-[11px] border-t border-border-2">TOTAUX</td>
                <td className="px-3 py-1.5 text-[11px] font-mono text-right text-primary border-t border-border-2">{fmt(td)}</td>
                <td className="px-3 py-1.5 text-[11px] font-mono text-right text-success border-t border-border-2">{fmt(tc)}</td>
                <td className="border-t border-border-2"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
