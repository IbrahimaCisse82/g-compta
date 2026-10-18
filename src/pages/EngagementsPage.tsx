import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/stores/app-store';
import { supabase } from '@/integrations/supabase/client';
import { fmt } from '@/lib/accounting';
import { toast } from 'sonner';

/**
 * Engagements hors bilan (classe 9 SYSCOHADA).
 * Garanties reçues/données, crédits confirmés, cautions.
 * Ces engagements sont tracés à part et n'alimentent NI le bilan NI le journal.
 */

type TypeEngagement = 'garantie_donnee' | 'garantie_recue' | 'credit_confirme' | 'caution' | 'autre';

const TYPES: { value: TypeEngagement; label: string; compte: string }[] = [
  { value: 'garantie_donnee', label: 'Garantie donnée', compte: '901' },
  { value: 'garantie_recue', label: 'Garantie reçue', compte: '902' },
  { value: 'credit_confirme', label: 'Crédit confirmé', compte: '905' },
  { value: 'caution', label: 'Caution', compte: '903' },
  { value: 'autre', label: 'Autre engagement', compte: '909' },
];

interface Engagement {
  id: string;
  type_engagement: TypeEngagement;
  compte_engagement: string;
  libelle: string;
  tiers: string | null;
  montant: number;
  devise: string;
  date_debut: string | null;
  date_echeance: string | null;
  statut: string;
  notes: string | null;
}

const emptyForm = {
  type_engagement: 'garantie_donnee' as TypeEngagement,
  libelle: '',
  tiers: '',
  montant: '',
  devise: 'FCFA',
  date_debut: '',
  date_echeance: '',
  notes: '',
};

