import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { useUserRole } from '@/hooks/use-user-role';
import { toast } from 'sonner';

interface Row { id: string; entreprise_id: string | null; role: string; compte: string; libelle: string }

export default function ComptesSystemePage() {
  const { entreprise, plan, demo } = useApp();
  const { canManageCabinet } = useUserRole();
  const [rows, setRows] = useState<Row[]>([]);
  const [edit, setEdit] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!entreprise || demo) return;
    const { data } = await supabase.from('comptes_systeme').select('id,entreprise_id,role,compte,libelle')
      .or(`entreprise_id.is.null,entreprise_id.eq.${entreprise.id}`);
    setRows((data ?? []) as Row[]);
  }, [entreprise?.id, demo]);
  useEffect(() => { load(); }, [load]);

  const roles = Array.from(new Set(rows.map(r => r.role))).sort();
  const eff = (role: string) => rows.find(r => r.role === role && r.entreprise_id) ?? rows.find(r => r.role === role && !r.entreprise_id)!;

  const save = async (role: string) => {
    const compte = (edit[role] ?? '').trim();
    if (!entreprise || !compte) return;
    if (!plan.some(p => p.numero === compte || p.numero.startsWith(compte))) {
      toast.error(`Le compte ${compte} n'existe pas dans le plan comptable.`); return;
    }
    const base = eff(role);
    const own = rows.find(r => r.role === role && r.entreprise_id);
    const { error } = own
      ? await supabase.from('comptes_systeme').update({ compte }).eq('id', own.id)
      : await supabase.from('comptes_systeme').insert({ entreprise_id: entreprise.id, role, compte, libelle: base.libelle });
    if (error) { toast.error(error.message); return; }
    toast.success('Compte de référence enregistré (tracé au journal d\'audit).');
    setEdit(e => { const n = { ...e }; delete n[role]; return n; });
    load();
  };

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center px-5">
        <div className="font-serif text-[17px]">Comptes système</div>
      </div>
      <div className="p-5">
        <div className="text-[11px] text-fg3 mb-3">
          Comptes de référence utilisés par la clôture, l'affectation du résultat et la TVA. Les valeurs par défaut
          SYSCOHADA sont à valider par l'expert-comptable. {canManageCabinet ? '' : 'Lecture seule : seul un administrateur peut les modifier.'}
        </div>
        {demo ? <div className="text-xs text-fg3">Non disponible en mode démo.</div> : (
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <table className="w-full text-[11px]">
            <thead><tr className="bg-bg3 text-[9px] uppercase font-mono text-fg3">
              <th className="text-left px-3 py-1.5">Rôle</th><th className="text-left px-3 py-1.5">Libellé</th>
              <th className="text-left px-3 py-1.5">Compte</th><th className="text-left px-3 py-1.5">Origine</th><th></th>
            </tr></thead>
            <tbody>{roles.map(role => { const r = eff(role); return (
              <tr key={role} className="border-t border-border/50">
                <td className="px-3 py-1.5 font-mono text-fg3">{role}</td>
                <td className="px-3 py-1.5">{r.libelle}</td>
                <td className="px-3 py-1.5">
                  {canManageCabinet ? (
                    <input value={edit[role] ?? r.compte} onChange={e => setEdit({ ...edit, [role]: e.target.value })}
                      className="bg-bg3 border border-border rounded px-2 py-1 font-mono w-24 outline-none focus:border-primary" />
                  ) : <span className="font-mono">{r.compte}</span>}
                </td>
                <td className="px-3 py-1.5 text-fg3">{r.entreprise_id ? 'Personnalisé' : 'Défaut SYSCOHADA'}</td>
                <td className="px-3 py-1.5">{canManageCabinet && edit[role] !== undefined && edit[role] !== r.compte && (
                  <button onClick={() => save(role)} className="px-2 py-1 rounded bg-primary text-primary-foreground font-bold">Enregistrer</button>
                )}</td>
              </tr>); })}</tbody>
          </table>
        </div>)}
      </div>
    </div>
  );
}
