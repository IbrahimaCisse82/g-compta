import { useApp } from '@/stores/app-store';
import { useState } from 'react';

const CLS_COL: Record<string, string> = { '1': '#a78bfa', '2': '#38bdf8', '3': '#34d399', '4': '#fb923c', '5': '#f59e0b', '6': '#fb7185', '7': '#6ee7b7' };
const CLS_LBL: Record<string, string> = { '1': 'Ressources Stables', '2': 'Actif Immobilisé', '3': 'Stocks', '4': 'Tiers', '5': 'Trésorerie', '6': 'Charges', '7': 'Produits' };

export default function PlanComptablePage() {
  const { plan, toggleCompte, deleteCompte } = useApp();
  const [filter, setFilter] = useState('');
  const [showInactif, setShowInactif] = useState(false);
  let rows = plan.filter(r => !filter || r.numero.includes(filter) || r.intitule.toLowerCase().includes(filter.toLowerCase()));
  if (!showInactif) rows = rows.filter(r => r.actif !== false);

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">Plan Comptable SYSCOHADA</div>
      </div>
      <div className="p-5">
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">{plan.filter(p => p.actif !== false).length} actif(s)</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] text-fg2 cursor-pointer">
                <input type="checkbox" checked={showInactif} onChange={e => setShowInactif(e.target.checked)} /> Afficher inactifs
              </label>
              <input className="bg-bg3 border border-border rounded-md px-2.5 py-1 text-[11px] text-foreground outline-none focus:border-primary w-40" placeholder="Rechercher..." value={filter} onChange={e => setFilter(e.target.value)} />
            </div>
          </div>
          <table className="w-full border-collapse">
            <thead><tr>
              {['N° Compte', 'Intitulé', 'Classe', 'Sens', 'Actions'].map(h => (
                <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={`hover:bg-[rgba(56,189,248,.02)] ${r.actif === false ? 'opacity-40' : ''}`}>
                  <td className="px-3 py-1.5 text-[11px] font-bold font-mono border-b border-border/50" style={{ color: CLS_COL[r.classe] || 'inherit' }}>{r.numero}</td>
                  <td className="px-3 py-1.5 text-[11px] border-b border-border/50">{r.intitule}</td>
                  <td className="px-3 py-1.5 text-[11px] border-b border-border/50">
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-bold font-mono" style={{ background: (CLS_COL[r.classe] || '#888') + '22', color: CLS_COL[r.classe] }}>Cl.{r.classe}</span>
                    <small className="text-fg3 ml-1">{CLS_LBL[r.classe]}</small>
                  </td>
                  <td className="px-3 py-1.5 text-[11px] border-b border-border/50">
                    <span className={`rounded-lg px-1.5 py-0.5 text-[9px] font-bold font-mono ${r.sens === 'D' ? 'bg-[rgba(56,189,248,.12)] text-primary' : 'bg-[rgba(52,211,153,.12)] text-success'}`}>{r.sens}</span>
                  </td>
                  <td className="px-3 py-1.5 border-b border-border/50 whitespace-nowrap">
                    <button onClick={() => toggleCompte(r.id)} className="text-[10px] px-2 py-0.5 rounded border border-border text-fg2 hover:bg-bg3 mr-1">{r.actif ? '⊘' : '✓'}</button>
                    <button onClick={() => deleteCompte(r.id)} className="text-[10px] px-2 py-0.5 rounded bg-[rgba(251,113,133,.12)] text-destructive border border-destructive/25">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
