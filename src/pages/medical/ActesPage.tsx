import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/stores/app-store';
import { useUserRole } from '@/hooks/use-user-role';
import { toast } from 'sonner';
import { fmt } from '@/lib/accounting';
import {
  isModuleAbsent, labelCategorie, CATEGORIES_ACTE,
  type ActeMedical, type CategorieActe,
  db,
} from '@/lib/medical';
import { Field, MedicalStyles, Modal, ModuleAbsent, PageHeader, Stat } from '@/components/medical/MedicalUI';

export default function ActesPage() {
  const { entreprise } = useApp();
  const { canWrite, canDelete } = useUserRole();

  const [actes, setActes] = useState<ActeMedical[]>([]);
  const [loading, setLoading] = useState(false);
  const [absent, setAbsent] = useState(false);
  const [search, setSearch] = useState('');
  const [filtre, setFiltre] = useState<'toutes' | CategorieActe>('toutes');
  const [form, setForm] = useState<Partial<ActeMedical> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!entreprise) return;
    setLoading(true);
    const { data, error } = await db.from('actes_medicaux').select('*')
      .eq('entreprise_id', entreprise.id).order('code');
    if (error) {
      if (isModuleAbsent(error)) setAbsent(true); else toast.error(error.message);
      setLoading(false); return;
    }
    setAbsent(false);
    setActes((data || []) as ActeMedical[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [entreprise?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return actes.filter(a =>
      (filtre === 'toutes' || a.categorie === filtre) &&
      (!q || a.code.toLowerCase().includes(q) || a.libelle.toLowerCase().includes(q)));
  }, [actes, search, filtre]);

  const save = async () => {
    if (!entreprise || !canWrite || !form) return;
    if (!form.code?.trim() || !form.libelle?.trim()) { toast.error('Code et libellé obligatoires'); return; }
    const payload = {
      entreprise_id: entreprise.id,
      code: form.code.trim(),
      libelle: form.libelle.trim(),
      categorie: form.categorie || 'analyse',
      tarif: Number(form.tarif) || 0,
      actif: form.actif !== false,
    };
    const res = form.id
      ? await db.from('actes_medicaux').update(payload).eq('id', form.id)
      : await db.from('actes_medicaux').insert(payload);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success('Acte enregistré'); setForm(null); load();
  };

  const basculerActif = async (a: ActeMedical) => {
    if (!canWrite) return;
    const { error } = await db.from('actes_medicaux').update({ actif: !a.actif }).eq('id', a.id);
    if (error) toast.error(error.message); else load();
  };

  const supprimer = async (a: ActeMedical) => {
    if (!canDelete || !confirm(`Supprimer l'acte ${a.code} — ${a.libelle} ?`)) return;
    const { error } = await db.from('actes_medicaux').delete().eq('id', a.id);
    if (error) toast.error(error.message); else { toast.success('Acte supprimé'); load(); }
  };

  // ─── Import CSV : code;libelle;categorie;tarif ────────────
  const importerCsv = async (file: File) => {
    if (!entreprise || !canWrite) return;
    const texte = await file.text();
    const lignes = texte.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const aInserer: Record<string, unknown>[] = [];
    for (const ligne of lignes) {
      const cols = ligne.split(/[;,\t]/).map(c => c.trim());
      if (cols.length < 2) continue;
      if (/^code$/i.test(cols[0])) continue; // en-tête
      const categorie = (CATEGORIES_ACTE.find(c => c.value === cols[2])?.value) || 'analyse';
      aInserer.push({
        entreprise_id: entreprise.id, code: cols[0], libelle: cols[1],
        categorie, tarif: Number((cols[3] || '0').replace(/\s/g, '')) || 0, actif: true,
      });
    }
    if (!aInserer.length) { toast.error('Aucune ligne valide (format attendu : code;libellé;catégorie;tarif)'); return; }
    const { error } = await db.from('actes_medicaux').upsert(aInserer, { onConflict: 'entreprise_id,code' });
    if (error) { toast.error(error.message); return; }
    toast.success(`${aInserer.length} acte(s) importé(s)`);
    if (fileRef.current) fileRef.current.value = '';
    load();
  };

  const stats = useMemo(() => ({
    total: actes.length,
    actifs: actes.filter(a => a.actif).length,
    analyses: actes.filter(a => a.categorie === 'analyse').length,
    panier: actes.length ? Math.round(actes.reduce((s, a) => s + Number(a.tarif || 0), 0) / actes.length) : 0,
  }), [actes]);

  if (!entreprise) return null;

  return (
    <div>
      <MedicalStyles />
      <PageHeader icon="🧪" title="Actes & Tarifs">
        <span className="text-[10px] text-fg3 font-mono">{stats.actifs} actif(s)</span>
      </PageHeader>

      {absent ? <ModuleAbsent /> : (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Actes au catalogue" value={String(stats.total)} />
            <Stat label="Actes actifs" value={String(stats.actifs)} />
            <Stat label="Analyses" value={String(stats.analyses)} />
            <Stat label="Tarif moyen" value={fmt(stats.panier)} />
          </div>

          <div className="bg-bg2 border border-border rounded-lg">
            <div className="flex flex-wrap gap-2 justify-between items-center p-3 border-b border-border">
              <div className="flex flex-wrap gap-2 items-center">
                <input className="med-inp max-w-xs" placeholder="Rechercher un code ou un libellé…"
                  value={search} onChange={e => setSearch(e.target.value)} />
                <select className="med-inp w-auto" value={filtre} onChange={e => setFiltre(e.target.value as 'toutes' | CategorieActe)}>
                  <option value="toutes">Toutes catégories</option>
                  {CATEGORIES_ACTE.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              {canWrite && (
                <div className="flex gap-2 items-center">
                  <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) importerCsv(f); }} />
                  <button onClick={() => fileRef.current?.click()}
                    className="px-3 py-1 rounded text-xs border border-border text-fg2 hover:bg-bg3"
                    title="Fichier CSV : code;libellé;catégorie;tarif">📥 Importer CSV</button>
                  <button onClick={() => setForm({ categorie: 'analyse', tarif: 0, actif: true })}
                    className="px-3 py-1 rounded text-xs bg-primary text-primary-foreground">+ Nouvel acte</button>
                </div>
              )}
            </div>

            <table className="w-full text-xs">
              <thead className="bg-bg3 text-fg3">
                <tr>
                  <th className="text-left p-2">Code</th>
                  <th className="text-left p-2">Libellé</th>
                  <th className="text-left p-2">Catégorie</th>
                  <th className="text-right p-2">Tarif</th>
                  <th className="text-center p-2">État</th>
                  <th className="text-right p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} className="text-center p-6 text-fg3">Chargement…</td></tr>}
                {!loading && !filtered.length && (
                  <tr><td colSpan={6} className="text-center p-6 text-fg3">
                    {actes.length ? 'Aucun acte ne correspond au filtre' : 'Catalogue vide — créez ou importez vos actes'}
                  </td></tr>
                )}
                {filtered.map(a => (
                  <tr key={a.id} className="border-t border-border hover:bg-bg3/50">
                    <td className="p-2 font-mono">{a.code}</td>
                    <td className="p-2">{a.libelle}</td>
                    <td className="p-2 text-fg2">{labelCategorie(a.categorie)}</td>
                    <td className="p-2 text-right font-mono">{fmt(a.tarif)}</td>
                    <td className="p-2 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded ${a.actif ? 'bg-accent/15 text-accent' : 'bg-bg3 text-fg3'}`}>
                        {a.actif ? 'actif' : 'inactif'}
                      </span>
                    </td>
                    <td className="p-2 text-right space-x-1 whitespace-nowrap">
                      {canWrite && <button onClick={() => basculerActif(a)} className="text-[10px] px-2 py-1 rounded border border-border" title="Activer / désactiver">{a.actif ? '⏸' : '▶'}</button>}
                      {canWrite && <button onClick={() => setForm(a)} className="text-[10px] px-2 py-1 rounded border border-border">✏️</button>}
                      {canDelete && <button onClick={() => supprimer(a)} className="text-[10px] px-2 py-1 rounded border border-destructive/40 text-destructive">🗑</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {form && (
        <Modal title={form.id ? `Modifier ${form.code}` : 'Nouvel acte'} onClose={() => setForm(null)}>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Field label="Code *"><input className="med-inp" value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Catégorie">
              <select className="med-inp" value={form.categorie || 'analyse'} onChange={e => setForm({ ...form, categorie: e.target.value as CategorieActe })}>
                {CATEGORIES_ACTE.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <div className="col-span-2"><Field label="Libellé *">
              <input className="med-inp" value={form.libelle || ''} onChange={e => setForm({ ...form, libelle: e.target.value })} /></Field></div>
            <Field label="Tarif"><input type="number" className="med-inp" value={form.tarif ?? 0} onChange={e => setForm({ ...form, tarif: Number(e.target.value) })} /></Field>
            <Field label="État">
              <select className="med-inp" value={form.actif === false ? 'inactif' : 'actif'} onChange={e => setForm({ ...form, actif: e.target.value === 'actif' })}>
                <option value="actif">Actif</option><option value="inactif">Inactif</option>
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setForm(null)} className="px-3 py-1.5 rounded text-xs border border-border">Annuler</button>
            <button onClick={save} className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground">Enregistrer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
