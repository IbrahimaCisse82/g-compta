import { useState, useMemo, useCallback } from 'react';
import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import {
  lancerControles, toutesAnomalies, compterParSeverite,
  type ControleSeverite, type ControleCategorie, type Anomalie,
} from '@/lib/coherence-controls';

const SEVERITE_CONFIG: Record<ControleSeverite, { label: string; color: string; bg: string; dot: string }> = {
  bloquant: { label: 'Bloquant', color: 'text-destructive', bg: 'bg-destructive/10', dot: 'bg-destructive' },
  majeur:   { label: 'Majeur',   color: 'text-amber-500',    bg: 'bg-amber-500/10',    dot: 'bg-amber-500' },
  mineur:   { label: 'Mineur',   color: 'text-blue-400',    bg: 'bg-blue-400/10',     dot: 'bg-blue-400' },
};

const CATEGORIES: ControleCategorie[] = ['equilibre', 'bilan', 'journal', 'plan', 'tiers', 'tresorerie', 'gestion', 'cloture'];

const CATEGORIE_LABELS: Record<ControleCategorie, string> = {
  equilibre: 'Équilibre',
  bilan: 'Bilan',
  journal: 'Journal',
  plan: 'Plan comptable',
  tiers: 'Tiers',
  tresorerie: 'Trésorerie',
  gestion: 'Gestion',
  cloture: 'Clôture',
};

