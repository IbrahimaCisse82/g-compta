import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { useState } from 'react';

export default function BalancePage() {
  const { balance, entreprise, exercice } = useApp();
  const [filter, setFilter] = useState('');
  const rows = balance.filter(r => !filter || r.compte.includes(filter) || r.intitule.toLowerCase().includes(filter.toLowerCase()));
  const T = rows.reduce((t, r) => ({ sd: t.sd + (r.sd || 0), sc: t.sc + (r.sc || 0), md: t.md + (r.md || 0), mc: t.mc + (r.mc || 0), sfd: t.sfd + (r.sfd || 0), sfc: t.sfc + (r.sfc || 0) }), { sd: 0, sc: 0, md: 0, mc: 0, sfd: 0, sfc: 0 });

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div><div className="font-serif text-[17px]">Balance Générale</div><div className="text-[10px] text-fg3 font-mono">{entreprise?.nom} — Exercice {exercice?.annee}</div></div>
      </div>
      <div className="p-5">
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Balance des comptes</span>
            <input className="bg-bg3 border border-border rounded-md px-2.5 py-1 text-[11px] text-foreground outline-none focus:border-primary w-40" placeholder="N° ou libellé..." value={filter} onChange={e => setFilter(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr>
                {['N° Compte', 'Intitulé', 'Sol.Init.D', 'Sol.Init.C', 'Mvt.Débit', 'Mvt.Crédit', 'Sol.Fin D', 'Sol.Fin C'].map(h => (
                  <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.compte} className="hover:bg-[rgba(56,189,248,.02)]">
                    <td className="px-3 py-1.5 text-[11px] text-primary font-bold font-mono border-b border-border/50">{r.compte}</td>
                    <td className="px-3 py-1.5 text-[11px] border-b border-border/50">{r.intitule}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50">{r.sd ? fmt(r.sd) : '—'}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50">{r.sc ? fmt(r.sc) : '—'}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right text-primary border-b border-border/50">{r.md ? fmt(r.md) : '—'}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right text-success border-b border-border/50">{r.mc ? fmt(r.mc) : '—'}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right text-primary border-b border-border/50">{r.sfd ? fmt(r.sfd) : '—'}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right text-success border-b border-border/50">{r.sfc ? fmt(r.sfc) : '—'}</td>
                  </tr>
                ))}
                <tr className="bg-bg3 font-bold">
                  <td colSpan={2} className="px-3 py-1.5 text-[11px] border-t border-border-2">TOTAUX ({rows.length} comptes)</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right border-t border-border-2">{fmt(T.sd)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right border-t border-border-2">{fmt(T.sc)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-primary border-t border-border-2">{fmt(T.md)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-success border-t border-border-2">{fmt(T.mc)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-primary border-t border-border-2">{fmt(T.sfd)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-success border-t border-border-2">{fmt(T.sfc)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
