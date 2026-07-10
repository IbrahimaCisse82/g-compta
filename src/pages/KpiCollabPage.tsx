import { useEffect, useState, useCallback, useMemo } from 'react';
import { useApp } from '@/stores/app-store';
import { supabase } from '@/integrations/supabase/client';

interface Row {
  user_id: string | null;
  email: string;
  ecritures_saisies: number;
  soumises: number;
  validees: number;
  refusees: number;
  taux_validation: number;
  delai_moyen_h: number;
}

interface JournalRow {
  soumis_par: string | null;
  valide_par: string | null;
  statut_validation: string;
  created_at: string;
  soumis_le: string | null;
  valide_le: string | null;
}

export default function KpiCollabPage() {
  const { entreprise, env, demo } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [period, setPeriod] = useState<'30j' | '90j' | 'all'>('30j');
  const [loading, setLoading] = useState(false);
  const [totalEc, setTotalEc] = useState(0);
  const [totalVal, setTotalVal] = useState(0);
  const [totalRef, setTotalRef] = useState(0);

  const cutoff = useMemo(() => {
    if (period === 'all') return null;
    const d = new Date();
    d.setDate(d.getDate() - (period === '30j' ? 30 : 90));
    return d.toISOString();
  }, [period]);

  const load = useCallback(async () => {
    if (!entreprise || demo) { setRows([]); return; }
    setLoading(true);

    let q = supabase.from('journal')
      .select('soumis_par,valide_par,statut_validation,created_at,soumis_le,valide_le')
      .eq('entreprise_id', entreprise.id);
    if (cutoff) q = q.gte('created_at', cutoff);
    const { data: journal } = await q;

    // Aggregate by soumis_par (or valide_par for those who validate)
    const acc = new Map<string, Row>();
    const get = (id: string) => {
      if (!acc.has(id)) acc.set(id, { user_id: id, email: id.slice(0, 8) + '…', ecritures_saisies: 0, soumises: 0, validees: 0, refusees: 0, taux_validation: 0, delai_moyen_h: 0 });
      return acc.get(id)!;
    };
    const delais: Record<string, number[]> = {};

    (journal as JournalRow[] || []).forEach(j => {
      const author = j.soumis_par;
      if (author) {
        const r = get(author);
        r.ecritures_saisies += 1;
        if (j.statut_validation === 'soumis') r.soumises += 1;
        if (j.statut_validation === 'valide') r.validees += 1;
        if (j.statut_validation === 'refuse') r.refusees += 1;
        if (j.soumis_le && j.valide_le) {
          const h = (new Date(j.valide_le).getTime() - new Date(j.soumis_le).getTime()) / 3600000;
          delais[author] = delais[author] || [];
          delais[author].push(h);
        }
      }
    });

    const list = Array.from(acc.values()).map(r => ({
      ...r,
      taux_validation: r.ecritures_saisies > 0 ? Math.round((r.validees / r.ecritures_saisies) * 100) : 0,
      delai_moyen_h: delais[r.user_id!] ? Math.round((delais[r.user_id!].reduce((a, b) => a + b, 0) / delais[r.user_id!].length) * 10) / 10 : 0,
    })).sort((a, b) => b.ecritures_saisies - a.ecritures_saisies);

    // Try to resolve emails via profiles
    const ids = list.map(l => l.user_id).filter(Boolean) as string[];
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id,email,full_name').in('id', ids);
      const map = new Map((profs || []).map(p => [p.id, p]));
      list.forEach(l => {
        const p = map.get(l.user_id!);
        if (p) l.email = p.full_name || p.email || l.email;
      });
    }

    setRows(list);
    setTotalEc(list.reduce((s, r) => s + r.ecritures_saisies, 0));
    setTotalVal(list.reduce((s, r) => s + r.validees, 0));
    setTotalRef(list.reduce((s, r) => s + r.refusees, 0));
    setLoading(false);
  }, [entreprise, demo, cutoff]);

  useEffect(() => { load(); }, [load]);

  if (env !== 'cabinet') {
    return (
      <div className="p-8 text-center text-fg3 text-sm">
        📊 Ce tableau est réservé au mode Cabinet.
      </div>
    );
  }

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">📊 KPI Collaborateurs</div>
        <div className="flex items-center gap-2">
          {(['30j', '90j', 'all'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-2 py-1 rounded-md text-[10px] font-mono border ${period === p ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-fg2 hover:bg-bg3'}`}>
              {p === '30j' ? '30 jours' : p === '90j' ? '90 jours' : 'Tout'}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {demo && <div className="px-3 py-2 rounded-lg bg-accent/10 text-accent text-xs font-bold">⚡ Mode démo — données non chargées</div>}

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[10px] text-fg3 uppercase font-mono">Écritures saisies</div>
            <div className="text-2xl font-bold text-primary">{totalEc}</div>
          </div>
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[10px] text-fg3 uppercase font-mono">Validées</div>
            <div className="text-2xl font-bold text-accent">{totalVal}</div>
          </div>
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[10px] text-fg3 uppercase font-mono">Refusées</div>
            <div className="text-2xl font-bold text-destructive">{totalRef}</div>
          </div>
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[10px] text-fg3 uppercase font-mono">Collaborateurs actifs</div>
            <div className="text-2xl font-bold">{rows.length}</div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-bg3 text-fg3 text-[9px] uppercase font-mono tracking-wider">
              <tr>
                <th className="p-2 text-left">Collaborateur</th>
                <th className="p-2 text-right">Écritures</th>
                <th className="p-2 text-right">Soumises</th>
                <th className="p-2 text-right">Validées</th>
                <th className="p-2 text-right">Refusées</th>
                <th className="p-2 text-right">Taux validation</th>
                <th className="p-2 text-right">Délai moy. (h)</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="p-6 text-center text-fg3">Chargement…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-fg3">Aucune activité sur la période</td></tr>}
              {rows.map(r => (
                <tr key={r.user_id || Math.random()} className="border-t border-border">
                  <td className="p-2 font-semibold">{r.email}</td>
                  <td className="p-2 text-right font-mono">{r.ecritures_saisies}</td>
                  <td className="p-2 text-right font-mono text-fg2">{r.soumises}</td>
                  <td className="p-2 text-right font-mono text-accent">{r.validees}</td>
                  <td className="p-2 text-right font-mono text-destructive">{r.refusees}</td>
                  <td className="p-2 text-right">
                    <span className={`font-mono font-bold ${r.taux_validation >= 80 ? 'text-accent' : r.taux_validation >= 50 ? 'text-primary' : 'text-destructive'}`}>
                      {r.taux_validation}%
                    </span>
                  </td>
                  <td className="p-2 text-right font-mono">{r.delai_moyen_h || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[10px] text-fg3">
          💡 Les collaborateurs listés sont ceux qui ont soumis au moins une écriture. Le délai moyen mesure le temps entre soumission et validation.
        </p>
      </div>
    </div>
  );
}
