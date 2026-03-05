import { useApp } from '@/stores/app-store';
import { computeIndicateurs, fmt, fmtSigned } from '@/lib/accounting';

export default function Dashboard() {
  const { entreprise, exercice, balance, balanceN1 } = useApp();
  const I = computeIndicateurs(balance);
  const IN1 = balanceN1.length > 0 ? computeIndicateurs(balanceN1) : null;

  const kpis = [
    { label: "Chiffre d'Affaires (XB)", value: fmt(I.ca), color: 'primary' },
    { label: 'Résultat Net (XI)', value: fmtSigned(I.resultat), color: I.resultat >= 0 ? 'success' : 'destructive' },
    { label: 'EBE (XD)', value: fmtSigned(I.ebe), sub: I.ca ? Math.round(I.ebe / I.ca * 100) + '% du CA' : '—', color: 'accent' },
    { label: 'Trésorerie Nette', value: fmtSigned(I.tresoNette), color: I.tresoNette >= 0 ? 'success' : 'destructive' },
  ];

  const sigs = [
    { ref: 'XB', lib: "Chiffre d'Affaires", n: I.ca, n1: IN1?.ca },
    { ref: 'XA', lib: 'Marge Commerciale', n: I.marge, n1: IN1?.marge },
    { ref: 'XC', lib: 'Valeur Ajoutée', n: I.va, n1: IN1?.va },
    { ref: 'XD', lib: "Excédent Brut d'Expl.", n: I.ebe, n1: IN1?.ebe },
    { ref: 'XE', lib: "Résultat d'Exploitation", n: I.resultat, n1: IN1?.resultat },
    { ref: 'ZH', lib: 'Trésorerie Nette', n: I.tresoNette, n1: IN1?.tresoNette },
  ];

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">Tableau de bord</div>
          <div className="text-[10px] text-fg3 font-mono">{entreprise?.nom} — {entreprise?.ninea} — {exercice?.annee}</div>
        </div>
        <div className="text-[10px] text-fg3 font-mono">
          {exercice?.statut === 'cloture' && <span className="bg-success/10 text-success rounded px-2 py-0.5 font-bold">🟢 Clôturé</span>}
          {exercice?.statut === 'en_cours' && <span className="bg-accent/10 text-accent rounded px-2 py-0.5 font-bold">🟡 En cours</span>}
        </div>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-4 gap-3 mb-4">
          {kpis.map(k => (
            <div key={k.label} className="bg-bg2 border border-border rounded-lg p-3.5 relative overflow-hidden">
              <div className={`absolute top-0 left-0 right-0 h-0.5 bg-${k.color}`} />
              <div className="text-[9px] text-fg3 uppercase tracking-[1px] font-mono">{k.label}</div>
              <div className={`text-lg font-bold font-mono mt-1 text-${k.color}`}>{k.value}</div>
              {k.sub && <div className="text-[10px] text-fg3">{k.sub}</div>}
              <div className="text-[10px] text-fg3">{entreprise?.monnaie || 'FCFA'}</div>
            </div>
          ))}
        </div>

        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border">
            <span className="text-xs font-semibold">Soldes Intermédiaires de Gestion</span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">Réf.</th>
                <th className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">Indicateur</th>
                <th className="bg-bg3 px-3 py-1.5 text-right text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">Exercice N</th>
                <th className="bg-bg3 px-3 py-1.5 text-right text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">N-1</th>
                <th className="bg-bg3 px-3 py-1.5 text-right text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">Variation</th>
              </tr>
            </thead>
            <tbody>
              {sigs.map(r => {
                const variation = r.n1 != null && r.n1 !== 0 ? ((r.n - r.n1) / Math.abs(r.n1)) * 100 : null;
                return (
                  <tr key={r.ref} className="hover:bg-[rgba(56,189,248,.02)]">
                    <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">
                      <span className="bg-bg4 border border-border rounded px-1.5 py-0.5 text-[9px] font-mono text-fg3">{r.ref}</span>
                    </td>
                    <td className="px-3 py-1.5 text-[11px] border-b border-border/50">{r.lib}</td>
                    <td className={`px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50 ${r.n >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(r.n)}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right text-fg3 border-b border-border/50">
                      {r.n1 != null ? fmt(r.n1) : '—'}
                    </td>
                    <td className={`px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50 ${variation != null ? (variation >= 0 ? 'text-success' : 'text-destructive') : 'text-fg3'}`}>
                      {variation != null ? `${variation >= 0 ? '+' : ''}${variation.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
