import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ClotureLog { id: string; action: string; details: any; created_at: string; user_id: string | null; }

export default function CloturePage() {
  const { exercice, exercices, entreprise, balance, clotureExercice, affecterResultat, loading, openExercice } = useApp();
  const [logs, setLogs] = useState<ClotureLog[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState<string | null>(null);
  const [showAffectation, setShowAffectation] = useState(false);
  const [aff, setAff] = useState({ ran: 0, reserves: 0, dividendes: 0 });

  const loadLogs = useCallback(async () => {
    if (!entreprise) return;
    const { data } = await supabase.from('cloture_logs').select('*')
      .eq('entreprise_id', entreprise.id).order('created_at', { ascending: false });
    if (data) setLogs(data as any[]);
  }, [entreprise]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleCloture = async () => {
    if (!confirming) { setConfirming(true); return; }
    setConfirming(false);
    // Log the clôture
    if (entreprise && exercice) {
      await supabase.from('cloture_logs').insert({
        entreprise_id: entreprise.id, exercice_id: exercice.id,
        action: 'cloture', details: {
          annee: exercice.annee,
          nb_comptes_bilan: balance.filter(b => /^[1-5]/.test(b.compte)).length,
          resultat_net: balance.filter(b => /^[6-8]/.test(b.compte)).reduce((s, b) => s + ((b.sfc || 0) - (b.sfd || 0)), 0),
        },
      });
    }
    await clotureExercice();
    await loadLogs();
  };

  const handleReopen = async (excId: string) => {
    if (confirmReopen !== excId) { setConfirmReopen(excId); return; }
    setConfirmReopen(null);
    // Reopen = set status back to en_cours
    const { error } = await supabase.from('exercices').update({ statut: 'en_cours' } as any).eq('id', excId);
    if (error) { toast.error(error.message); return; }
    if (entreprise && exercice) {
      await supabase.from('cloture_logs').insert({
        entreprise_id: entreprise.id, exercice_id: excId,
        action: 'reouverture', details: { annee: exercices.find(e => e.id === excId)?.annee },
      });
    }
    toast.success('Exercice réouvert');
    await openExercice(excId);
    await loadLogs();
  };

  const canCloture = exercice?.statut === 'en_cours';
  const resultatNet = balance.filter(b => /^[6-8]/.test(b.compte)).reduce((s, b) => s + ((b.sfc || 0) - (b.sfd || 0)), 0);
  const bilanCount = balance.filter(b => /^[1-5]/.test(b.compte)).length;
  const compte131 = balance.find(b => /^131/.test(b.compte));
  const resultat131 = compte131 ? (compte131.sfc || 0) - (compte131.sfd || 0) : 0;

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div><div className="font-serif text-[17px]">🔒 Clôture & Réouverture d'Exercice</div>
        <div className="text-[10px] text-fg3 font-mono">Gestion complète du cycle de vie des exercices</div></div>
      </div>
      <div className="p-5">
        {/* Current exercice info */}
        <div className="bg-bg2 border border-border rounded-lg p-4 mb-4">
          <div className="font-bold text-sm mb-3 text-primary">📅 Exercice courant : {exercice?.annee}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-[10px] text-fg3 uppercase font-mono">Statut</div>
              <div className={`text-sm font-bold ${exercice?.statut === 'en_cours' ? 'text-accent' : 'text-success'}`}>
                {exercice?.statut === 'en_cours' ? '🟡 En cours' : '🟢 Clôturé'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-fg3 uppercase font-mono">Comptes de bilan</div>
              <div className="text-sm font-bold font-mono">{bilanCount}</div>
            </div>
            <div>
              <div className="text-[10px] text-fg3 uppercase font-mono">Résultat net</div>
              <div className={`text-sm font-bold font-mono ${resultatNet >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(resultatNet)}</div>
            </div>
            <div>
              <div className="text-[10px] text-fg3 uppercase font-mono">Période</div>
              <div className="text-sm font-mono">{exercice?.date_debut} → {exercice?.date_fin}</div>
            </div>
          </div>

          {/* Info */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4 text-[11px] text-fg2">
            <strong className="text-primary">Processus de clôture :</strong>
            <ul className="list-disc ml-4 mt-1 space-y-0.5">
              <li>Les comptes de bilan (classes 1-5) sont reportés en à-nouveaux</li>
              <li>Les comptes de résultat (classes 6-8) sont soldés</li>
              <li>Le résultat net est porté au compte 131 (résultat en instance d'affectation)</li>
              <li>L'exercice est verrouillé (lecture seule)</li>
              <li>Un nouvel exercice N+1 est automatiquement créé</li>
            </ul>
          </div>

          {canCloture && (
            <div className="flex items-center gap-2">
              {confirming && <span className="text-[10px] text-destructive font-bold animate-pulse">⚠ Cette action est irréversible. Confirmer ?</span>}
              <button onClick={handleCloture} disabled={loading}
                className={`px-4 py-2 rounded text-[11px] font-bold ${confirming ? 'bg-destructive text-destructive-foreground' : 'bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25'}`}>
                {loading ? '⏳ Clôture en cours...' : confirming ? '⚠ Oui, clôturer définitivement' : `🔒 Clôturer l'exercice ${exercice?.annee}`}
              </button>
              {confirming && <button onClick={() => setConfirming(false)} className="px-3 py-1 rounded text-[10px] border border-border text-fg2">Annuler</button>}
            </div>
          )}
        </div>

        {/* Affectation du résultat (post-AG) — uniquement si un 131 est présent */}
        {Math.abs(resultat131) > 0.01 && (
          <div className="bg-bg2 border border-border rounded-lg p-4 mb-4">
            <div className="font-bold text-sm mb-1 text-primary">⚖️ Affectation du résultat (décision d'AG)</div>
            <div className="text-[11px] text-fg3 mb-3">
              Résultat à affecter (compte 131) : <span className={`font-mono font-bold ${resultat131 >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(resultat131)}</span>
              {' '}— répartissez-le entre RAN, réserves et dividendes (total = {fmt(Math.abs(resultat131))}).
            </div>
            {!showAffectation ? (
              <button onClick={() => { setAff({ ran: Math.abs(resultat131), reserves: 0, dividendes: 0 }); setShowAffectation(true); }}
                className="px-3 py-1.5 rounded text-[11px] font-bold bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25">
                Affecter le résultat
              </button>
            ) : (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <label className="text-[11px] text-fg2 flex flex-col gap-1">
                    Report à nouveau (121/129)
                    <input type="number" value={aff.ran} onChange={e => setAff({ ...aff, ran: parseFloat(e.target.value) || 0 })}
                      className="bg-bg1 border border-border rounded px-2 py-1.5 text-[11px] font-mono" />
                  </label>
                  <label className="text-[11px] text-fg2 flex flex-col gap-1">
                    Réserves (118)
                    <input type="number" value={aff.reserves} disabled={resultat131 < 0} onChange={e => setAff({ ...aff, reserves: parseFloat(e.target.value) || 0 })}
                      className="bg-bg1 border border-border rounded px-2 py-1.5 text-[11px] font-mono disabled:opacity-40" />
                  </label>
                  <label className="text-[11px] text-fg2 flex flex-col gap-1">
                    Dividendes (465)
                    <input type="number" value={aff.dividendes} disabled={resultat131 < 0} onChange={e => setAff({ ...aff, dividendes: parseFloat(e.target.value) || 0 })}
                      className="bg-bg1 border border-border rounded px-2 py-1.5 text-[11px] font-mono disabled:opacity-40" />
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => affecterResultat(aff)} disabled={loading}
                    className="px-4 py-1.5 rounded text-[11px] font-bold bg-success text-white hover:bg-success/90 disabled:opacity-50">
                    {loading ? '⏳ Affectation...' : "Valider l'affectation"}
                  </button>
                  <button onClick={() => setShowAffectation(false)} className="px-3 py-1.5 rounded text-[11px] border border-border text-fg2">Annuler</button>
                  <span className="text-[10px] text-fg3 font-mono ml-auto">Total : {fmt(aff.ran + aff.reserves + aff.dividendes)} / {fmt(Math.abs(resultat131))}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* All exercices */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden mb-4">
          <div className="px-3.5 py-2.5 border-b border-border">
            <span className="text-xs font-semibold">Tous les exercices</span>
          </div>
          <table className="w-full border-collapse">
            <thead><tr>
              {['Année', 'Début', 'Fin', 'Statut', 'Actions'].map(h => (
                <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {exercices.sort((a, b) => b.annee - a.annee).map(e => (
                <tr key={e.id} className={`hover:bg-[rgba(56,189,248,.02)] ${exercice?.id === e.id ? 'bg-primary/5' : ''}`}>
                  <td className="px-3 py-1.5 text-[11px] font-mono font-bold text-accent border-b border-border/50">{e.annee}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{e.date_debut}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{e.date_fin}</td>
                  <td className="px-3 py-1.5 border-b border-border/50">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${e.statut === 'en_cours' ? 'bg-accent/10 text-accent' : 'bg-success/10 text-success'}`}>
                      {e.statut === 'en_cours' ? '🟡 En cours' : '🟢 Clôturé'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 border-b border-border/50 flex gap-1">
                    <button onClick={() => openExercice(e.id)} className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">
                      {exercice?.id === e.id ? '✓ Actif' : 'Ouvrir'}
                    </button>
                    {e.statut === 'cloture' && (
                      <>
                        {confirmReopen === e.id && <span className="text-[9px] text-destructive animate-pulse">Confirmer ?</span>}
                        <button onClick={() => handleReopen(e.id)} className={`text-[10px] px-2 py-0.5 rounded ${confirmReopen === e.id ? 'bg-destructive/10 text-destructive font-bold' : 'bg-accent/10 text-accent'}`}>
                          {confirmReopen === e.id ? '⚠ Oui' : '🔓 Réouvrir'}
                        </button>
                        {confirmReopen === e.id && <button onClick={() => setConfirmReopen(null)} className="text-[9px] text-fg3">Non</button>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Logs */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border">
            <span className="text-xs font-semibold">📜 Historique des opérations</span>
          </div>
          <table className="w-full border-collapse">
            <thead><tr>
              {['Date', 'Action', 'Détails'].map(h => (
                <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="hover:bg-[rgba(56,189,248,.02)]">
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{new Date(l.created_at).toLocaleString('fr-FR')}</td>
                  <td className="px-3 py-1.5 border-b border-border/50">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${l.action === 'cloture' ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent'}`}>
                      {l.action === 'cloture' ? '🔒 Clôture' : '🔓 Réouverture'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-[11px] text-fg3 font-mono border-b border-border/50">{JSON.stringify(l.details)}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-center text-fg3 text-[11px]">Aucun historique</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
