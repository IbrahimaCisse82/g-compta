import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/stores/app-store';
import { useUserRole } from '@/hooks/use-user-role';
import { toast } from 'sonner';
import { fmt } from '@/lib/accounting';
import {
  isModuleAbsent, statutAffiche,
  type Patient, type Assureur, type PatientAssurance, type FactureMedicale,
  db,
} from '@/lib/medical';
import { Field, MedicalStyles, Modal, ModuleAbsent, PageHeader, Stat, StatutBadge } from '@/components/medical/MedicalUI';

export default function PatientsPage() {
  const { entreprise } = useApp();
  const { canWrite, canDelete } = useUserRole();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [assureurs, setAssureurs] = useState<Assureur[]>([]);
  const [assurances, setAssurances] = useState<PatientAssurance[]>([]);
  const [loading, setLoading] = useState(false);
  const [absent, setAbsent] = useState(false);
  const [search, setSearch] = useState('');

  // Formulaire identité
  const [form, setForm] = useState<Partial<Patient> | null>(null);
  const [saving, setSaving] = useState(false);

  // Dossier ouvert
  const [detail, setDetail] = useState<Patient | null>(null);
  const [tab, setTab] = useState<'identite' | 'assurances' | 'historique'>('identite');
  const [factures, setFactures] = useState<FactureMedicale[]>([]);
  const [encaissements, setEncaissements] = useState<Record<string, number>>({});
  const [newAss, setNewAss] = useState({ assureur_id: '', numero_adherent: '' });

  const load = async () => {
    if (!entreprise) return;
    setLoading(true);
    const [p, a, pa] = await Promise.all([
      db.from('patients').select('*').eq('entreprise_id', entreprise.id).order('nom'),
      db.from('assureurs').select('*').eq('entreprise_id', entreprise.id).order('nom'),
      db.from('patient_assurances').select('*').eq('entreprise_id', entreprise.id),
    ]);
    if (p.error) {
      if (isModuleAbsent(p.error)) setAbsent(true); else toast.error(p.error.message);
      setLoading(false); return;
    }
    setAbsent(false);
    setPatients((p.data || []) as Patient[]);
    setAssureurs((a.data || []) as Assureur[]);
    setAssurances((pa.data || []) as PatientAssurance[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [entreprise?.id]);

  const assureur = (id?: string | null) => assureurs.find(a => a.id === id);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(p =>
      [p.nom, p.prenom, p.telephone, p.numero_dossier].some(v => (v || '').toLowerCase().includes(q)));
  }, [patients, search]);

  const assurancesDe = (patientId: string) =>
    assurances.filter(a => a.patient_id === patientId).sort((a, b) => a.ordre - b.ordre);

  // ─── Identité ──────────────────────────────────────────────
  const ouvrirDossier = async (p: Patient) => {
    setDetail(p);
    setTab('identite');
    setNewAss({ assureur_id: assureurs[0]?.id || '', numero_adherent: '' });
    await chargerHistorique(p);
  };

  const chargerHistorique = async (p: Patient) => {
    const { data } = await db.from('factures_medicales').select('*')
      .eq('patient_id', p.id).order('date_facture', { ascending: false });
    const fs = (data || []) as FactureMedicale[];
    setFactures(fs);
    if (!fs.length) { setEncaissements({}); return; }
    const { data: enc } = await db.from('encaissements_medicaux')
      .select('facture_id, montant').in('facture_id', fs.map(f => f.id));
    const parFacture: Record<string, number> = {};
    for (const e of (enc || []) as { facture_id: string; montant: number }[]) {
      parFacture[e.facture_id] = (parFacture[e.facture_id] || 0) + Number(e.montant);
    }
    setEncaissements(parFacture);
  };

  const savePatient = async () => {
    if (!entreprise || !canWrite || !form) return;
    if (!form.nom?.trim()) { toast.error('Le nom est obligatoire'); return; }
    setSaving(true);

    // Compte tiers : chaque patient dispose d'un compte client pour rester comptabilisable.
    let clientId = form.client_id || null;
    const numero = form.numero_dossier || '';
    if (!clientId && numero) {
      const { data, error } = await db.from('clients').insert({
        entreprise_id: entreprise.id, code: numero,
        nom: [form.nom, form.prenom].filter(Boolean).join(' '),
        compte_tiers: '411', actif: true,
        tel: form.telephone || null, email: form.email || null,
      }).select().single();
      if (data) clientId = data.id;
      else if (error) {
        const { data: existant } = await db.from('clients').select('id')
          .eq('entreprise_id', entreprise.id).eq('code', numero).maybeSingle();
        clientId = existant?.id ?? null;
      }
    }

    const payload: Record<string, unknown> = {
      entreprise_id: entreprise.id,
      nom: form.nom.trim(),
      prenom: form.prenom || null,
      date_naissance: form.date_naissance || null,
      sexe: form.sexe || null,
      telephone: form.telephone || null,
      email: form.email || null,
      adresse: form.adresse || null,
      ninea: form.ninea || null,
      rccm: form.rccm || null,
      notes: form.notes || null,
      client_id: clientId,
      actif: true,
    };

    if (form.id) {
      const { error } = await db.from('patients').update(payload).eq('id', form.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const { data: num, error: seqErr } = await db.rpc('fn_prochain_numero_dossier', { _entreprise_id: entreprise.id });
      if (seqErr) { toast.error(seqErr.message); setSaving(false); return; }
      payload.numero_dossier = num as string;
      // Le compte tiers reprend le numéro de dossier généré côté base.
      const { data: cli } = await db.from('clients').insert({
        entreprise_id: entreprise.id, code: num as string,
        nom: [form.nom, form.prenom].filter(Boolean).join(' '),
        compte_tiers: '411', actif: true,
        tel: form.telephone || null, email: form.email || null,
      }).select().single();
      if (cli) payload.client_id = cli.id;
      const { error } = await db.from('patients').insert(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    toast.success('Patient enregistré');
    setForm(null); setSaving(false); load();
  };

  const supprimerPatient = async (p: Patient) => {
    if (!canDelete || !confirm(`Supprimer le dossier de ${p.nom} ?`)) return;
    const { error } = await db.from('patients').delete().eq('id', p.id);
    if (error) toast.error(error.message); else { toast.success('Dossier supprimé'); setDetail(null); load(); }
  };

  // ─── Assurances du patient ─────────────────────────────────
  const ajouterAssurance = async () => {
    if (!entreprise || !detail || !canWrite) return;
    if (!newAss.assureur_id) { toast.error('Sélectionnez un assureur'); return; }
    const { error } = await db.from('patient_assurances').insert({
      entreprise_id: entreprise.id, patient_id: detail.id,
      assureur_id: newAss.assureur_id,
      numero_adherent: newAss.numero_adherent || null,
      ordre: assurancesDe(detail.id).length + 1, actif: true,
    });
    if (error) { toast.error(error.message); return; }
    setNewAss({ assureur_id: assureurs[0]?.id || '', numero_adherent: '' });
    toast.success('Assurance rattachée'); load();
  };

  const retirerAssurance = async (id: string) => {
    if (!canWrite) return;
    const { error } = await db.from('patient_assurances').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Assurance retirée'); load(); }
  };

  // ─── Relance email (client de messagerie de l'utilisateur) ─
  const relancer = (f: FactureMedicale) => {
    if (!detail?.email) { toast.error('Aucun email au dossier de ce patient'); return; }
    const solde = (f.total_ht || 0) - (encaissements[f.id] || 0);
    const sujet = `Relance facture ${f.numero}`;
    const corps = `Bonjour ${detail.prenom || ''} ${detail.nom},\n\n`
      + `Sauf erreur de notre part, la facture ${f.numero} du ${f.date_facture} `
      + `présente un solde de ${fmt(solde)} ${entreprise?.monnaie || 'FCFA'}.\n\n`
      + `Nous vous remercions de bien vouloir procéder à son règlement.\n\n`
      + `Cordialement,\n${entreprise?.nom || ''}`;
    window.location.href = `mailto:${detail.email}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
  };

  if (!entreprise) return null;

  return (
    <div>
      <MedicalStyles />
      <PageHeader icon="🩺" title="Patients">
        <span className="text-[10px] text-fg3 font-mono">{patients.length} dossier(s)</span>
      </PageHeader>

      {absent ? <ModuleAbsent /> : (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Patients" value={String(patients.length)} />
            <Stat label="Assurés" value={String(patients.filter(p => assurancesDe(p.id).length).length)} />
            <Stat label="Assureurs actifs" value={String(assureurs.filter(a => a.actif).length)} />
            <Stat label="Sans assurance" value={String(patients.filter(p => !assurancesDe(p.id).length).length)} tone="text-fg3" />
          </div>

          <div className="bg-bg2 border border-border rounded-lg">
            <div className="flex flex-wrap justify-between items-center gap-2 p-3 border-b border-border">
              <input className="med-inp max-w-xs" placeholder="Rechercher : nom, téléphone, n° dossier…"
                value={search} onChange={e => setSearch(e.target.value)} />
              {canWrite && (
                <button onClick={() => setForm({ sexe: 'M' })}
                  className="px-3 py-1 rounded text-xs bg-primary text-primary-foreground">+ Nouveau patient</button>
              )}
            </div>
            <table className="w-full text-xs">
              <thead className="bg-bg3 text-fg3">
                <tr>
                  <th className="text-left p-2">N° dossier</th>
                  <th className="text-left p-2">Patient</th>
                  <th className="text-left p-2">Naissance</th>
                  <th className="text-left p-2">Contact</th>
                  <th className="text-left p-2">Assurances</th>
                  <th className="text-right p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} className="text-center p-6 text-fg3">Chargement…</td></tr>}
                {!loading && !filtered.length && (
                  <tr><td colSpan={6} className="text-center p-6 text-fg3">
                    {search ? 'Aucun patient ne correspond à cette recherche' : 'Aucun patient enregistré'}
                  </td></tr>
                )}
                {filtered.map(p => (
                  <tr key={p.id} className="border-t border-border hover:bg-bg3/50">
                    <td className="p-2 font-mono">{p.numero_dossier}</td>
                    <td className="p-2 font-semibold">{[p.nom, p.prenom].filter(Boolean).join(' ')}</td>
                    <td className="p-2 font-mono text-[10px]">{p.date_naissance || '—'}{p.sexe ? ` · ${p.sexe}` : ''}</td>
                    <td className="p-2 text-[10px]">{p.telephone || '—'}{p.email ? ` · ${p.email}` : ''}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {assurancesDe(p.id).map(a => (
                          <span key={a.id} className="text-[9px] px-1.5 py-0.5 rounded bg-purple/15 text-purple">
                            {assureur(a.assureur_id)?.nom || '—'}
                          </span>
                        ))}
                        {!assurancesDe(p.id).length && <span className="text-[10px] text-fg3">—</span>}
                      </div>
                    </td>
                    <td className="p-2 text-right space-x-1 whitespace-nowrap">
                      <button onClick={() => ouvrirDossier(p)} className="text-[10px] px-2 py-1 rounded border border-border hover:bg-bg3">Dossier</button>
                      {canWrite && <button onClick={() => setForm(p)} className="text-[10px] px-2 py-1 rounded border border-border">✏️</button>}
                      {canDelete && <button onClick={() => supprimerPatient(p)} className="text-[10px] px-2 py-1 rounded border border-destructive/40 text-destructive">🗑</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Formulaire identité ─── */}
      {form && (
        <Modal title={form.id ? `Modifier ${form.numero_dossier}` : 'Nouveau patient'} onClose={() => setForm(null)}>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Field label="Nom *"><input className="med-inp" value={form.nom || ''} onChange={e => setForm({ ...form, nom: e.target.value })} /></Field>
            <Field label="Prénom"><input className="med-inp" value={form.prenom || ''} onChange={e => setForm({ ...form, prenom: e.target.value })} /></Field>
            <Field label="Date de naissance"><input type="date" className="med-inp" value={form.date_naissance || ''} onChange={e => setForm({ ...form, date_naissance: e.target.value })} /></Field>
            <Field label="Sexe">
              <select className="med-inp" value={form.sexe || ''} onChange={e => setForm({ ...form, sexe: (e.target.value || null) as 'M' | 'F' | null })}>
                <option value="">—</option><option value="M">Masculin</option><option value="F">Féminin</option>
              </select>
            </Field>
            <Field label="Téléphone"><input className="med-inp" value={form.telephone || ''} onChange={e => setForm({ ...form, telephone: e.target.value })} /></Field>
            <Field label="Email"><input className="med-inp" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="Adresse">
              <textarea rows={2} className="med-inp" value={form.adresse || ''} onChange={e => setForm({ ...form, adresse: e.target.value })} /></Field></div>
            <Field label="NINEA (patient entreprise)"><input className="med-inp" value={form.ninea || ''} onChange={e => setForm({ ...form, ninea: e.target.value })} /></Field>
            <Field label="RCCM"><input className="med-inp" value={form.rccm || ''} onChange={e => setForm({ ...form, rccm: e.target.value })} /></Field>
            <div className="col-span-2"><Field label="Notes">
              <textarea rows={2} className="med-inp" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setForm(null)} className="px-3 py-1.5 rounded text-xs border border-border">Annuler</button>
            <button disabled={saving} onClick={savePatient} className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground disabled:opacity-60">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </Modal>
      )}

      {/* ─── Dossier patient ─── */}
      {detail && (
        <Modal title={`Dossier ${detail.numero_dossier} — ${[detail.nom, detail.prenom].filter(Boolean).join(' ')}`} onClose={() => setDetail(null)} wide>
          <div className="flex gap-1 mb-3">
            {([['identite', 'Identité'], ['assurances', 'Assurances'], ['historique', 'Historique factures']] as const).map(([k, lbl]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`px-3 py-1 rounded-md text-xs ${tab === k ? 'bg-primary text-primary-foreground' : 'border border-border text-fg2'}`}>{lbl}</button>
            ))}
          </div>

          {tab === 'identite' && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Info label="Nom" value={detail.nom} />
              <Info label="Prénom" value={detail.prenom || '—'} />
              <Info label="Naissance" value={detail.date_naissance || '—'} />
              <Info label="Sexe" value={detail.sexe === 'M' ? 'Masculin' : detail.sexe === 'F' ? 'Féminin' : '—'} />
              <Info label="Téléphone" value={detail.telephone || '—'} />
              <Info label="Email" value={detail.email || '—'} />
              <Info label="NINEA" value={detail.ninea || '—'} />
              <Info label="RCCM" value={detail.rccm || '—'} />
              <div className="col-span-2"><Info label="Adresse" value={detail.adresse || '—'} /></div>
              <div className="col-span-2"><Info label="Notes" value={detail.notes || '—'} /></div>
            </div>
          )}

          {tab === 'assurances' && (
            <div className="space-y-3 text-xs">
              <table className="w-full">
                <thead className="bg-bg3 text-fg3">
                  <tr>
                    <th className="text-left p-2">Ordre</th>
                    <th className="text-left p-2">Assureur</th>
                    <th className="text-left p-2">N° adhérent</th>
                    <th className="text-right p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {!assurancesDe(detail.id).length && <tr><td colSpan={4} className="p-4 text-center text-fg3">Aucune assurance rattachée</td></tr>}
                  {assurancesDe(detail.id).map(a => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="p-2 font-mono">{a.ordre}</td>
                      <td className="p-2">{assureur(a.assureur_id)?.nom || '—'}
                        <span className="text-fg3"> · taux {assureur(a.assureur_id)?.taux_defaut ?? 0}%</span></td>
                      <td className="p-2 font-mono text-[10px]">{a.numero_adherent || '—'}</td>
                      <td className="p-2 text-right">
                        {canWrite && <button onClick={() => retirerAssurance(a.id)} className="text-[10px] px-2 py-1 rounded border border-destructive/40 text-destructive">Retirer</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {canWrite && (
                <div className="grid grid-cols-3 gap-3 items-end border-t border-border pt-3">
                  <Field label="Assureur">
                    <select className="med-inp" value={newAss.assureur_id} onChange={e => setNewAss({ ...newAss, assureur_id: e.target.value })}>
                      <option value="">—</option>
                      {assureurs.filter(a => a.actif).map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
                    </select>
                  </Field>
                  <Field label="N° adhérent">
                    <input className="med-inp" value={newAss.numero_adherent} onChange={e => setNewAss({ ...newAss, numero_adherent: e.target.value })} />
                  </Field>
                  <button onClick={ajouterAssurance} className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground">Rattacher</button>
                </div>
              )}
            </div>
          )}

          {tab === 'historique' && (
            <table className="w-full text-xs">
              <thead className="bg-bg3 text-fg3">
                <tr>
                  <th className="text-left p-2">N°</th>
                  <th className="text-left p-2">Date</th>
                  <th className="text-right p-2">Total</th>
                  <th className="text-right p-2">Part patient</th>
                  <th className="text-right p-2">Encaissé</th>
                  <th className="text-center p-2">Statut</th>
                  <th className="text-right p-2"></th>
                </tr>
              </thead>
              <tbody>
                {!factures.length && <tr><td colSpan={7} className="p-4 text-center text-fg3">Aucune facture pour ce patient</td></tr>}
                {factures.map(f => {
                  const encaisse = encaissements[f.id] || 0;
                  const st = statutAffiche(f, encaisse);
                  return (
                    <tr key={f.id} className="border-t border-border">
                      <td className="p-2 font-mono">{f.numero}</td>
                      <td className="p-2 font-mono text-[10px]">{f.date_facture}</td>
                      <td className="p-2 text-right font-mono">{fmt(f.total_ht)}</td>
                      <td className="p-2 text-right font-mono">{fmt(f.total_part_patient)}</td>
                      <td className="p-2 text-right font-mono">{fmt(encaisse)}</td>
                      <td className="p-2 text-center"><StatutBadge statut={st} /></td>
                      <td className="p-2 text-right">
                        {(st === 'impayee' || st === 'partiellement_reglee') && (
                          <button onClick={() => relancer(f)} className="text-[10px] px-2 py-1 rounded border border-border hover:bg-bg3" title="Relancer par email">✉️</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg3 border border-border rounded p-2">
      <div className="text-[10px] text-fg3 uppercase tracking-wide">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
