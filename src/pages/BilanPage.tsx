import { useApp } from '@/stores/app-store';
import { calc, ACTIF, PASSIF, fmt, fmtSigned, fmtPct, type MapLine } from '@/lib/accounting';

function EtatTable({ def, vals, title, acColor }: { def: MapLine[]; vals: Record<string, number>; title: string; acColor: string }) {
  return (
    <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 text-center font-bold text-[11px] tracking-[3px] uppercase" style={{ background: acColor, color: '#fff' }}>{title}</div>
      {def.map((l, i) => {
        if (l.type === 'sect') return (
          <div key={l.id} className="flex items-center gap-2 px-3 py-1 bg-bg3 font-bold text-[9px] text-fg3 uppercase tracking-[1.5px] font-mono border-b border-border/30">
            <span>{l.label}</span><span className="text-[9px] text-fg3 ml-auto">NET N</span>
          </div>
        );
        const v = vals[l.id] ?? 0;
        const isTot = l.type === 'total' || l.type === 'gtotal';
        return (
          <div key={l.id} className={`flex items-center justify-between gap-2 px-3 py-1 border-b border-border/30 text-[11px] ${isTot ? 'bg-[rgba(52,211,153,.06)] font-extrabold border-t-2 border-t-success font-mono' : ''}`}>
            <span>{l.label}</span>
            <span className={`font-mono ${v >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtSigned(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function BilanPage() {
  const { balance, entreprise, exercice } = useApp();
  const vA = calc(balance, ACTIF);
  const vP = calc(balance, PASSIF);
  const tA = vA['T_ACT'] || 0;
  const tP = vP['T_PAS'] || 0;
  const eq = Math.abs(tA - tP) < 1000;

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div><div className="font-serif text-[17px]">Bilan</div><div className="text-[10px] text-fg3 font-mono">{entreprise?.nom} — Au {exercice?.date_fin || exercice?.annee}</div></div>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <EtatTable def={ACTIF} vals={vA} title="ACTIF" acColor="#0B1F3A" />
          <EtatTable def={PASSIF} vals={vP} title="PASSIF" acColor="#163158" />
        </div>
        <div className={`rounded-lg px-4 py-2 text-center font-bold text-sm ${eq ? 'bg-[rgba(52,211,153,.1)] text-success' : 'bg-[rgba(251,113,133,.1)] text-destructive'}`}>
          {eq ? '✓ BILAN ÉQUILIBRÉ' : '⚠ BILAN NON ÉQUILIBRÉ'} — Actif: {fmt(tA)} / Passif: {fmt(tP)}
        </div>
      </div>
    </div>
  );
}
