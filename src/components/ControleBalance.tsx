import { useState } from 'react';
import { toast } from 'sonner';
import { fmt } from '@/lib/accounting';
import { getEcartsBalance, getBalanceDerivee, resynchroniserBalance, type EcartBalance, type BalanceDeriveeLine } from '@/lib/ecritures';

/**
 * Contrôle de double-tenue : compare la balance stockée (table `balance`)
 * à la balance dérivée du journal et des écritures validées (`mv_balance`,
 * exposée par les fonctions serveur). Aucun calcul d'intégrité côté client.
 */
export default function ControleBalance({ entrepriseId, exerciceId }: { entrepriseId?: string; exerciceId?: string }) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [ecarts, setEcarts] = useState<EcartBalance[] | null>(null);
  const [derivee, setDerivee] = useState<BalanceDeriveeLine[] | null>(null);

  const lancer = async () => {
    if (!entrepriseId || !exerciceId) { toast.error('Sélectionnez une entreprise et un exercice.'); return; }
    setLoading(true);
    try {
      const [e, d] = await Promise.all([
        getEcartsBalance(entrepriseId, exerciceId),
        getBalanceDerivee(entrepriseId, exerciceId),
      ]);
      setEcarts(e);
      setDerivee(d);
      toast[e.length === 0 ? 'success' : 'warning'](
        e.length === 0 ? 'Aucun écart : balance stockée conforme au journal.' : `${e.length} compte(s) en écart.`
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const resync = async () => {
    if (!entrepriseId || !exerciceId) { toast.error('Sélectionnez une entreprise et un exercice.'); return; }
    setSyncing(true);
    try {
      const n = await resynchroniserBalance(entrepriseId, exerciceId);
      toast.success(`Balance stockée resynchronisée : ${n} compte(s).`);
      await lancer();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const totD = (derivee || []).reduce((s, l) => s + l.md, 0);
  const totC = (derivee || []).reduce((s, l) => s + l.mc, 0);

  return (
    <section aria-labelledby="controle-balance-titre" className="bg-bg2 border border-border rounded-lg mb-4">
      <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between gap-2">
        <div>
          <h2 id="controle-balance-titre" className="text-xs font-semibold">🛡 Contrôle d'intégrité — double tenue</h2>
          <p className="text-[10px] text-fg3">Balance stockée comparée à la balance recalculée par le serveur.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={lancer}
            disabled={loading || syncing}
            className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {loading ? 'Contrôle…' : 'Lancer le contrôle'}
          </button>
          <button
            type="button"
            onClick={resync}
            disabled={loading || syncing}
            className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-border text-fg2 hover:bg-bg3 disabled:opacity-50"
          >
            {syncing ? 'Resynchro…' : '⟳ Resynchroniser'}
          </button>
        </div>
      </div>


      {derivee && (
        <div className="px-3.5 py-2 text-[11px] font-mono border-b border-border/50 flex flex-wrap gap-4">
          <span className="text-fg3">Balance dérivée : {derivee.length} compte(s)</span>
          <span className="text-primary">Mvt débit {fmt(totD)}</span>
          <span className="text-success">Mvt crédit {fmt(totC)}</span>
          <span className={Math.abs(totD - totC) < 1 ? 'text-success' : 'text-destructive'}>
            {Math.abs(totD - totC) < 1 ? '✓ équilibrée' : `⚠ écart ${fmt(Math.abs(totD - totC))}`}
          </span>
        </div>
      )}

      {ecarts && ecarts.length === 0 && (
        <div className="px-3.5 py-3 text-[11px] text-success font-semibold">✓ Aucun écart détecté entre la balance stockée et le journal.</div>
      )}

      {ecarts && ecarts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr>
              {['Compte', 'MD stockée', 'MD calculée', 'Écart débit', 'MC stockée', 'MC calculée', 'Écart crédit'].map(h => (
                <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {ecarts.map(e => (
                <tr key={e.compte}>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-primary border-b border-border/50">{e.compte}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50">{fmt(e.md_stockee)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50">{fmt(e.md_calculee)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-destructive border-b border-border/50">{fmt(e.ecart_debit)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50">{fmt(e.mc_stockee)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50">{fmt(e.mc_calculee)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-destructive border-b border-border/50">{fmt(e.ecart_credit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
