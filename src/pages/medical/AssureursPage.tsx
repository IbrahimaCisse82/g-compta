import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/stores/app-store';
import { useUserRole } from '@/hooks/use-user-role';
import { toast } from 'sonner';
import { fmt } from '@/lib/accounting';
import {
  isModuleAbsent, TYPES_ASSUREUR, labelCategorie,
  type Assureur, type ActeMedical, type AssureurTaux, type TypeAssureur,
  db,
} from '@/lib/medical';
import { Field, MedicalStyles, Modal, ModuleAbsent, PageHeader, Stat } from '@/components/medical/MedicalUI';

export default function AssureursPage() {
  const { entreprise } = useApp();
  const { canDelete } = useUserRole();          // admin uniquement
  const estAdmin = canDelete;

  const [assureurs, setAssureurs] = useState<Assureur[]>([]);
  const [actes, setActes] = useState<ActeMedical[]>([]);
  const [taux, setTaux] = useState<AssureurTaux[]>([]);
  const [loading, setLoading] = useState(false);
  const [absent, setAbsent] = useState(false);
  const [selection, setSelection] = useState<string>('');
  const [form, setForm] = useState<Partial<Assureur> | null>(null);

  const load = async () => {
    if (!entreprise) return;
    setLoading(true);
    const [a, ac, t] = await Promise.all([
      db.from('assureurs').select('*').eq('entreprise_id', entreprise.id).order('nom'),
      db.from('actes_medicaux').select('*').eq('entreprise_id', entreprise.id).eq('actif', true).order('code'),
      db.from('assureur_taux').select('*').eq('entreprise_id', entreprise.id),
    ]);
    if (a.error) {
      if (isModuleAbsent(a.error)) setAbsent(true); else toast.error(a.error.message);
      setLoading(false); return;
    }
    setAbsent(false);
    const liste = (a.data || []) as Assureur[];
    setAssureurs(liste);
    setActes((ac.data || []) as ActeMedical[]);
    setTaux((t.data || []) as AssureurTaux[]);
    setSelection(prev => prev || liste[0]?.id || '');
    setLoading(false);
  };

  useEffect(() => { load(); }, [entreprise?.id]);

  const assureur = useMemo(() => assureurs.find(a => a.id === selection) || null, [assureurs, selection]);

  const tauxDe = (acteId: string) =>
    taux.find(t => t.assureur_id === selection && t.acte_id === acteId)?.taux;

  const couvertureMoyenne = useMemo(() => {
    if (!selection || !actes.length) return 0;
    const somme = actes.reduce((s, a) => s + Number(tauxDe(a.id) ?? assureur?.taux_defaut ?? 0), 0);
    return Math.round(somme / actes.length);
  }, [selection, actes, taux, assureur]);

  const saveAssureur = async () => {
    if (!entreprise || !estAdmin || !form) return;
    if (!form.code?.trim() || !form.nom?.trim()) { toast.error('Code et nom obligatoires'); return; }
    const payload = {
      entreprise_id: entreprise.id,
      code: form.code.trim(), nom: form.nom.trim(),
      type: form.type || 'mutuelle',
      taux_defaut: Number(form.taux_defaut) || 0,
      telephone: form.telephone || null, email: form.email || null, adresse: form.adresse || null,
      actif: form.actif !== false,
    };
    const res = form.id
      ? await db.from('assureurs').update(payload).eq('id', form.id)
      : await db.from('assureurs').insert(payload).select().single();
    if (res.error) { toast.error(res.error.message); return; }
    toast.success('Assureur enregistré');
    if (!form.id && res.data) setSelection((res.data as Assureur).id);
    setForm(null); load();
  };

  const supprimerAssureur = async (a: Assureur) => {
    if (!estAdmin || !confirm(`Supprimer ${a.nom} et tous ses taux ?`)) return;
    const { error } = await db.from('assureurs').delete().eq('id', a.id);
    if (error) toast.error(error.message); else { toast.success('Assureur supprimé'); setSelection(''); load(); }
  };

  /** Enregistre le taux d'un acte (ou le supprime si vide → retour au taux de repli). */
  const enregistrerTaux = async (acteId: string, valeur: string) => {
    if (!entreprise || !selection || !estAdmin) return;
    const existant = taux.find(t => t.assureur_id === selection && t.acte_id === acteId);
    if (valeur.trim() === '') {
      if (!existant) return;
      const { error } = await db.from('assureur_taux').delete().eq('id', existant.id);
      if (error) toast.error(error.message); else load();
      return;
    }
    const montant = Math.max(0, Math.min(100, Number(valeur) || 0));
    const { error } = await db.from('assureur_taux')
      .upsert({ entreprise_id: entreprise.id, assureur_id: selection, acte_id: acteId, taux: montant },
        { onConflict: 'assureur_id,acte_id' });
    if (error) toast.error(error.message); else load();
  };

  if (!entreprise) return null;

  return (
    <div>
      <MedicalStyles />
      <PageHeader icon="🛡️" title="Assureurs & Conventions">
        <span className="text-[10px] text-fg3 font-mono">{assureurs.length} assureur(s)</span>
      </PageHeader>

      {absent ? <ModuleAbsent /> : (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Assureurs" value={String(assureurs.length)} />
            <Stat label="Actifs" value={String(assureurs.filter(a => a.actif).length)} />
            <Stat label="Actes tarifés" value={String(taux.length)} />
            <Stat label="Couverture moyenne" value={`${couvertureMoyenne}%`} />
          </div>

          {!estAdmin && (
            <div className="bg-bg2 border border-border rounded-lg p-3 text-xs text-fg2">
              Seul un administrateur peut paramétrer les conventions. Vous consultez les taux en lecture seule.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
            {/* Liste des assureurs */}
            <div className="bg-bg2 border border-border rounded-lg">
              <div className="flex justify-between items-center p-3 border-b border-border">
                <span className="text-xs font-semibold">Conventions</span>
                {estAdmin && (
                  <button onClick={() => setForm({ type: 'mutuelle', taux_defaut: 0, actif: true })}
                    className="px-3 py-1 rounded text-xs bg-primary text-primary-foreground">+ Assureur</button>
                )}
              </div>
              <div className="divide-y divide-border">
                {loading && <div className="p-4 text-xs text-fg3">Chargement…</div>}
                {!loading && !assureurs.length && <div className="p-4 text-xs text-fg3">Aucun assureur configuré</div>}
                {assureurs.map(a => (
                  <button key={a.id} onClick={() => setSelection(a.id)}
                    className={`w-full text-left p-3 hover:bg-bg3 transition-colors ${selection === a.id ? 'bg-primary/5 border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold truncate">{a.nom}</span>
                      <span className="text-[10px] font-mono text-fg3">{a.code}</span>
                    </div>
                    <div className="text-[10px] text-fg3 mt-1">
                      {TYPES_ASSUREUR.find(t => t.value === a.type)?.label} · repli {a.taux_defaut}%
                      {!a.actif && ' · inactif'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Taux par acte */}
            <div className="bg-bg2 border border-border rounded-lg">
              {!assureur ? (
                <div className="p-6 text-xs text-fg3">Sélectionnez un assureur pour paramétrer ses taux.</div>
              ) : (
                <>
                  <div className="flex flex-wrap justify-between items-center gap-2 p-3 border-b border-border">
                    <div>
                      <div className="text-xs font-semibold">{assureur.nom}</div>
                      <div className="text-[10px] text-fg3">
                        Taux de repli {assureur.taux_defaut}% · {actes.length} acte(s) actif(s)
                      </div>
                    </div>
                    {estAdmin && (
                      <div className="flex gap-1">
                        <button onClick={() => setForm(assureur)} className="text-[10px] px-2 py-1 rounded border border-border">✏️ Modifier</button>
                        <button onClick={() => supprimerAssureur(assureur)} className="text-[10px] px-2 py-1 rounded border border-destructive/40 text-destructive">🗑</button>
                      </div>
                    )}
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-bg3 text-fg3">
                      <tr>
                        <th className="text-left p-2">Code</th>
                        <th className="text-left p-2">Acte</th>
                        <th className="text-left p-2">Catégorie</th>
                        <th className="text-right p-2">Tarif</th>
                        <th className="text-right p-2 w-32">Taux couvert. (%)</th>
                        <th className="text-right p-2">Part organisme</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!actes.length && <tr><td colSpan={6} className="p-4 text-center text-fg3">Aucun acte actif au catalogue</td></tr>}
                      {actes.map(a => {
                        const t = tauxDe(a.id);
                        const applique = Number(t ?? assureur.taux_defaut ?? 0);
                        return (
                          <tr key={a.id} className="border-t border-border">
                            <td className="p-2 font-mono">{a.code}</td>
                            <td className="p-2">{a.libelle}</td>
                            <td className="p-2 text-fg2">{labelCategorie(a.categorie)}</td>
                            <td className="p-2 text-right font-mono">{fmt(a.tarif)}</td>
                            <td className="p-2 text-right">
                              <input type="number" min={0} max={100} disabled={!estAdmin}
                                className="med-inp text-right" placeholder={String(assureur.taux_defaut)}
                                defaultValue={t ?? ''} key={`${selection}-${a.id}-${t ?? 'defaut'}`}
                                onBlur={e => enregistrerTaux(a.id, e.target.value)} />
                            </td>
                            <td className="p-2 text-right font-mono text-fg2">
                              {fmt(Math.round(Number(a.tarif || 0) * applique / 100))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="p-3 text-[10px] text-fg3 border-t border-border">
                    Laissez vide pour appliquer le taux de repli ({assureur.taux_defaut}%). La saisie est enregistrée à la sortie du champ.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {form && (
        <Modal title={form.id ? `Modifier ${form.nom}` : 'Nouvel assureur'} onClose={() => setForm(null)}>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Field label="Code *"><input className="med-inp" value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Nom *"><input className="med-inp" value={form.nom || ''} onChange={e => setForm({ ...form, nom: e.target.value })} /></Field>
            <Field label="Type">
              <select className="med-inp" value={form.type || 'mutuelle'} onChange={e => setForm({ ...form, type: e.target.value as TypeAssureur })}>
                {TYPES_ASSUREUR.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Taux de repli (%)">
              <input type="number" min={0} max={100} className="med-inp" value={form.taux_defaut ?? 0}
                onChange={e => setForm({ ...form, taux_defaut: Number(e.target.value) })} />
            </Field>
            <Field label="Téléphone"><input className="med-inp" value={form.telephone || ''} onChange={e => setForm({ ...form, telephone: e.target.value })} /></Field>
            <Field label="Email"><input className="med-inp" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="Adresse">
              <textarea rows={2} className="med-inp" value={form.adresse || ''} onChange={e => setForm({ ...form, adresse: e.target.value })} /></Field></div>
            <Field label="État">
              <select className="med-inp" value={form.actif === false ? 'inactif' : 'actif'} onChange={e => setForm({ ...form, actif: e.target.value === 'actif' })}>
                <option value="actif">Actif</option><option value="inactif">Inactif</option>
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setForm(null)} className="px-3 py-1.5 rounded text-xs border border-border">Annuler</button>
            <button onClick={saveAssureur} className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground">Enregistrer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
