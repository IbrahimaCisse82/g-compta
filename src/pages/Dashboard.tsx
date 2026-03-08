import { useApp } from '@/stores/app-store';
import { calc, CR, ACTIF, PASSIF, fmt, fmtSigned } from '@/lib/accounting';

const colorMap: Record<string, string> = {
  primary: 'text-primary',
  success: 'text-success',
  destructive: 'text-destructive',
  accent: 'text-accent',
};

const bgColorMap: Record<string, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  destructive: 'bg-destructive',
  accent: 'bg-accent',
};

export default function Dashboard() {
  const { entreprise, exercice, balance, balanceN1 } = useApp();
  
  const vCR = calc(balance, CR);
  const vCRN1 = balanceN1.length > 0 ? calc(balanceN1, CR) : null;
  const vA = calc(balance, ACTIF);
  const vP = calc(balance, PASSIF);

  const tresoActif = vA['T_TA'] || 0;
  const tresoPassif = vP['T_TP'] || 0;
  const tresoNette = tresoActif - tresoPassif;
  const tresoNetteN1 = balanceN1.length > 0 ? ((calc(balanceN1, ACTIF)['T_TA'] || 0) - (calc(balanceN1, PASSIF)['T_TP'] || 0)) : null;

  const ca = vCR['XB'] || 0;
  const rn = vCR['RN_'] || 0;
  const ebe = vCR['EBE'] || 0;

  const kpis = [
    { label: "Chiffre d'Affaires (XB)", value: fmt(ca), color: 'primary' },
    { label: 'Résultat Net (XI)', value: fmtSigned(rn), color: rn >= 0 ? 'success' : 'destructive' },
    { label: "EBE (XD)", value: fmtSigned(ebe), sub: ca ? Math.round(ebe / ca * 100) + '% du CA' : '—', color: 'accent' },
    { label: 'Trésorerie Nette', value: fmtSigned(tresoNette), color: tresoNette >= 0 ? 'success' : 'destructive' },
  ];

  const sigs = [
    { ref: 'XB', lib: "Chiffre d'Affaires", n: ca, n1: vCRN1?.['XB'] },
    { ref: 'XA', lib: 'Marge Commerciale', n: vCR['MARGE'] || 0, n1: vCRN1?.['MARGE'] },
    { ref: 'XC', lib: 'Valeur Ajoutée', n: vCR['VA'] || 0, n1: vCRN1?.['VA'] },
    { ref: 'XD', lib: "Excédent Brut d'Expl.", n: ebe, n1: vCRN1?.['EBE'] },
    { ref: 'XE', lib: "Résultat d'Exploitation", n: vCR['RE_E'] || 0, n1: vCRN1?.['RE_E'] },
    { ref: 'XF', lib: 'Résultat Financier', n: vCR['RE_F'] || 0, n1: vCRN1?.['RE_F'] },
    { ref: 'XG', lib: 'Résultat Activités Ord.', n: vCR['RAO'] || 0, n1: vCRN1?.['RAO'] },
    { ref: 'XH', lib: 'Résultat HAO', n: vCR['RE_H'] || 0, n1: vCRN1?.['RE_H'] },
    { ref: 'XI', lib: 'Résultat Net', n: rn, n1: vCRN1?.['RN_'] },
    { ref: 'ZH', lib: 'Trésorerie Nette', n: tresoNette, n1: tresoNetteN1 },
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {kpis.map(k => (
            <div key={k.label} className="bg-bg2 border border-border rounded-lg p-3.5 relative overflow-hidden">
              <div className={`absolute top-0 left-0 right-0 h-0.5 ${bgColorMap[k.color] || 'bg-primary'}`} />
              <div className="text-[9px] text-fg3 uppercase tracking-[1px] font-mono">{k.label}</div>
              <div className={`text-lg font-bold font-mono mt-1 ${colorMap[k.color] || 'text-primary'}`}>{k.value}</div>
              {k.sub && <div className="text-[10px] text-fg3">{k.sub}</div>}
              <div className="text-[10px] text-fg3">{entreprise?.monnaie || 'FCFA'}</div>
            </div>
          ))}
        </div>

        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border">
            <span className="text-xs font-semibold">Soldes Intermédiaires de Gestion (SIG)</span>
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
