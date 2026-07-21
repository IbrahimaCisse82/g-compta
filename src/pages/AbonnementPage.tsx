import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Abonnement {
  id: string;
  libelle: string;
  journal_code: string;
  periodicite: string;
  jour_execution: number;
  date_debut: string;
  date_fin: string | null;
  derniere_execution: string | null;
  actif: boolean;
  lignes: { compte: string; intitule: string; debit: number; credit: number }[];
}

export default function AbonnementPage() {
  const { entreprise, exercice, addJournalEntry } = useApp();
  const [abonnements, setAbonnements] = useState<Abonnement[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ libelle: '', journal_code: 'OD', periodicite: 'mensuel', jour_execution: 1, date_debut: '', date_fin: '' });
  const [lignes, setLignes] = useState([{ compte: '', intitule: '', debit: 0, credit: 0 }, { compte: '', intitule: '', debit: 0, credit: 0 }]);

  const loadData = useCallback(async () => {
    if (!entreprise || !exercice) return;
    const { data } = await supabase.from('ecritures_abonnement').select('*')
      .eq('entreprise_id', entreprise.id).eq('exercice_id', exercice.id);
    if (data) setAbonnements(data.map(d => ({ ...d, lignes: (d.lignes as any) || [] })) as any[]);
  }, [entreprise, exercice]);

  useEffect(() => { loadData(); }, [loadData]);

  const addAbonnement = async () => {
    if (!entreprise || !exercice || !form.libelle || !form.date_debut) return;
    setLoading(true);
    const { error } = await supabase.from('ecritures_abonnement').insert({
      entreprise_id: entreprise.id, exercice_id: exercice.id,
      libelle: form.libelle, journal_code: form.journal_code,
      periodicite: form.periodicite, jour_execution: form.jour_execution,
      date_debut: form.date_debut, date_fin: form.date_fin || null,
      lignes: lignes.filter(l => l.compte),
    });
    if (error) toast.error(error.message);
    else { toast.success('Abonnement créé'); setShowForm(false); await loadData(); }
    setLoading(false);
  };

  const executeAbonnement = async (ab: Abonnement) => {
    if (!exercice) return;
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const piece = `AB-${ab.id.slice(0, 6)}`;
    const lines = ab.lignes.map(l => ({
      id: '', exercice_id: exercice.id, entreprise_id: entreprise?.id || '',
      date_ecriture: today, piece, journal_code: ab.journal_code,
      libelle: ab.libelle, compte: l.compte, intitule: l.intitule,
      debit: l.debit, credit: l.credit,
    }));
    await addJournalEntry(lines as any);
    await supabase.from('ecritures_abonnement').update({ derniere_execution: today } as any).eq('id', ab.id);
    toast.success(`Écriture d'abonnement "${ab.libelle}" générée`);
    await loadData();
    setLoading(false);
  };

  const toggleActif = async (id: string, actif: boolean) => {
    await supabase.from('ecritures_abonnement').update({ actif: !actif } as any).eq('id', id);
    await loadData();
  };

  const deleteAb = async (id: string) => {
    await supabase.from('ecritures_abonnement').delete().eq('id', id);
    toast.success('Abonnement supprimé');
    await loadData();
  };

  const updateLigne = (i: number, field: string, val: string | number) => {
    setLignes(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  };

  const totalD = lignes.reduce((s, l) => s + (l.debit || 0), 0);
  const totalC = lignes.reduce((s, l) => s + (l.credit || 0), 0);

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div><div className="font-serif text-[17px]">🔄 Écritures Récurrentes</div>
        <div className="text-[10px] text-fg3 font-mono">Écritures comptables récurrentes automatisées</div></div>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 rounded text-[11px] font-bold border border-border text-fg2 hover:bg-bg3">
          {showForm ? '✕' : '+ Nouvel Abonnement'}
        </button>
      </div>
      <div className="p-5">
        {showForm && (
          <div className="bg-bg2 border border-border rounded-lg p-4 mb-4">
            <div className="font-bold text-sm mb-3 text-primary">📝 Nouvel Abonnement</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div><label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Libellé</label>
                <input value={form.libelle} onChange={e => setForm({ ...form, libelle: e.target.value })} placeholder="Loyer mensuel" className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-[11px]" /></div>
              <div><label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Journal</label>
                <select value={form.journal_code} onChange={e => setForm({ ...form, journal_code: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-[11px]">
                  <option value="OD">OD - Opérations Diverses</option>
                  <option value="AC">AC - Achats</option>
                  <option value="BQ">BQ - Banque</option>
                </select></div>
              <div><label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Périodicité</label>
                <select value={form.periodicite} onChange={e => setForm({ ...form, periodicite: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-[11px]">
                  <option value="mensuel">Mensuel</option>
                  <option value="trimestriel">Trimestriel</option>
                  <option value="semestriel">Semestriel</option>
                  <option value="annuel">Annuel</option>
                </select></div>
              <div><label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Jour d'exécution</label>
                <input type="number" value={form.jour_execution} onChange={e => setForm({ ...form, jour_execution: Number(e.target.value) })} min={1} max={28} className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] font-mono" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Date début</label>
                <input type="date" value={form.date_debut} onChange={e => setForm({ ...form, date_debut: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-[11px]" /></div>
              <div><label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Date fin (optionnel)</label>
                <input type="date" value={form.date_fin} onChange={e => setForm({ ...form, date_fin: e.target.value })} className="w-full bg-bg3 border border-border rounded px-2 py-1.5 text-[11px]" /></div>
            </div>
            {/* Lignes */}
            <div className="border border-border rounded overflow-hidden mb-3">
              <div className="grid grid-cols-[1fr_2fr_120px_120px_40px] bg-bg3 px-3 py-1.5 text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">
                <span>Compte</span><span>Intitulé</span><span className="text-right">Débit</span><span className="text-right">Crédit</span><span></span>
              </div>
              {lignes.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_2fr_120px_120px_40px] items-center px-3 py-1 border-b border-border/30">
                  <input value={l.compte} onChange={e => updateLigne(i, 'compte', e.target.value)} placeholder="601000" className="bg-bg3 border border-border rounded px-2 py-1 text-[11px] font-mono" />
                  <input value={l.intitule} onChange={e => updateLigne(i, 'intitule', e.target.value)} placeholder="Intitulé" className="bg-bg3 border border-border rounded px-2 py-1 text-[11px] mx-1" />
                  <input type="number" value={l.debit || ''} onChange={e => updateLigne(i, 'debit', Number(e.target.value) || 0)} className="bg-bg3 border border-border rounded px-2 py-1 text-[11px] font-mono text-right" />
                  <input type="number" value={l.credit || ''} onChange={e => updateLigne(i, 'credit', Number(e.target.value) || 0)} className="bg-bg3 border border-border rounded px-2 py-1 text-[11px] font-mono text-right" />
                  <button onClick={() => { if (lignes.length > 2) setLignes(prev => prev.filter((_, idx) => idx !== i)); }} className="text-destructive text-xs text-center">✕</button>
                </div>
              ))}
              <div className="flex justify-between px-3 py-1.5 bg-bg3">
                <button onClick={() => setLignes(prev => [...prev, { compte: '', intitule: '', debit: 0, credit: 0 }])} className="text-[11px] text-primary">+ Ligne</button>
                <span className={`text-[11px] font-mono font-bold ${Math.abs(totalD - totalC) < 0.01 ? 'text-success' : 'text-destructive'}`}>D: {fmt(totalD)} / C: {fmt(totalC)}</span>
              </div>
            </div>
            <button onClick={addAbonnement} disabled={!form.libelle || Math.abs(totalD - totalC) > 0.01 || loading}
              className="px-4 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground disabled:opacity-40">✓ Créer</button>
          </div>
        )}

        {/* List */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border">
            <span className="text-xs font-semibold">{abonnements.length} abonnement(s)</span>
          </div>
          <table className="w-full border-collapse">
            <thead><tr>
              {['Libellé', 'Journal', 'Périodicité', 'Jour', 'Début', 'Fin', 'Dernière exéc.', 'Statut', 'Actions'].map(h => (
                <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {abonnements.map(ab => (
                <tr key={ab.id} className="hover:bg-[rgba(56,189,248,.02)]">
                  <td className="px-3 py-1.5 text-[11px] font-bold border-b border-border/50">{ab.libelle}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{ab.journal_code}</td>
                  <td className="px-3 py-1.5 text-[11px] border-b border-border/50">{ab.periodicite}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{ab.jour_execution}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{ab.date_debut}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{ab.date_fin || '—'}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{ab.derniere_execution || '—'}</td>
                  <td className="px-3 py-1.5 border-b border-border/50">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${ab.actif ? 'bg-success/10 text-success' : 'bg-fg3/10 text-fg3'}`}>
                      {ab.actif ? '✓ Actif' : '⏸ Inactif'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 border-b border-border/50 flex gap-1">
                    <button onClick={() => executeAbonnement(ab)} disabled={!ab.actif || loading} className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary font-bold disabled:opacity-40">▶ Exécuter</button>
                    <button onClick={() => toggleActif(ab.id, ab.actif)} className="text-[10px] px-2 py-0.5 rounded bg-accent/10 text-accent">{ab.actif ? '⏸' : '▶'}</button>
                    <button onClick={() => deleteAb(ab.id)} className="text-destructive text-xs">🗑</button>
                  </td>
                </tr>
              ))}
              {abonnements.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-fg3 text-[11px]">Aucun abonnement. Créez des écritures récurrentes.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
