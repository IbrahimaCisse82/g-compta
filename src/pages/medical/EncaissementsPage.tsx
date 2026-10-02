import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { useUserRole } from '@/hooks/use-user-role';
import { toast } from 'sonner';
import { fmt } from '@/lib/accounting';
import {
  isModuleAbsent, statutAffiche, statutApresEncaissement, todayISO, labelMoyen, MOYENS_PAIEMENT,
  type Patient, type FactureMedicale, type EncaissementMedical, type MoyenPaiement,
  db,
} from '@/lib/medical';
import { Field, MedicalStyles, Modal, ModuleAbsent, PageHeader, Stat, StatutBadge } from '@/components/medical/MedicalUI';

export default function EncaissementsPage() {
  const { entreprise } = useApp();
  const { canWrite } = useUserRole();

  const [factures, setFactures] = useState<FactureMedicale[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [encaissements, setEncaissements] = useState<EncaissementMedical[]>([]);
  const [loading, setLoading] = useState(false);
  const [absent, setAbsent] = useState(false);
  const [tab, setTab] = useState<'attente' | 'journal'>('attente');

  const [regFact, setRegFact] = useState<FactureMedicale | null>(null);
  const [regForm, setRegForm] = useState<{ montant: number; date: string; moyen: MoyenPaiement; reference: string; notes: string }>({
    montant: 0, date: todayISO(), moyen: 'especes', reference: '', notes: '',
  });

  const load = async () => {
    if (!entreprise) return;
    setLoading(true);
    const [f, p, e] = await Promise.all([
      db.from('factures_medicales').select('*').eq('entreprise_id', entreprise.id).neq('statut', 'annulee')
        .order('date_facture', { ascending: false }),
      db.from('patients').select('*').eq('entreprise_id', entreprise.id).order('nom'),
      db.from('encaissements_medicaux').select('*').eq('entreprise_id', entreprise.id)
        .order('date_reglement', { ascending: false }),
    ]);
    if (f.error) {
      if (isModuleAbsent(f.error)) setAbsent(true); else toast.error(f.error.message);
      setLoading(false); return;
    }
    setAbsent(false);
    setFactures((f.data || []) as FactureMedicale[]);
    setPatients((p.data || []) as Patient[]);
    setEncaissements((e.data || []) as EncaissementMedical[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [entreprise?.id]);

  const nomPatient = (id: string) => {
    const p = patients.find(x => x.id === id);
    return p ? [p.nom, p.prenom].filter(Boolean).join(' ') : '—';
  };
  const numeroFacture = (id: string) => factures.find(f => f.id === id)?.numero || '—';

  const encaisseParFacture = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of encaissements) m[e.facture_id] = (m[e.facture_id] || 0) + Number(e.montant);
    return m;
  }, [encaissements]);

  const solde = (f: FactureMedicale) => Number(f.total_ht || 0) - (encaisseParFacture[f.id] || 0);

  const ouvertes = useMemo(
    () => factures.filter(f => statutAffiche(f, encaisseParFacture[f.id] || 0) !== 'reglee'),
    [factures, encaisseParFacture]);

  const stats = useMemo(() => {
    const aEncaisser = ouvertes.reduce((s, f) => s + solde(f), 0);
    const encaisse = encaissements.reduce((s, e) => s + Number(e.montant || 0), 0);
    const impayees = ouvertes.filter(f => statutAffiche(f, encaisseParFacture[f.id] || 0) === 'impayee');
    const duJour = encaissements.filter(e => e.date_reglement === todayISO())
      .reduce((s, e) => s + Number(e.montant || 0), 0);
    return { aEncaisser, encaisse, nbImpayees: impayees.length, retard: impayees.reduce((s, f) => s + solde(f), 0), duJour };
  }, [ouvertes, encaissements, encaisseParFacture]);

  const ouvrirReglement = (f: FactureMedicale) => {
    setRegFact(f);
    setRegForm({ montant: Math.max(0, solde(f)), date: todayISO(), moyen: 'especes', reference: '', notes: '' });
  };

  const enregistrer = async () => {
    if (!entreprise || !regFact || !canWrite) return;
    const montant = Number(regForm.montant);
    if (!montant || montant <= 0) { toast.error('Montant invalide'); return; }

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await db.from('encaissements_medicaux').insert({
      entreprise_id: entreprise.id, facture_id: regFact.id,
      date_reglement: regForm.date, montant,
      moyen_paiement: regForm.moyen,
      reference: regForm.reference || null, notes: regForm.notes || null,
      created_by: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }

    const nouveauTotal = (encaisseParFacture[regFact.id] || 0) + montant;
    const statut = statutApresEncaissement(Number(regFact.total_ht || 0), nouveauTotal);
    const { error: e2 } = await db.from('factures_medicales').update({ statut }).eq('id', regFact.id);
    if (e2) toast.error(e2.message);

    toast.success(`Règlement de ${fmt(montant)} enregistré`);
    setRegFact(null); load();
  };

  const supprimerReglement = async (e: EncaissementMedical) => {
    if (!canWrite || !confirm(`Annuler ce règlement de ${fmt(e.montant)} ?`)) return;
    const { error } = await db.from('encaissements_medicaux').delete().eq('id', e.id);
    if (error) { toast.error(error.message); return; }
    const f = factures.find(x => x.id === e.facture_id);
    if (f) {
      const reste = (encaisseParFacture[f.id] || 0) - Number(e.montant);
      await db.from('factures_medicales')
        .update({ statut: statutApresEncaissement(Number(f.total_ht || 0), reste) }).eq('id', f.id);
    }
    toast.success('Règlement annulé'); load();
  };

  if (!entreprise) return null;

  return (
    <div>
      <MedicalStyles />
      <PageHeader icon="💰" title="Encaissements & Impayés">
        <div className="flex items-center gap-1">
          <button onClick={() => setTab('attente')} className={`px-3 py-1 rounded-md text-xs ${tab === 'attente' ? 'bg-primary text-primary-foreground' : 'border border-border text-fg2'}`}>
            À encaisser {ouvertes.length ? `(${ouvertes.length})` : ''}
          </button>
          <button onClick={() => setTab('journal')} className={`px-3 py-1 rounded-md text-xs ${tab === 'journal' ? 'bg-primary text-primary-foreground' : 'border border-border text-fg2'}`}>Règlements</button>
        </div>
      </PageHeader>

      {absent ? <ModuleAbsent /> : (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Reste à encaisser" value={fmt(stats.aEncaisser)} tone="text-primary" />
            <Stat label="Encaissé (cumul)" value={fmt(stats.encaisse)} tone="text-accent" />
            <Stat label="Encaissé aujourd'hui" value={fmt(stats.duJour)} />
            <Stat label="Factures en retard" value={String(stats.nbImpayees)} tone={stats.nbImpayees ? 'text-destructive' : 'text-fg3'} />
            <Stat label="Montant en retard" value={fmt(stats.retard)} tone={stats.nbImpayees ? 'text-destructive' : 'text-fg3'} />
          </div>

          {tab === 'attente' && (
            <div className="bg-bg2 border border-border rounded-lg">
              <div className="p-3 border-b border-border text-xs font-semibold">Factures ouvertes</div>
              <table className="w-full text-xs">
                <thead className="bg-bg3 text-fg3">
                  <tr>
                    <th className="text-left p-2">N°</th>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Échéance</th>
                    <th className="text-left p-2">Patient</th>
                    <th className="text-right p-2">Total</th>
                    <th className="text-right p-2">Encaissé</th>
                    <th className="text-right p-2">Solde</th>
                    <th className="text-center p-2">Statut</th>
                    <th className="text-right p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={9} className="text-center p-6 text-fg3">Chargement…</td></tr>}
                  {!loading && !ouvertes.length && <tr><td colSpan={9} className="text-center p-6 text-fg3">Aucune facture en attente de règlement</td></tr>}
                  {ouvertes.map(f => {
                    const deja = encaisseParFacture[f.id] || 0;
                    return (
                      <tr key={f.id} className="border-t border-border hover:bg-bg3/50">
                        <td className="p-2 font-mono">{f.numero}</td>
                        <td className="p-2 font-mono text-[10px]">{f.date_facture}</td>
                        <td className="p-2 font-mono text-[10px]">{f.date_echeance || '—'}</td>
                        <td className="p-2 font-semibold">{nomPatient(f.patient_id)}</td>
                        <td className="p-2 text-right font-mono">{fmt(f.total_ht)}</td>
                        <td className="p-2 text-right font-mono">{fmt(deja)}</td>
                        <td className="p-2 text-right font-mono font-bold text-primary">{fmt(solde(f))}</td>
                        <td className="p-2 text-center"><StatutBadge statut={statutAffiche(f, deja)} /></td>
                        <td className="p-2 text-right">
                          {canWrite && (
                            <button onClick={() => ouvrirReglement(f)}
                              className="text-[10px] px-2 py-1 rounded border border-accent/50 text-accent hover:bg-accent/10">💰 Encaisser</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'journal' && (
            <div className="bg-bg2 border border-border rounded-lg">
              <div className="p-3 border-b border-border text-xs font-semibold">Journal des règlements</div>
              <table className="w-full text-xs">
                <thead className="bg-bg3 text-fg3">
                  <tr>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Facture</th>
                    <th className="text-left p-2">Patient</th>
                    <th className="text-left p-2">Moyen</th>
                    <th className="text-left p-2">Référence</th>
                    <th className="text-right p-2">Montant</th>
                    <th className="text-right p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {!encaissements.length && <tr><td colSpan={7} className="text-center p-6 text-fg3">Aucun règlement enregistré</td></tr>}
                  {encaissements.map(e => {
                    const f = factures.find(x => x.id === e.facture_id);
                    return (
                      <tr key={e.id} className="border-t border-border hover:bg-bg3/50">
                        <td className="p-2 font-mono text-[10px]">{e.date_reglement}</td>
                        <td className="p-2 font-mono">{numeroFacture(e.facture_id)}</td>
                        <td className="p-2">{f ? nomPatient(f.patient_id) : '—'}</td>
                        <td className="p-2 text-fg2">{labelMoyen(e.moyen_paiement)}</td>
                        <td className="p-2 text-fg3 text-[10px]">{e.reference || '—'}</td>
                        <td className="p-2 text-right font-mono font-semibold">{fmt(e.montant)}</td>
                        <td className="p-2 text-right">
                          {canWrite && <button onClick={() => supprimerReglement(e)} className="text-[10px] px-2 py-1 rounded border border-destructive/40 text-destructive">Annuler</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {regFact && (
        <Modal title={`Encaissement — ${regFact.numero}`} onClose={() => setRegFact(null)}>
          <div className="bg-bg3 border border-border rounded p-3 text-xs mb-4 flex justify-between">
            <span>{nomPatient(regFact.patient_id)}</span>
            <span>Solde dû : <strong className="font-mono text-primary">{fmt(solde(regFact))}</strong></span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Field label="Montant reçu *">
              <input type="number" className="med-inp" value={regForm.montant}
                onChange={e => setRegForm({ ...regForm, montant: Number(e.target.value) })} />
            </Field>
            <Field label="Date"><input type="date" className="med-inp" value={regForm.date}
              onChange={e => setRegForm({ ...regForm, date: e.target.value })} /></Field>
            <Field label="Moyen de paiement">
              <select className="med-inp" value={regForm.moyen}
                onChange={e => setRegForm({ ...regForm, moyen: e.target.value as MoyenPaiement })}>
                {MOYENS_PAIEMENT.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Référence (chèque, transaction…)">
              <input className="med-inp" value={regForm.reference} onChange={e => setRegForm({ ...regForm, reference: e.target.value })} />
            </Field>
            <div className="col-span-2"><Field label="Notes">
              <textarea rows={2} className="med-inp" value={regForm.notes} onChange={e => setRegForm({ ...regForm, notes: e.target.value })} /></Field></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setRegFact(null)} className="px-3 py-1.5 rounded text-xs border border-border">Annuler</button>
            <button onClick={enregistrer} className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground">Enregistrer le règlement</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