export default function AnomaliesPage() {
  const { entreprise, exercice, balance, journal, plan } = useApp();
  const [filterSeverite, setFilterSeverite] = useState<ControleSeverite | 'all'>('all');
  const [filterCategorie, setFilterCategorie] = useState<ControleCategorie | 'all'>('all');

  const resultats = useMemo(() => {
    if (!exercice) return [];
    return lancerControles({ balance, journal, plan: plan || [], exercice });
  }, [balance, journal, plan, exercice]);

  const anomalies = useMemo(() => toutesAnomalies(resultats), [resultats]);
  const counts = useMemo(() => compterParSeverite(resultats), [resultats]);

  const filteredAnomalies = useMemo(() => {
    return anomalies.filter(a => {
      if (filterSeverite !== 'all' && a.severite !== filterSeverite) return false;
      if (filterCategorie !== 'all' && a.categorie !== filterCategorie) return false;
      return true;
    });
  }, [anomalies, filterSeverite, filterCategorie]);

  const totalOk = resultats.filter(r => r.statut === 'ok').length;
  const totalAnomalie = resultats.filter(r => r.statut === 'anomalie').length;

  if (!exercice) {
    return (
      <div>
        <div className="h-12 bg-bg2 border-b border-border flex items-center px-5">
          <span className="font-serif text-[17px]">🔍 Anomalies & Contrôles</span>
        </div>
        <div className="p-5 text-center text-fg3 text-xs">Sélectionnez un exercice pour lancer les contrôles.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">🔍 Anomalies & Contrôles de cohérence</div>
          <div className="text-[10px] text-fg3 font-mono">{entreprise?.nom} — Exercice {exercice.annee}</div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-success">✓ {totalOk} OK</span>
          <span className="text-destructive">⚠ {totalAnomalie} en anomalie</span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Résumé par sévérité */}
        <div className="grid grid-cols-3 gap-3">
          {(['bloquant', 'majeur', 'mineur'] as ControleSeverite[]).map(sev => {
            const cfg = SEVERITE_CONFIG[sev];
            const n = counts[sev];
            return (
              <button
                key={sev}
                onClick={() => setFilterSeverite(filterSeverite === sev ? 'all' : sev)}
                className={`bg-bg2 border rounded-lg p-3.5 text-left transition-all ${filterSeverite === sev ? 'border-primary' : 'border-border hover:border-border-2'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <span className="text-[9px] uppercase tracking-[1px] font-mono text-fg3">{cfg.label}</span>
                </div>
                <div className={`text-2xl font-bold font-mono ${n > 0 ? cfg.color : 'text-fg3'}`}>{n}</div>
                <div className="text-[10px] text-fg3 mt-0.5">{n === 0 ? 'Aucune anomalie' : `${n} anomalie(s)`}</div>
              </button>
            );
          })}
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-fg3 uppercase tracking-[1px] font-mono mr-1">Catégorie :</span>
          <button
            onClick={() => setFilterCategorie('all')}
            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors ${filterCategorie === 'all' ? 'bg-primary/10 text-primary border-primary/40' : 'border-border text-fg3 hover:bg-bg3'}`}
          >
            Toutes
          </button>
          {CATEGORIES.map(cat => {
            const n = anomalies.filter(a => a.categorie === cat).length;
            if (n === 0) return null;
            return (
              <button
                key={cat}
                onClick={() => setFilterCategorie(filterCategorie === cat ? 'all' : cat)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors ${filterCategorie === cat ? 'bg-primary/10 text-primary border-primary/40' : 'border-border text-fg3 hover:bg-bg3'}`}
              >
                {CATEGORIE_LABELS[cat]} ({n})
              </button>
            );
          })}
        </div>

        {/* Liste des contrôles (vue synthétique) */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border">
            <span className="text-xs font-semibold">📋 22 contrôles SYSCOHADA</span>
          </div>
          <div className="divide-y divide-border/40">
            {resultats.map(r => {
              const cfg = SEVERITE_CONFIG[r.definition.severite];
              const isExpanded = filterSeverite === 'all' && filterCategorie === 'all';
              const showAnomalies = (filterSeverite === 'all' || r.definition.severite === filterSeverite) &&
                                    (filterCategorie === 'all' || r.definition.categorie === filterCategorie) &&
                                    r.anomalies.length > 0;
              return (
                <div key={r.definition.id}>
                  <div className="px-3.5 py-2 flex items-center gap-3">
                    <span className="text-[9px] font-mono text-fg3 w-8 shrink-0">{r.definition.id}</span>
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.statut === 'ok' ? 'bg-success' : cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-foreground truncate">{r.definition.libelle}</div>
                      <div className="text-[9px] text-fg3 truncate">{r.definition.description}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      {r.statut === 'ok' ? (
                        <span className="text-[10px] text-success font-bold">✓ OK</span>
                      ) : (
                        <span className={`text-[10px] font-bold ${cfg.color}`}>⚠ {r.anomalies.length}</span>
                      )}
                    </div>
                  </div>
                  {showAnomalies && (
                    <div className="pl-12 pr-3.5 pb-2 space-y-1">
                      {r.anomalies
                        .filter(a => (filterSeverite === 'all' || a.severite === filterSeverite) &&
                                     (filterCategorie === 'all' || a.categorie === filterCategorie))
                        .map((a, i) => (
                          <div key={i} className="flex items-start gap-2 text-[10px] py-0.5">
                            <span className={`px-1.5 py-0.5 rounded font-mono text-[8px] shrink-0 ${SEVERITE_CONFIG[a.severite].bg} ${SEVERITE_CONFIG[a.severite].color}`}>
                              {SEVERITE_CONFIG[a.severite].label}
                            </span>
                            {a.compte && <span className="font-mono text-primary shrink-0">{a.compte}</span>}
                            {a.piece && <span className="font-mono text-fg3 shrink-0">📎{a.piece}</span>}
                            {a.date && <span className="font-mono text-fg3 shrink-0">{a.date}</span>}
                            <span className="text-fg2 flex-1">{a.message}</span>
                            {a.montant != null && a.montant > 0 && (
                              <span className="font-mono text-fg3 shrink-0">{fmt(a.montant)}</span>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Détail des anomalies filtrées */}
        {filteredAnomalies.length > 0 && (
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold">⚠ Anomalies détectées ({filteredAnomalies.length})</span>
              {(filterSeverite !== 'all' || filterCategorie !== 'all') && (
                <button
                  onClick={() => { setFilterSeverite('all'); setFilterCategorie('all'); }}
                  className="text-[10px] text-primary hover:underline"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0">
                  <tr>
                    {['Ctrl', 'Sévérité', 'Catégorie', 'Compte', 'Pièce', 'Date', 'Message', 'Montant'].map(h => (
                      <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAnomalies.map((a, i) => {
                    const cfg = SEVERITE_CONFIG[a.severite];
                    return (
                      <tr key={i} className="hover:bg-bg3/50">
                        <td className="px-3 py-1.5 text-[10px] font-mono text-fg3 border-b border-border/30">{a.controle_id}</td>
                        <td className="px-3 py-1.5 border-b border-border/30">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                        </td>
                        <td className="px-3 py-1.5 text-[10px] text-fg2 border-b border-border/30">{CATEGORIE_LABELS[a.categorie]}</td>
                        <td className="px-3 py-1.5 text-[10px] font-mono text-primary border-b border-border/30">{a.compte || '—'}</td>
                        <td className="px-3 py-1.5 text-[10px] font-mono text-fg3 border-b border-border/30">{a.piece || '—'}</td>
                        <td className="px-3 py-1.5 text-[10px] font-mono text-fg3 border-b border-border/30">{a.date || '—'}</td>
                        <td className="px-3 py-1.5 text-[10px] text-fg2 border-b border-border/30">{a.message}</td>
                        <td className="px-3 py-1.5 text-[10px] font-mono text-right text-fg3 border-b border-border/30">{a.montant != null && a.montant > 0 ? fmt(a.montant) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {filteredAnomalies.length === 0 && anomalies.length === 0 && (
          <div className="bg-bg2 border border-border rounded-lg p-8 text-center">
            <div className="text-3xl mb-2">✅</div>
            <div className="text-sm font-semibold text-success">Aucune anomalie détectée</div>
            <div className="text-[11px] text-fg3 mt-1">Les 22 contrôles de cohérence SYSCOHADA sont passés avec succès.</div>
          </div>
        )}
      </div>
    </div>
  );
}
