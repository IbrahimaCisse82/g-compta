import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { useState } from 'react';

export default function SaisiePage() {
  const { journal, deleteJournalEntry } = useApp();
  const [filter, setFilter] = useState('');
  const rows = journal.filter(r => !filter || r.libelle?.toLowerCase().includes(filter.toLowerCase()) || r.compte?.includes(filter));

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div><div className="font-serif text-[17px]">Saisie d'Écritures</div><div className="text-[10px] text-fg3 font-mono">Toutes les écritures de l'exercice courant</div></div>
      </div>
      <div className="p-5">
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">{rows.length} écriture(s)</span>
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
                  <td className="px-3 py-1.5 text-[11px] border-b border-border/50"><span className="bg-[rgba(56,189,248,.12)] text-primary rounded-lg px-1.5 py-0.5 text-[9px] font-bold font-mono">{r.piece}</span></td>
                  <td className="px-3 py-1.5 text-[9px] text-fg3 border-b border-border/50">{r.journal_code}</td>
                  <td className="px-3 py-1.5 text-[11px] text-primary font-mono border-b border-border/50">{r.compte}</td>
                  <td className="px-3 py-1.5 text-[11px] border-b border-border/50">{r.libelle}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-primary border-b border-border/50">{r.debit ? fmt(r.debit) : ''}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-success border-b border-border/50">{r.credit ? fmt(r.credit) : ''}</td>
                  <td className="px-3 py-1.5 border-b border-border/50"><button onClick={() => deleteJournalEntry(r.id)} className="text-destructive text-xs">🗑</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
