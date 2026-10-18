import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/stores/app-store';
import { useUserRole } from '@/hooks/use-user-role';
import { toast } from 'sonner';
import { fmt } from '@/lib/accounting';
import {
  isModuleAbsent, statutAffiche, recalculerLigne, totauxFacture, tauxPourActe, todayISO,
  type Patient, type Assureur, type ActeMedical, type AssureurTaux, type PatientAssurance,
  type FactureMedicale, type FactureMedicaleLigne,
  db,
} from '@/lib/medical';
import { Field, MedicalStyles, Modal, ModuleAbsent, PageHeader, Stat, StatutBadge } from '@/components/medical/MedicalUI';

const emptyLigne = (i = 0): FactureMedicaleLigne => ({
  designation: '', quantite: 1, prix_unitaire: 0, remise_pct: 0, montant_ht: 0,
  taux_couverture: 0, part_organisme: 0, part_patient: 0, ordre: i,
});

export default function FacturationMedicalePage() {
  const { entreprise, exercice } = useApp();
  const { canWrite, canDelete } = useUserRole();

  const [factures, setFactures] = useState<FactureMedicale[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [actes, setActes] = useState<ActeMedical[]>([]);
  const [assureurs, setAssureurs] = useState<Assureur[]>([]);
  const [taux, setTaux] = useState<AssureurTaux[]>([]);
  const [assurances, setAssurances] = useState<PatientAssurance[]>([]);
  const [encaissements, setEncaissements] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [absent, setAbsent] = useState(false);
  const [filtreStatut, setFiltreStatut] = useState<'toutes' | 'ouvertes' | 'reglees'>('toutes');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<FactureMedicale>>({});
  const [lignes, setLignes] = useState<FactureMedicaleLigne[]>([emptyLigne()]);

  const [viewFact, setViewFact] = useState<FactureMedicale | null>(null);
  const [viewLignes, setViewLignes] = useState<FactureMedicaleLigne[]>([]);

  const load = async () => {
    if (!entreprise) return;
    setLoading(true);
    const [f, p, a, as, t, pa, e] = await Promise.all([
      db.from('factures_medicales').select('*').eq('entreprise_id', entreprise.id).order('date_facture', { ascending: false }),
      db.from('patients').select('*').eq('entreprise_id', entreprise.id).order('nom'),
      db.from('actes_medicaux').select('*').eq('entreprise_id', entreprise.id).eq('actif', true).order('code'),
      db.from('assureurs').select('*').eq('entreprise_id', entreprise.id).order('nom'),
      db.from('assureur_taux').select('*').eq('entreprise_id', entreprise.id),
      db.from('patient_assurances').select('*').eq('entreprise_id', entreprise.id),
      db.from('encaissements_medicaux').select('facture_id, montant').eq('entreprise_id', entreprise.id),
    ]);
    if (f.error) {
      if (isModuleAbsent(f.error)) setAbsent(true); else toast.error(f.error.message);
      setLoading(false); return;
    }
    setAbsent(false);
    setFactures((f.data || []) as FactureMedicale[]);
    setPatients((p.data || []) as Patient[]);
    setActes((a.data || []) as ActeMedical[]);
    setAssureurs((as.data || []) as Assureur[]);
    setTaux((t.data || []) as AssureurTaux[]);
    setAssurances((pa.data || []) as PatientAssurance[]);
    const parFacture: Record<string, number> = {};
    for (const row of (e.data || []) as { facture_id: string; montant: number }[]) {
      parFacture[row.facture_id] = (parFacture[row.facture_id] || 0) + Number(row.montant);
    }
    setEncaissements(parFacture);
    setLoading(false);
  };

  useEffect(() => { load(); }, [entreprise?.id]);

  const patient = (id: string) => patients.find(p => p.id === id);
  const assureur = (id?: string | null) => assureurs.find(a => a.id === id) || null;
  const nomPatient = (id: string) => {
    const p = patient(id);
    return p ? [p.nom, p.prenom].filter(Boolean).join(' ') : '—';
  };

  const ouvertes = useMemo(
    () => factures.filter(f => statutAffiche(f, encaissements[f.id] || 0) !== 'reglee'),
    [factures, encaissements]);

  const filtered = useMemo(() => {
    if (filtreStatut === 'ouvertes') return ouvertes;
    if (filtreStatut === 'reglees') return factures.filter(f => statutAffiche(f, encaissements[f.id] || 0) === 'reglee');
    return factures;
  }, [factures, filtreStatut, ouvertes, encaissements]);

  const stats = useMemo(() => {
    const total = factures.reduce((s, f) => s + Number(f.total_ht || 0), 0);
    const partOrganisme = factures.reduce((s, f) => s + Number(f.total_part_organisme || 0), 0);
    const encaisse = Object.values(encaissements).reduce((s, v) => s + v, 0);
    const restePatient = factures.reduce((s, f) => s + Number(f.total_part_patient || 0), 0)
      - Object.entries(encaissements).reduce((s, [fid, v]) => {
        const f = factures.find(x => x.id === fid);
        return s + (f ? Math.min(v, Number(f.total_part_patient || 0)) : 0);
      }, 0);
    return { total, partOrganisme, encaisse, restePatient, nb: factures.length };
  }, [factures, encaissements]);

  // ─── Saisie ────────────────────────────────────────────────
  const nextNumero = () => {
    const prefix = `FM-${new Date().getFullYear()}-`;
    const max = factures.filter(f => f.numero.startsWith(prefix))
      .map(f => parseInt(f.numero.slice(prefix.length)) || 0)
      .reduce((m, n) => Math.max(m, n), 0);
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  };

  const appliquerTaux = (ls: FactureMedicaleLigne[], assureurId?: string | null): FactureMedicaleLigne[] => {
    const asr = assureur(assureurId);
    return ls.map(l => {
      const tauxLigne = l.acte_id ? tauxPourActe(asr, l.acte_id, taux) : Number(l.taux_couverture || 0);
      return recalculerLigne({ ...l, taux_couverture: tauxLigne });
    });
  };

  const openNew = () => {
    if (!patients.length) { toast.error('Créez d\'abord un patient'); return; }
    const p = patients[0];
    const premiereAssurance = assurances.filter(a => a.patient_id === p.id).sort((a, b) => a.ordre - b.ordre)[0];
    const base: Partial<FactureMedicale> = {
      numero: nextNumero(), patient_id: p.id,
      assureur_id: premiereAssurance?.assureur_id || null,
      date_facture: todayISO(),
      date_echeance: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      statut: 'a_encaisser',
    };
    setForm(base);
    setLignes([emptyLigne()]);
    setShowForm(true);
  };

  const changerPatient = (patientId: string) => {
    const premiere = assurances.filter(a => a.patient_id === patientId).sort((a, b) => a.ordre - b.ordre)[0];
    setForm(f => ({ ...f, patient_id: patientId, assureur_id: premiere?.assureur_id || null }));
    setLignes(ls => appliquerTaux(ls, premiere?.assureur_id || null));
  };

  const majLigne = (i: number, patch: Partial<FactureMedicaleLigne>) => {
    setLignes(ls => {
      const n = [...ls];
      n[i] = recalculerLigne({ ...n[i], ...patch });
      return n;
    });
  };

  const choisirActe = (i: number, acteId: string) => {
    const a = actes.find(x => x.id === acteId);
    if (!a) { majLigne(i, { acte_id: null }); return; }
    const asr = assureur(form.assureur_id);
    majLigne(i, {
      acte_id: a.id, designation: a.libelle, prix_unitaire: Number(a.tarif),
      taux_couverture: tauxPourActe(asr, a.id, taux),
    });
  };

  const totaux = useMemo(() => totauxFacture(lignes), [lignes]);

  const saveFacture = async () => {
    if (!entreprise || !exercice || !canWrite) return;
    if (!form.patient_id) { toast.error('Sélectionnez un patient'); return; }
    if (!lignes.some(l => l.designation)) { toast.error('Ajoutez au moins un acte'); return; }
    const valides = lignes.filter(l => l.designation);

    const payload = {
      entreprise_id: entreprise.id, exercice_id: exercice.id,
      patient_id: form.patient_id, assureur_id: form.assureur_id || null,
      numero: form.numero || nextNumero(),
      date_facture: form.date_facture || todayISO(),
      date_echeance: form.date_echeance || null,
      prescripteur: form.prescripteur || null, objet: form.objet || null,
      total_ht: totaux.ht,
      total_part_patient: totaux.partPatient,
      total_part_organisme: totaux.partOrganisme,
      statut: form.statut || 'a_encaisser',
      notes: form.notes || null,
    };

    let factureId = form.id;
    if (factureId) {
      const r = await db.from('factures_medicales').update(payload).eq('id', factureId);
      if (r.error) { toast.error(r.error.message); return; }
      await db.from('factures_medicales_lignes').delete().eq('facture_id', factureId);
    } else {
      const r = await db.from('factures_medicales').insert(payload).select().single();
      if (r.error) { toast.error(r.error.message); return; }
      factureId = (r.data as FactureMedicale).id;
    }

    const lignesPayload = valides.map((l, i) => ({
      entreprise_id: entreprise.id, facture_id: factureId,
      acte_id: l.acte_id || null, designation: l.designation,
      quantite: l.quantite, prix_unitaire: l.prix_unitaire, remise_pct: l.remise_pct,
      montant_ht: l.montant_ht, taux_couverture: l.taux_couverture,
      part_organisme: l.part_organisme, part_patient: l.part_patient, ordre: i,
    }));
    const r2 = await db.from('factures_medicales_lignes').insert(lignesPayload);
    if (r2.error) { toast.error(r2.error.message); return; }

    toast.success('Facture enregistrée');
    setShowForm(false); setForm({}); setLignes([emptyLigne()]); load();
  };

  const editFacture = async (f: FactureMedicale) => {
    setForm(f);
    const { data } = await db.from('factures_medicales_lignes').select('*')
      .eq('facture_id', f.id).order('ordre');
    const ls = ((data || []) as FactureMedicaleLigne[]).map(l => ({ ...l, quantite: Number(l.quantite), prix_unitaire: Number(l.prix_unitaire) }));
    setLignes(ls.length ? ls : [emptyLigne()]);
    setShowForm(true);
  };

  const supprimerFacture = async (f: FactureMedicale) => {
    if (!canDelete || !confirm(`Supprimer la facture ${f.numero} ?`)) return;
    const { error } = await db.from('factures_medicales').delete().eq('id', f.id);
    if (error) toast.error(error.message); else { toast.success('Facture supprimée'); load(); }
  };

  const imprimer = async (f: FactureMedicale) => {
    const { data } = await db.from('factures_medicales_lignes').select('*')
      .eq('facture_id', f.id).order('ordre');
    setViewFact(f); setViewLignes((data || []) as FactureMedicaleLigne[]);
    setTimeout(() => window.print(), 250);
  };

  if (!entreprise) return null;

  return (
    <div>
      <MedicalStyles />
      <PageHeader icon="🧾" title="Facturation médicale">
        <div className="flex items-center gap-1">
          {([['toutes', 'Toutes'], ['ouvertes', 'Ouvertes'], ['reglees', 'Réglées']] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setFiltreStatut(k)}
              className={`px-3 py-1 rounded-md text-xs ${filtreStatut === k ? 'bg-primary text-primary-foreground' : 'border border-border text-fg2'}`}>{lbl}</button>
          ))}
        </div>
      </PageHeader>

      {absent ? <ModuleAbsent /> : (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Factures" value={String(stats.nb)} />
            <Stat label="Total facturé" value={fmt(stats.total)} />
            <Stat label="Part organismes" value={fmt(stats.partOrganisme)} tone="text-purple" />
            <Stat label="Reste à charge patient" value={fmt(stats.restePatient)} tone="text-primary" />
          </div>

          <div className="bg-bg2 border border-border rounded-lg">
            <div className="flex justify-between items-center p-3 border-b border-border">
              <span className="text-xs font-semibold">Factures médicales</span>
              {canWrite && (
                <button onClick={openNew} className="px-3 py-1 rounded text-xs bg-primary text-primary-foreground">+ Nouvelle facture</button>
              )}
            </div>
            <table className="w-full text-xs">
              <thead className="bg-bg3 text-fg3">
                <tr>
                  <th className="text-left p-2">N°</th>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Patient</th>
                  <th className="text-left p-2">Assureur</th>
                  <th className="text-right p-2">Total</th>
                  <th className="text-right p-2">Part patient</th>
                  <th className="text-right p-2">Part organisme</th>
                  <th className="text-center p-2">Statut</th>
                  <th className="text-right p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={9} className="text-center p-6 text-fg3">Chargement…</td></tr>}
                {!loading && !filtered.length && (
                  <tr><td colSpan={9} className="text-center p-6 text-fg3">
                    {factures.length ? 'Aucune facture dans ce filtre' : 'Aucune facture médicale émise'}
                  </td></tr>
                )}
                {filtered.map(f => {
                  const st = statutAffiche(f, encaissements[f.id] || 0);
                  const modifiable = !encaissements[f.id];
                  return (
                    <tr key={f.id} className="border-t border-border hover:bg-bg3/50">
                      <td className="p-2 font-mono">{f.numero}</td>
                      <td className="p-2 font-mono text-[10px]">{f.date_facture}</td>
                      <td className="p-2 font-semibold">{nomPatient(f.patient_id)}</td>
                      <td className="p-2 text-fg2">{assureur(f.assureur_id)?.nom || '—'}</td>
                      <td className="p-2 text-right font-mono">{fmt(f.total_ht)}</td>
                      <td className="p-2 text-right font-mono">{fmt(f.total_part_patient)}</td>
                      <td className="p-2 text-right font-mono text-purple">{fmt(f.total_part_organisme)}</td>
                      <td className="p-2 text-center"><StatutBadge statut={st} /></td>
                      <td className="p-2 text-right space-x-1 whitespace-nowrap">
                        <button onClick={() => imprimer(f)} className="text-[10px] px-2 py-1 rounded border border-border" title="Aperçu / impression">🖨</button>
                        {canWrite && modifiable && <button onClick={() => editFacture(f)} className="text-[10px] px-2 py-1 rounded border border-border">✏️</button>}
                        {canDelete && modifiable && <button onClick={() => supprimerFacture(f)} className="text-[10px] px-2 py-1 rounded border border-destructive/40 text-destructive">🗑</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Saisie facture ─── */}
      {showForm && (
        <Modal title={form.id ? `Facture ${form.numero}` : 'Nouvelle facture médicale'} onClose={() => setShowForm(false)} wide>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-4">
            <Field label="N° facture"><input className="med-inp" value={form.numero || ''} onChange={e => setForm({ ...form, numero: e.target.value })} /></Field>
            <Field label="Date"><input type="date" className="med-inp" value={form.date_facture || ''} onChange={e => setForm({ ...form, date_facture: e.target.value })} /></Field>
            <Field label="Échéance"><input type="date" className="med-inp" value={form.date_echeance || ''} onChange={e => setForm({ ...form, date_echeance: e.target.value })} /></Field>
            <Field label="Patient *">
              <select className="med-inp" value={form.patient_id || ''} onChange={e => changerPatient(e.target.value)}>
                {patients.map(p => <option key={p.id} value={p.id}>{p.numero_dossier} — {[p.nom, p.prenom].filter(Boolean).join(' ')}</option>)}
              </select>
            </Field>
            <Field label="Assureur (tiers payant)">
              <select className="med-inp" value={form.assureur_id || ''}
                onChange={e => { const id = e.target.value || null; setForm(f => ({ ...f, assureur_id: id })); setLignes(ls => appliquerTaux(ls, id)); }}>
                <option value="">Sans tiers payant</option>
                {assureurs.filter(a => a.actif).map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
            </Field>
            <Field label="Prescripteur"><input className="med-inp" value={form.prescripteur || ''} onChange={e => setForm({ ...form, prescripteur: e.target.value })} /></Field>
            <Field label="Statut">
              <select className="med-inp" value={form.statut || 'a_encaisser'} onChange={e => setForm({ ...form, statut: e.target.value as FactureMedicale['statut'] })}>
                <option value="a_encaisser">À encaisser</option>
                <option value="brouillon">Brouillon</option>
              </select>
            </Field>
            <Field label="Objet"><input className="med-inp" value={form.objet || ''} onChange={e => setForm({ ...form, objet: e.target.value })} /></Field>
          </div>

          <div className="border border-border rounded overflow-x-auto">
            <table className="w-full text-xs min-w-[820px]">
              <thead className="bg-bg3 text-fg3">
                <tr>
                  <th className="text-left p-2 w-56">Acte</th>
                  <th className="text-right p-2 w-16">Qté</th>
                  <th className="text-right p-2 w-24">P.U.</th>
                  <th className="text-right p-2 w-16">Rem.%</th>
                  <th className="text-right p-2 w-24">Montant HT</th>
                  <th className="text-right p-2 w-20">Taux %</th>
                  <th className="text-right p-2 w-28">Part organisme</th>
                  <th className="text-right p-2 w-28">Part patient</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-1">
                      <select className="med-inp" value={l.acte_id || ''} onChange={e => choisirActe(i, e.target.value)}>
                        <option value="">— Acte libre —</option>
                        {actes.map(a => <option key={a.id} value={a.id}>{a.code} · {a.libelle} ({fmt(a.tarif)})</option>)}
                      </select>
                      {!l.acte_id && (
                        <input className="med-inp mt-1" placeholder="Désignation libre" value={l.designation}
                          onChange={e => majLigne(i, { designation: e.target.value })} />
                      )}
                    </td>
                    <td className="p-1"><input type="number" step="0.01" className="med-inp text-right" value={l.quantite}
                      onChange={e => majLigne(i, { quantite: Number(e.target.value) })} /></td>
                    <td className="p-1"><input type="number" className="med-inp text-right" value={l.prix_unitaire}
                      onChange={e => majLigne(i, { prix_unitaire: Number(e.target.value) })} /></td>
                    <td className="p-1"><input type="number" step="0.01" className="med-inp text-right" value={l.remise_pct}
                      onChange={e => majLigne(i, { remise_pct: Number(e.target.value) })} /></td>
                    <td className="p-1 text-right font-mono">{fmt(l.montant_ht)}</td>
                    <td className="p-1"><input type="number" min={0} max={100} className="med-inp text-right" value={l.taux_couverture}
                      onChange={e => majLigne(i, { taux_couverture: Number(e.target.value) })} /></td>
                    <td className="p-1 text-right font-mono text-purple">{fmt(l.part_organisme)}</td>
                    <td className="p-1 text-right font-mono text-primary">{fmt(l.part_patient)}</td>
                    <td className="p-1 text-center">
                      <button onClick={() => setLignes(ls => ls.filter((_, j) => j !== i))} className="text-destructive text-[10px]">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setLignes(ls => [...ls, emptyLigne(ls.length)])}
              className="w-full p-1.5 text-[10px] text-primary border-t border-border hover:bg-bg3">+ Ajouter une ligne</button>
          </div>

          <div className="flex justify-end mt-3">
            <div className="w-72 text-xs space-y-1">
              <div className="flex justify-between"><span>Total HT</span><span className="font-mono">{fmt(totaux.ht)}</span></div>
              <div className="flex justify-between"><span>Part organisme</span><span className="font-mono text-purple">{fmt(totaux.partOrganisme)}</span></div>
              <div className="flex justify-between border-t border-border pt-1 font-bold">
                <span>Part patient</span><span className="font-mono text-primary">{fmt(totaux.partPatient)}</span>
              </div>
            </div>
          </div>

          <div className="mt-3"><Field label="Notes">
            <textarea rows={2} className="med-inp" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div>

          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded text-xs border border-border">Annuler</button>
            <button onClick={saveFacture} className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground">Enregistrer</button>
          </div>
        </Modal>
      )}

      {/* ─── Aperçu impression ─── */}
      {viewFact && (() => {
        const p = patient(viewFact.patient_id);
        return (
          <div className="fixed inset-0 bg-white z-[200] overflow-auto p-8 print:p-0 med-print">
            <div className="max-w-[210mm] mx-auto bg-white text-black p-8 font-sans">
              <div className="flex justify-between items-start mb-8 border-b-2 border-black pb-4">
                <div>
                  <h1 className="text-2xl font-bold">{entreprise?.nom}</h1>
                  {entreprise?.adresse && <div className="text-xs mt-1">{entreprise.adresse}</div>}
                  {entreprise?.tel && <div className="text-xs">Tél : {entreprise.tel}</div>}
                  <div className="text-xs mt-1">
                    {entreprise?.ninea && <span>NINEA : {entreprise.ninea}</span>}
                    {entreprise?.ninea && entreprise?.rccm && <span> · </span>}
                    {entreprise?.rccm && <span>RCCM : {entreprise.rccm}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold tracking-wider">FACTURE</div>
                  <div className="text-lg font-mono mt-1">N° {viewFact.numero}</div>
                  <div className="text-xs mt-2">Date : <strong>{viewFact.date_facture}</strong></div>
                  {viewFact.date_echeance && <div className="text-xs">Échéance : <strong>{viewFact.date_echeance}</strong></div>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="border border-black p-3 text-sm">
                  <div className="text-[10px] uppercase tracking-wide font-bold mb-1">Prescripteur</div>
                  <div>{viewFact.prescripteur || '—'}</div>
                </div>
                <div className="border border-black p-3 text-sm">
                  <div className="text-[10px] uppercase tracking-wide font-bold mb-1">Patient</div>
                  <div className="font-bold">{[p?.nom, p?.prenom].filter(Boolean).join(' ')}</div>
                  {p?.numero_dossier && <div className="text-xs">Dossier : {p.numero_dossier}</div>}
                  {p?.telephone && <div className="text-xs">Tél : {p.telephone}</div>}
                  {assureur(viewFact.assureur_id) && (
                    <div className="text-xs mt-1">Assureur : <strong>{assureur(viewFact.assureur_id)?.nom}</strong></div>
                  )}
                </div>
              </div>

              {viewFact.objet && <div className="mb-4 text-sm"><strong>Objet :</strong> {viewFact.objet}</div>}

              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-black text-white">
                    <th className="text-left p-2 border border-black">Désignation</th>
                    <th className="text-right p-2 border border-black w-14">Qté</th>
                    <th className="text-right p-2 border border-black w-24">P.U.</th>
                    <th className="text-right p-2 border border-black w-28">Montant HT</th>
                    <th className="text-right p-2 border border-black w-20">Taux</th>
                    <th className="text-right p-2 border border-black w-28">Part patient</th>
                  </tr>
                </thead>
                <tbody>
                  {viewLignes.map((l, i) => (
                    <tr key={i}>
                      <td className="p-2 border border-black">{l.designation}</td>
                      <td className="p-2 border border-black text-right font-mono">{l.quantite}</td>
                      <td className="p-2 border border-black text-right font-mono">{fmt(l.prix_unitaire)}</td>
                      <td className="p-2 border border-black text-right font-mono">{fmt(l.montant_ht)}</td>
                      <td className="p-2 border border-black text-right font-mono">{l.taux_couverture}%</td>
                      <td className="p-2 border border-black text-right font-mono">{fmt(l.part_patient)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end mt-4">
                <table className="text-sm border-collapse">
                  <tbody>
                    <tr><td className="p-2 border border-black">Total HT</td><td className="p-2 border border-black text-right font-mono w-40">{fmt(viewFact.total_ht)}</td></tr>
                    <tr><td className="p-2 border border-black">Part organisme</td><td className="p-2 border border-black text-right font-mono">{fmt(viewFact.total_part_organisme)}</td></tr>
                    <tr className="bg-black text-white font-bold">
                      <td className="p-2 border border-black">PART PATIENT</td>
                      <td className="p-2 border border-black text-right font-mono">{fmt(viewFact.total_part_patient)} {entreprise?.monnaie || 'FCFA'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {viewFact.notes && <div className="mt-6 text-xs border-t border-black pt-3"><strong>Notes :</strong><br />{viewFact.notes}</div>}

              <div className="mt-8 text-[10px] text-center border-t border-black pt-3">
                {entreprise?.nom} {entreprise?.ninea && `· NINEA ${entreprise.ninea}`} {entreprise?.rccm && `· RCCM ${entreprise.rccm}`}
                <br />Document généré par G-Compta
              </div>

              <div className="mt-6 text-center print:hidden">
                <button onClick={() => setViewFact(null)} className="px-4 py-2 bg-gray-200 text-black rounded mr-2">Fermer</button>
                <button onClick={() => window.print()} className="px-4 py-2 bg-black text-white rounded">🖨 Imprimer</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
