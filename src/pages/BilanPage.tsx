import { useApp } from '@/stores/app-store';
import { calc, ACTIF, PASSIF, fmt, fmtSigned, type MapLine, type BalanceLine } from '@/lib/accounting';

function EtatTable({ def, vals, valsN1, title, acColor }: { def: MapLine[]; vals: Record<string, number>; valsN1: Record<string, number>; title: string; acColor: string }) {
  const hasN1 = Object.values(valsN1).some(v => v !== 0);
  return (
    <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 text-center font-bold text-[11px] tracking-[3px] uppercase" style={{ background: acColor, color: '#fff' }}>{title}</div>
      <div className={`grid ${hasN1 ? 'grid-cols-[1fr_100px_100px]' : 'grid-cols-[1fr_100px]'} text-[9px] font-bold text-fg3 uppercase tracking-[0.5px] font-mono bg-bg3 px-3 py-1 border-b border-border`}>
        <span>Libellé</span><span className="text-right">Net N</span>
        {hasN1 && <span className="text-right">Net N-1</span>}
      </div>
      {def.map((l) => {
        if (l.type === 'sect') return (
          <div key={l.id} className="px-3 py-1 bg-bg3 font-bold text-[9px] text-fg3 uppercase tracking-[1.5px] font-mono border-b border-border/30">
            {l.label}
          </div>
        );
        const v = vals[l.id] ?? 0;
        const vn1 = valsN1[l.id] ?? 0;
        const isTot = l.type === 'total' || l.type === 'gtotal';
        return (
          <div key={l.id} className={`grid ${hasN1 ? 'grid-cols-[1fr_100px_100px]' : 'grid-cols-[1fr_100px]'} items-center px-3 py-1 border-b border-border/30 text-[11px] ${isTot ? 'bg-success/5 font-extrabold border-t-2 border-t-success font-mono' : ''}`}>
            <span>{l.label}</span>
            <span className={`font-mono text-right ${v >= 0 ? 'text-success' : 'text-destructive'}`}>{fmtSigned(v)}</span>
            {hasN1 && <span className={`font-mono text-right text-fg3 text-[10px]`}>{vn1 ? fmtSigned(vn1) : '—'}</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function BilanPage() {
  const { balance, balanceN1, entreprise, exercice } = useApp();
  const vA = calc(balance, ACTIF);
  const vP = calc(balance, PASSIF);
  const vAN1 = calc(balanceN1, ACTIF);
  const vPN1 = calc(balanceN1, PASSIF);
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
          <EtatTable def={ACTIF} vals={vA} valsN1={vAN1} title="ACTIF" acColor="#0B1F3A" />
          <EtatTable def={PASSIF} vals={vP} valsN1={vPN1} title="PASSIF" acColor="#163158" />
        </div>
        <div className={`rounded-lg px-4 py-2 text-center font-bold text-sm ${eq ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
          {eq ? '✓ BILAN ÉQUILIBRÉ' : '⚠ BILAN NON ÉQUILIBRÉ'} — Actif: {fmt(tA)} / Passif: {fmt(tP)}
        </div>
      </div>
    </div>
  );
}