export default function EngagementsPage() {
  const { entreprise, exercice, loading: appLoading } = useApp();
  const [items, setItems] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    if (!entreprise) return;
    setLoading(true);
    setTableMissing(false);
    try {
      let q = supabase.from('engagements').select('*').eq('entreprise_id', entreprise.id).order('created_at', { ascending: false });
      if (exercice) q = q.eq('exercice_id', exercice.id);
      const { data, error } = await q;
      if (error) {
        // Table non encore créée (migration non appliquée sur le projet Supabase)
        const missing = error.code === '42P01' || /does not exist/i.test(error.message || '') || /42P01/.test(JSON.stringify(error));
        if (missing) {
          setTableMissing(true);
        } else {
          toast.error(error.message);
        }
        setItems([]);
        return;
      }
      setItems((data || []) as Engagement[]);
    } catch {
      setTableMissing(true);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [entreprise, exercice]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!entreprise || !exercice) { toast.error('Aucun exercice sélectionné.'); return; }
    const t = TYPES.find(x => x.value === form.type_engagement)!;
    const montant = parseFloat(form.montant) || 0;
    if (!form.libelle.trim()) { toast.error('Libellé requis.'); return; }
    if (montant <= 0) { toast.error('Montant doit être positif.'); return; }
    const { error } = await supabase.from('engagements').insert({
      entreprise_id: entreprise.id,
      exercice_id: exercice.id,
      type_engagement: form.type_engagement,
      compte_engagement: t.compte,
      libelle: form.libelle.trim(),
      tiers: form.tiers.trim() || null,
      montant,
      devise: form.devise,
      date_debut: form.date_debut || null,
      date_echeance: form.date_echeance || null,
      notes: form.notes.trim() || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Engagement hors bilan enregistré');
    setForm(emptyForm);
    setShowForm(false);
    await load();
  };

  const handleExtourne = async (id: string) => {
    const { error } = await supabase.from('engagements').update({ statut: 'extourne' }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Engagement extourné');
    await load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('engagements').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    await load();
  };

  const totalActif = items.filter(i => i.statut === 'actif').reduce((s, i) => s + i.montant, 0);

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">📜 Engagements Hors Bilan</div>
          <div className="text-[10px] text-fg3 font-mono">Classe 9 SYSCOHADA — tracés à part, hors bilan et hors journal</div>
        </div>
        {!tableMissing && (
          <button onClick={() => setShowForm(s => !s)}
            className="px-3 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground hover:opacity-90">
            {showForm ? '✕ Fermer' : '+ Nouvel engagement'}
          </button>
        )}
      </div>

      <div className="p-5">
        {tableMissing ? (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-[12px] text-fg2">
            <strong className="text-warning">⚠ Table non disponible.</strong> La table <code className="font-mono">engagements</code> n'existe pas encore sur le projet Supabase.
            Appliquez la migration <code className="font-mono">supabase/migrations/20260915210000_engagements_hors_bilan.sql</code> (Supabase Dashboard → SQL Editor, ou <code className="font-mono">supabase db push</code>) pour activer ce module.
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <div className="bg-bg2 border border-border rounded-lg p-3">
                <div className="text-[10px] text-fg3 uppercase font-mono">Engagements actifs</div>
                <div className="text-lg font-bold font-mono">{items.filter(i => i.statut === 'actif').length}</div>
              </div>
              <div className="bg-bg2 border border-border rounded-lg p-3">
                <div className="text-[10px] text-fg3 uppercase font-mono">Total engagements actifs</div>
                <div className="text-lg font-bold font-mono">{fmt(totalActif)}</div>
              </div>
              <div className="bg-bg2 border border-border rounded-lg p-3">
                <div className="text-[10px] text-fg3 uppercase font-mono">Extournés</div>
                <div className="text-lg font-bold font-mono text-fg3">{items.filter(i => i.statut === 'extourne').length}</div>
              </div>
            </div>

            {showForm && (
              <div className="bg-bg2 border border-border rounded-lg p-4 mb-4">
                <div className="text-xs font-semibold mb-3">Nouvel engagement hors bilan</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <label className="text-[11px] text-fg2 flex flex-col gap-1">
                    Type
                    <select value={form.type_engagement} onChange={e => setForm({ ...form, type_engagement: e.target.value as TypeEngagement })}
                      className="bg-bg1 border border-border rounded px-2 py-1.5 text-[11px]">
                      {TYPES.map(t => <option key={t.value} value={t.value}>{t.label} ({t.compte})</option>)}
                    </select>
                  </label>
                  <label className="text-[11px] text-fg2 flex flex-col gap-1">
                    Libellé
                    <input value={form.libelle} onChange={e => setForm({ ...form, libelle: e.target.value })}
                      placeholder="Objet de l'engagement"
                      className="bg-bg1 border border-border rounded px-2 py-1.5 text-[11px]" />
                  </label>
                  <label className="text-[11px] text-fg2 flex flex-col gap-1">
                    Tiers (bénéficiaire/donnateur)
                    <input value={form.tiers} onChange={e => setForm({ ...form, tiers: e.target.value })}
                      placeholder="Banque, fournisseur…"
                      className="bg-bg1 border border-border rounded px-2 py-1.5 text-[11px]" />
                  </label>
                  <label className="text-[11px] text-fg2 flex flex-col gap-1">
                    Montant
                    <input type="number" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })}
                      placeholder="0"
                      className="bg-bg1 border border-border rounded px-2 py-1.5 text-[11px] font-mono" />
                  </label>
                  <label className="text-[11px] text-fg2 flex flex-col gap-1">
                    Devise
                    <input value={form.devise} onChange={e => setForm({ ...form, devise: e.target.value })}
                      className="bg-bg1 border border-border rounded px-2 py-1.5 text-[11px]" />
                  </label>
                  <label className="text-[11px] text-fg2 flex flex-col gap-1">
                    Date début
                    <input type="date" value={form.date_debut} onChange={e => setForm({ ...form, date_debut: e.target.value })}
                      className="bg-bg1 border border-border rounded px-2 py-1.5 text-[11px]" />
                  </label>
                  <label className="text-[11px] text-fg2 flex flex-col gap-1">
                    Date échéance
                    <input type="date" value={form.date_echeance} onChange={e => setForm({ ...form, date_echeance: e.target.value })}
                      className="bg-bg1 border border-border rounded px-2 py-1.5 text-[11px]" />
                  </label>
                  <label className="text-[11px] text-fg2 flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
                    Notes
                    <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                      placeholder="Référence contrat…"
                      className="bg-bg1 border border-border rounded px-2 py-1.5 text-[11px]" />
                  </label>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={handleAdd} className="px-4 py-1.5 rounded text-[11px] font-bold bg-success text-white hover:bg-success/90">Enregistrer</button>
                  <button onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded text-[11px] border border-border text-fg2">Annuler</button>
                </div>
              </div>
            )}

            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['Compte', 'Type', 'Libellé', 'Tiers', 'Montant', 'Devise', 'Échéance', 'Statut', 'Actions'].map(h => (
                      <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(i => (
                    <tr key={i.id} className={`hover:bg-[rgba(56,189,248,.02)] ${i.statut === 'extourne' ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-1.5 text-[11px] font-mono font-bold text-accent border-b border-border/50">{i.compte_engagement}</td>
                      <td className="px-3 py-1.5 text-[11px] border-b border-border/50">{TYPES.find(t => t.value === i.type_engagement)?.label || i.type_engagement}</td>
                      <td className="px-3 py-1.5 text-[11px] border-b border-border/50">{i.libelle}</td>
                      <td className="px-3 py-1.5 text-[11px] text-fg3 border-b border-border/50">{i.tiers || '—'}</td>
                      <td className="px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50">{fmt(i.montant)}</td>
                      <td className="px-3 py-1.5 text-[11px] font-mono text-fg3 border-b border-border/50">{i.devise}</td>
                      <td className="px-3 py-1.5 text-[11px] font-mono text-fg3 border-b border-border/50">{i.date_echeance || '—'}</td>
                      <td className="px-3 py-1.5 border-b border-border/50">
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${i.statut === 'actif' ? 'bg-accent/10 text-accent' : 'bg-fg3/10 text-fg3'}`}>
                          {i.statut === 'actif' ? 'Actif' : 'Extourné'}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 border-b border-border/50 flex gap-1">
                        {i.statut === 'actif' && (
                          <button onClick={() => handleExtourne(i.id)} className="text-[10px] px-2 py-0.5 rounded bg-warning/10 text-warning font-bold">Extourner</button>
                        )}
                        <button onClick={() => handleDelete(i.id)} className="text-[10px] px-2 py-0.5 rounded bg-destructive/10 text-destructive font-bold">Suppr.</button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && !loading && !appLoading && (
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-fg3 text-[11px]">Aucun engagement hors bilan enregistré.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-[10px] text-fg3">
              ℹ️ Conformément au SYSCOHADA révisé, ces engagements ne figurent pas au bilan : ils sont uniquement tracés en annexe.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
