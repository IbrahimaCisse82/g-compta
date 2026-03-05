import { useApp } from '@/stores/app-store';
import { calc, TFT, CR, fmt, type MapLine } from '@/lib/accounting';

export default function TFTPage() {
  const { balance, entreprise, exercice } = useApp();
  const vCR = calc(balance, CR);
  const vT = calc(balance, TFT, { RN_: vCR['RN_'] || 0 });

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div><div className="font-serif text-[17px]">Tableau des Flux de Trésorerie</div><div className="text-[10px] text-fg3 font-mono">Méthode indirecte — SYSCOHADA</div></div>
      </div>
      <div className="p-5">
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-[10px] font-bold text-purple uppercase tracking-[2px] font-mono">TABLEAU DES FLUX DE TRÉSORERIE — {exercice?.annee}</span>
          </div>
          {TFT.map((l, i) => {
            if (l.type === 'sect') return (
              <div key={l.id} className="px-3 py-1.5 bg-bg3/50 font-bold text-[9px] text-fg3 uppercase tracking-[0.5px] font-mono border-b border-border/30">{l.label}</div>
            );
            const v = vT[l.id] ?? 0;
            const isGtotal = l.type === 'gtotal';
            return (
              <div key={l.id} className={`grid grid-cols-[70px_1fr_140px] items-center px-3 py-1.5 border-b border-border/30 text-[11px] ${isGtotal ? 'font-bold bg-[rgba(167,139,250,.05)] border-t-2 border-t-purple' : ''}`}>
                <span className="text-[10px] text-fg3 font-mono">{l.id}</span>
                <span>{l.label}</span>
                <span className={`text-right font-mono ${v >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(v)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
