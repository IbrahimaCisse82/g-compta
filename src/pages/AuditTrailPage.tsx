import { useEffect, useState } from 'react';
import { useApp } from '@/stores/app-store';
import { supabase } from '@/integrations/supabase/client';
import { fmt } from '@/lib/accounting';

interface AuditEntry {
  id: string;
  journal_id: string | null;
  action: string;
  old_data: any;
  new_data: any;
  created_at: string;
}

export default function AuditTrailPage() {
  const { entreprise, exercice, demo } = useApp();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entreprise || !exercice) return;
    setLoading(true);
    supabase
      .from('journal_audit')
      .select('*')
      .eq('entreprise_id', entreprise.id)
      .eq('exercice_id', exercice.id)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setEntries((data as any[]) || []);
        setLoading(false);
      });
  }, [entreprise, exercice]);

  const actionLabel: Record<string, { label: string; color: string }> = {
    INSERT: { label: '➕ Création', color: 'text-success' },
    UPDATE: { label: '✏️ Modification', color: 'text-accent' },
    DELETE: { label: '🗑️ Suppression', color: 'text-destructive' },
  };

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">Piste d'Audit</div>
          <div className="text-[10px] text-fg3 font-mono">Historique des modifications — Exercice {exercice?.annee}</div>
        </div>
        <span className="text-[10px] text-fg3 font-mono">{entries.length} entrée(s)</span>
      </div>
      <div className="p-5">
        {demo && (
          <div className="bg-accent/10 text-accent rounded-lg px-4 py-3 text-xs mb-4">
            ℹ️ L'audit trail enregistre automatiquement toutes les opérations sur le journal. En mode démo, l'historique est limité.
          </div>
        )}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Date/Heure', 'Action', 'Pièce', 'Compte', 'Libellé', 'Débit', 'Crédit'].map(h => (
                  <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[0.5px] font-mono border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-fg3 text-xs">Chargement...</td></tr>
              )}
              {!loading && entries.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-fg3 text-xs">Aucune opération enregistrée</td></tr>
              )}
              {entries.map(e => {
                const data = e.action === 'DELETE' ? e.old_data : e.new_data;
                const a = actionLabel[e.action] || { label: e.action, color: 'text-fg2' };
                return (
                  <tr key={e.id} className="hover:bg-[rgba(56,189,248,.02)]">
                    <td className="px-3 py-1 text-[10px] font-mono text-fg3 border-b border-border/30">
                      {new Date(e.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className={`px-3 py-1 text-[10px] font-bold border-b border-border/30 ${a.color}`}>{a.label}</td>
                    <td className="px-3 py-1 text-[10px] font-mono border-b border-border/30">{data?.piece || '—'}</td>
                    <td className="px-3 py-1 text-[10px] font-mono text-primary font-bold border-b border-border/30">{data?.compte || '—'}</td>
                    <td className="px-3 py-1 text-[10px] border-b border-border/30 max-w-[200px] truncate">{data?.libelle || '—'}</td>
                    <td className="px-3 py-1 text-[10px] font-mono text-right border-b border-border/30">{data?.debit ? fmt(data.debit) : '—'}</td>
                    <td className="px-3 py-1 text-[10px] font-mono text-right border-b border-border/30">{data?.credit ? fmt(data.credit) : '—'}</td>
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
