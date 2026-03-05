import { useApp } from '@/stores/app-store';

export default function ExercicesPage() {
  const { exercices, openExercice, deleteExercice, exercice } = useApp();
  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">Exercices Comptables</div>
      </div>
      <div className="p-5">
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
              {exercices.map(e => (
                <tr key={e.id} className="hover:bg-[rgba(56,189,248,.02)]">
                  <td className="px-3 py-1.5 text-[11px] text-accent font-bold font-mono border-b border-border/50">{e.annee}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{e.date_debut}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{e.date_fin}</td>
                  <td className="px-3 py-1.5 border-b border-border/50">
                    <span className={`rounded-lg px-1.5 py-0.5 text-[9px] font-bold font-mono ${e.statut === 'en_cours' ? 'bg-[rgba(245,158,11,.12)] text-accent' : 'bg-[rgba(52,211,153,.12)] text-success'}`}>{e.statut === 'en_cours' ? 'En cours' : 'Clôturé'}</span>
                  </td>
                  <td className="px-3 py-1.5 border-b border-border/50">
                    <button onClick={() => openExercice(e.id)} className="text-[10px] px-2.5 py-1 rounded bg-primary text-primary-foreground font-semibold mr-1">Ouvrir</button>
                    <button onClick={() => deleteExercice(e.id)} className="text-[10px] px-2 py-1 rounded bg-[rgba(251,113,133,.12)] text-destructive">🗑</button>
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
