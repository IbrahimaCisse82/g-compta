import { useApp } from '@/stores/app-store';
import { useState } from 'react';

export default function ExercicesPage() {
  const { exercices, openExercice, deleteExercice, exercice, clotureExercice, loading } = useApp();
  const [confirming, setConfirming] = useState(false);

  const handleCloture = async () => {
    if (!confirming) { setConfirming(true); return; }
    setConfirming(false);
    await clotureExercice();
  };

  const canCloture = exercice?.statut === 'en_cours';

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">Exercices Comptables</div>
        {canCloture && (
          <div className="flex items-center gap-2">
            {confirming && <span className="text-[10px] text-destructive font-semibold animate-pulse">Confirmer la clôture ?</span>}
            <button
              onClick={handleCloture}
              disabled={loading}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                confirming
                  ? 'bg-destructive text-destructive-foreground border-destructive'
                  : 'bg-accent/15 text-accent border-accent/30 hover:bg-accent/25'
              }`}
            >
              {loading ? '⏳ Clôture...' : confirming ? '⚠ Oui, clôturer' : `🔒 Clôturer ${exercice.annee}`}
            </button>
            {confirming && (
              <button onClick={() => setConfirming(false)} className="px-2 py-1 rounded text-[10px] border border-border text-fg2">Annuler</button>
            )}
          </div>
        )}
      </div>
      <div className="p-5">
        {/* Info box */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4 text-[11px] text-fg2">
          <strong className="text-primary">Clôture d'exercice :</strong> À la clôture, les soldes des comptes de bilan (classes 1-5) sont reportés en à-nouveaux sur l'exercice suivant. Les comptes de résultat (classes 6-8) sont soldés et le résultat net est affecté au Report à Nouveau (131).
        </div>

        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border">
            <span className="text-xs font-semibold">{exercices.length} exercice(s)</span>
          </div>
          <table className="w-full border-collapse">
            <thead><tr>
              {['Année', 'Début', 'Fin', 'Statut', 'Actions'].map(h => (
                <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {exercices.sort((a, b) => b.annee - a.annee).map(e => (
                <tr key={e.id} className={`hover:bg-[rgba(56,189,248,.02)] ${exercice?.id === e.id ? 'bg-primary/5' : ''}`}>
                  <td className="px-3 py-1.5 text-[11px] text-accent font-bold font-mono border-b border-border/50">
                    {e.annee}
                    {exercice?.id === e.id && <span className="ml-1.5 text-[8px] text-primary bg-primary/10 rounded px-1 py-0.5">actif</span>}
                  </td>
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{e.date_debut}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{e.date_fin}</td>
                  <td className="px-3 py-1.5 border-b border-border/50">
                    <span className={`rounded-lg px-1.5 py-0.5 text-[9px] font-bold font-mono ${e.statut === 'en_cours' ? 'bg-accent/10 text-accent' : 'bg-success/10 text-success'}`}>
                      {e.statut === 'en_cours' ? '🟡 En cours' : '🟢 Clôturé'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 border-b border-border/50 flex gap-1">
                    <button onClick={() => openExercice(e.id)} className="text-[10px] px-2.5 py-1 rounded bg-primary text-primary-foreground font-semibold">
                      {exercice?.id === e.id ? '✓ Ouvert' : 'Ouvrir'}
                    </button>
                    {e.statut === 'en_cours' && exercice?.id !== e.id && (
                      <button onClick={() => deleteExercice(e.id)} className="text-[10px] px-2 py-1 rounded bg-destructive/10 text-destructive">🗑</button>
                    )}
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
