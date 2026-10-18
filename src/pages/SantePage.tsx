import { useState, useMemo, useCallback } from 'react';
import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { enregistrerLignesJournal } from '@/lib/ecritures';
import {
  calculerFacture, lignesEcritureFacture, calculerStats,
  COMPTES_SANTE, CATALOGUE_DEFAUT,
  type ActeMedical, type LignePrestation, type PriseEnCharge, type TypeActe,
} from '@/lib/sante';
import { toast } from 'sonner';

const TYPE_LABELS: Record<TypeActe, string> = {
  consultation: 'Consultation', soins: 'Soins', hospitalisation: 'Hospitalisation',
  chirurgie: 'Chirurgie', imagerie: 'Imagerie', biologie: 'Biologie',
  pharmacie: 'Pharmacie', autre: 'Autre',
};

export default function SantePage() {
  const { entreprise, exercice } = useApp();
  const [tab, setTab] = useState<'facturation' | 'catalogue' | 'consommables' | 'stats'>('facturation');

  // ─── Facturation ──────────────────────────────────
  const [patient, setPatient] = useState('');
  const [dateFact, setDateFact] = useState(new Date().toISOString().slice(0, 10));
  const [lignes, setLignes] = useState<LignePrestation[]>([]);
  const [remise, setRemise] = useState(0);
  const [pcOrganisme, setPcOrganisme] = useState('');
  const [pcTaux, setPcTaux] = useState(0);
  const [pcPlafond, setPcPlafond] = useState<number | ''>('');

  const facture = useMemo(() => {
    if (lignes.length === 0) return null;
    const pc: PriseEnCharge | null = pcTaux > 0
      ? { organisme: pcOrganisme || 'Organisme', taux: pcTaux / 100, plafond: pcPlafond === '' ? null : Number(pcPlafond), statut: pcTaux >= 100 ? 'totale' : 'partielle' }
      : null;
    return calculerFacture({ patient: patient || 'Patient', date: dateFact, lignes, prise_en_charge: pc, remise });
  }, [lignes, patient, dateFact, pcOrganisme, pcTaux, pcPlafond, remise]);

  const addLigne = (acte: ActeMedical) => {
    setLignes(prev => [...prev, {
      acte_id: acte.id, code: acte.code, designation: acte.designation,
      type: acte.type, quantite: 1, prix_unitaire: acte.prix_unitaire,
    }]);
  };

  const updateLigne = (idx: number, field: keyof LignePrestation, value: any) => {
    setLignes(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const removeLigne = (idx: number) => {
    setLignes(prev => prev.filter((_, i) => i !== idx));
  };

  const validerFacture = async () => {
    if (!facture || !entreprise || !exercice) { toast.error('Données manquantes'); return; }
    if (lignes.length === 0) { toast.error('Aucune prestation'); return; }
    const ec = lignesEcritureFacture(facture, patient || 'Patient');
    if (ec.length === 0) { toast.error('Aucune ligne à comptabiliser'); return; }
    const piece = `FAC-SANTE-${Date.now().toString().slice(-6)}`;
    try {
      await enregistrerLignesJournal(ec.map(l => ({
        entreprise_id: entreprise.id,
        exercice_id: exercice.id,
        date_ecriture: dateFact,
        piece,
        journal_code: 'VT',
        libelle: `Facture patient ${patient || '—'} — ${piece}`,
        compte: l.compte, intitule: l.intitule,
        debit: l.debit, credit: l.credit,
      })), { origine: 'facture_sante' });
      toast.success(`Facture ${piece} comptabilisée — Net à payer : ${fmt(facture.net_a_payer)} FCFA`);
      setLignes([]); setPatient(''); setRemise(0); setPcOrganisme(''); setPcTaux(0); setPcPlafond('');
    } catch (e: any) {
      toast.error('Écriture refusée : ' + e.message);
    }
  };

  // ─── Catalogue ────────────────────────────────────
  const [catalogue, setCatalogue] = useState<ActeMedical[]>(
    CATALOGUE_DEFAUT.map((a, i) => ({ ...a, id: `cat-${i}` }))
  );
  const [showCatForm, setShowCatForm] = useState(false);
  const [catForm, setCatForm] = useState<Partial<ActeMedical>>({
    code: '', designation: '', type: 'consultation', prix_unitaire: 0, compte_vente: '7061', actif: true,
  });

  const saveActe = () => {
    if (!catForm.code || !catForm.designation) { toast.error('Code et désignation requis'); return; }
    const newActe = { ...catForm, id: `cat-${Date.now()}` } as ActeMedical;
    setCatalogue(prev => [...prev, newActe]);
    setShowCatForm(false);
    setCatForm({ code: '', designation: '', type: 'consultation', prix_unitaire: 0, compte_vente: '7061', actif: true });
    toast.success('Acte ajouté au catalogue');
  };

  // ─── Consommables ─────────────────────────────────
  const [consommables, setConsommables] = useState([
    { code: 'GANT', designation: 'Gants examen (boîte)', quantite: 50, prix_unitaire: 2500, seuil_alerte: 10 },
    { code: 'SER', designation: 'Seringues (lot 100)', quantite: 8, prix_unitaire: 5000, seuil_alerte: 5 },
    { code: 'COMP', designation: 'Compresses (paquet)', quantite: 30, prix_unitaire: 1500, seuil_alerte: 10 },
    { code: 'SPI', designation: 'Sparadrap', quantite: 15, prix_unitaire: 800, seuil_alerte: 5 },
  ]);
  const [showConsoForm, setShowConsoForm] = useState(false);
  const [consoForm, setConsoForm] = useState({ code: '', designation: '', quantite: 0, prix_unitaire: 0, seuil_alerte: 0 });

  const saveConso = () => {
    if (!consoForm.code || !consoForm.designation) { toast.error('Code et désignation requis'); return; }
    setConsommables(prev => [...prev, { ...consoForm }]);
    setShowConsoForm(false);
    setConsoForm({ code: '', designation: '', quantite: 0, prix_unitaire: 0, seuil_alerte: 0 });
    toast.success('Consommable ajouté');
  };

  const consoStats = useMemo(() => {
    const valeur = consommables.reduce((s, c) => s + c.quantite * c.prix_unitaire, 0);
    const alertes = consommables.filter(c => c.quantite <= c.seuil_alerte).length;
    return { valeur, alertes, total: consommables.length };
  }, [consommables]);

  // ─── Stats ────────────────────────────────────────
  const [historique, setHistorique] = useState<ReturnType<typeof calculerFacture>[]>([]);

  const stats = useMemo(() => calculerStats(historique), [historique]);

  if (!exercice) {
    return (
      <div>
        <div className="h-12 bg-bg2 border-b border-border flex items-center px-5">
          <span className="font-serif text-[17px]">🏥 Module Santé</span>
        </div>
        <div className="p-5 text-center text-fg3 text-xs">Sélectionnez un exercice.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">🏥 Module Santé — Établissements de santé</div>
          <div className="text-[10px] text-fg3 font-mono">{entreprise?.nom} — Exercice {exercice.annee}</div>
        </div>
        <div className="flex gap-1">
          {(['facturation', 'catalogue', 'consommables', 'stats'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold border transition-colors ${tab === t ? 'bg-primary/10 text-primary border-primary/40' : 'border-border text-fg3 hover:bg-bg3'}`}>
              {t === 'facturation' ? '🧾 Facturation' : t === 'catalogue' ? '📋 Catalogue' : t === 'consommables' ? '📦 Consommables' : '📊 Stats'}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* ═══ FACTURATION ═══ */}
        {tab === 'facturation' && (
          <div className="space-y-4">
            {/* Infos patient */}
            <div className="bg-bg2 border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">👤 Informations patient</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="block"><span className="block text-[10px] text-fg3 mb-1">Nom du patient</span>
                  <input className="inp" value={patient} onChange={e => setPatient(e.target.value)} placeholder="Ex: Diop, Fatou" /></label>
                <label className="block"><span className="block text-[10px] text-fg3 mb-1">Date</span>
                  <input type="date" className="inp" value={dateFact} onChange={e => setDateFact(e.target.value)} /></label>
                <label className="block"><span className="block text-[10px] text-fg3 mb-1">Remise (FCFA)</span>
                  <input type="number" className="inp" value={remise} onChange={e => setRemise(Number(e.target.value))} /></label>
                <div />
              </div>
            </div>

            {/* Prestations */}
            <div className="bg-bg2 border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">📋 Prestations</h3>
                <select className="inp max-w-[260px]" onChange={e => {
                  const acte = catalogue.find(a => a.id === e.target.value);
                  if (acte) addLigne(acte);
                  e.target.value = '';
                }}>
                  <option value="">+ Ajouter un acte…</option>
                  {catalogue.filter(a => a.actif).map(a => (
                    <option key={a.id} value={a.id}>{a.code} — {a.designation} ({fmt(a.prix_unitaire)} FCFA)</option>
                  ))}
                </select>
              </div>
              {lignes.length === 0 ? (
                <div className="text-center text-fg3 text-xs py-6">Aucune prestation ajoutée. Sélectionnez un acte ci-dessus.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-bg3 text-fg3">
                    <tr>
                      <th className="text-left p-2">Code</th><th className="text-left p-2">Désignation</th>
                      <th className="text-left p-2">Type</th><th className="text-right p-2">Qté</th>
                      <th className="text-right p-2">PU</th><th className="text-right p-2">Montant</th>
                      <th className="text-right p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2 font-mono">{l.code}</td>
                        <td className="p-2">{l.designation}</td>
                        <td className="p-2"><span className="text-[9px] px-2 py-0.5 rounded bg-bg3">{TYPE_LABELS[l.type]}</span></td>
                        <td className="p-2 text-right"><input type="number" min="1" className="inp w-16 text-right" value={l.quantite} onChange={e => updateLigne(i, 'quantite', Number(e.target.value))} /></td>
                        <td className="p-2 text-right"><input type="number" className="inp w-24 text-right" value={l.prix_unitaire} onChange={e => updateLigne(i, 'prix_unitaire', Number(e.target.value))} /></td>
                        <td className="p-2 text-right font-mono text-primary">{fmt(l.quantite * l.prix_unitaire)}</td>
                        <td className="p-2 text-right"><button onClick={() => removeLigne(i)} className="text-destructive hover:bg-destructive/10 px-2 py-0.5 rounded text-[10px]">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Prise en charge */}
            <div className="bg-bg2 border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">🛡️ Prise en charge (organisme / mutuelle)</h3>
              <div className="grid grid-cols-3 gap-3">
                <label className="block"><span className="block text-[10px] text-fg3 mb-1">Organisme</span>
                  <input className="inp" value={pcOrganisme} onChange={e => setPcOrganisme(e.target.value)} placeholder="Ex: IPM, CNAM, Assurance privée" /></label>
                <label className="block"><span className="block text-[10px] text-fg3 mb-1">Taux (%)</span>
                  <input type="number" min="0" max="100" className="inp" value={pcTaux} onChange={e => setPcTaux(Number(e.target.value))} /></label>
                <label className="block"><span className="block text-[10px] text-fg3 mb-1">Plafond (FCFA)</span>
                  <input type="number" className="inp" value={pcPlafond} onChange={e => setPcPlafond(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Illimité" /></label>
              </div>
            </div>

            {/* Récapitulatif */}
            {facture && (
              <div className="bg-bg2 border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-3">💰 Récapitulatif de la facture</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatBox label="Total brut" value={fmt(facture.total_brut)} />
                  <StatBox label="Remise" value={fmt(facture.remise)} color="text-amber-500" />
                  <StatBox label="Net patient" value={fmt(facture.net_patient)} />
                  {facture.prise_en_charge ? (
                    <>
                      <StatBox label={`PC ${facture.prise_en_charge.organisme}`} value={fmt(facture.prise_en_charge.montant)} color="text-blue-400" />
                      <StatBox label="Net à payer (patient)" value={fmt(facture.net_a_payer)} color="text-primary" big />
                    </>
                  ) : (
                    <StatBox label="Net à payer" value={fmt(facture.net_a_payer)} color="text-primary" big />
                  )}
                </div>
                {facture.prise_en_charge && (
                  <div className="mt-3 text-[10px] text-fg3">
                    Débit 4111 (patient) : {fmt(facture.net_a_payer)} · Débit 4112 ({facture.prise_en_charge.organisme}) : {fmt(facture.prise_en_charge.montant)} · Crédit 7061/701 : {fmt(facture.total_facture)}
                  </div>
                )}
                <button onClick={validerFacture} disabled={lignes.length === 0}
                  className="mt-4 px-4 py-2 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  ✅ Valider et comptabiliser la facture
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══ CATALOGUE ═══ */}
        {tab === 'catalogue' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => setShowCatForm(true)} className="px-3 py-1 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90">+ Nouvel acte</button>
            </div>
            <div className="bg-bg2 border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-bg3 text-fg3">
                  <tr>
                    <th className="text-left p-2">Code</th><th className="text-left p-2">Désignation</th>
                    <th className="text-left p-2">Type</th><th className="text-right p-2">Prix unitaire</th>
                    <th className="text-left p-2">Compte vente</th><th className="text-center p-2">Actif</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogue.map(a => (
                    <tr key={a.id} className="border-t border-border hover:bg-bg3/50">
                      <td className="p-2 font-mono">{a.code}</td>
                      <td className="p-2">{a.designation}</td>
                      <td className="p-2"><span className="text-[9px] px-2 py-0.5 rounded bg-bg3">{TYPE_LABELS[a.type]}</span></td>
                      <td className="p-2 text-right font-mono">{fmt(a.prix_unitaire)}</td>
                      <td className="p-2 font-mono text-[10px]">{a.compte_vente}</td>
                      <td className="p-2 text-center">{a.actif ? '✅' : '⬜'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ CONSOMMABLES ═══ */}
        {tab === 'consommables' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <StatBox label="Nb consommables" value={String(consoStats.total)} />
              <StatBox label="Valeur stock (FCFA)" value={fmt(consoStats.valeur)} />
              <StatBox label="Alertes seuil" value={String(consoStats.alertes)} color={consoStats.alertes > 0 ? 'text-destructive' : ''} />
            </div>
            <div className="flex justify-end">
              <button onClick={() => setShowConsoForm(true)} className="px-3 py-1 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90">+ Consommable</button>
            </div>
            <div className="bg-bg2 border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-bg3 text-fg3">
                  <tr>
                    <th className="text-left p-2">Code</th><th className="text-left p-2">Désignation</th>
                    <th className="text-right p-2">Quantité</th><th className="text-right p-2">PU</th>
                    <th className="text-right p-2">Valeur</th><th className="text-right p-2">Seuil</th>
                    <th className="text-center p-2">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {consommables.map((c, i) => {
                    const alerte = c.quantite <= c.seuil_alerte;
                    return (
                      <tr key={i} className={`border-t border-border hover:bg-bg3/50 ${alerte ? 'bg-red-500/5' : ''}`}>
                        <td className="p-2 font-mono">{c.code}</td>
                        <td className="p-2">{c.designation}</td>
                        <td className="p-2 text-right font-mono">{c.quantite}</td>
                        <td className="p-2 text-right font-mono">{fmt(c.prix_unitaire)}</td>
                        <td className="p-2 text-right font-mono text-primary">{fmt(c.quantite * c.prix_unitaire)}</td>
                        <td className="p-2 text-right font-mono text-fg3">{c.seuil_alerte}</td>
                        <td className="p-2 text-center">{alerte ? '⚠️' : '✅'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ STATS ═══ */}
        {tab === 'stats' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="Nb factures" value={String(stats.nb_factures)} />
              <StatBox label="CA total" value={fmt(stats.ca_total)} />
              <StatBox label="CA patients" value={fmt(stats.ca_patient)} />
              <StatBox label="CA organismes" value={fmt(stats.ca_organismes)} color="text-blue-400" />
            </div>
            <div className="bg-bg2 border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">📊 Répartition par type d'acte</h3>
              {Object.entries(stats.par_type).filter(([, v]) => v > 0).length === 0 ? (
                <div className="text-center text-fg3 text-xs py-4">Aucune donnée. Validez des factures pour alimenter les statistiques.</div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(stats.par_type).filter(([, v]) => v > 0).map(([type, montant]) => {
                    const max = Math.max(...Object.values(stats.par_type));
                    const pct = max > 0 ? (montant / max) * 100 : 0;
                    return (
                      <div key={type} className="flex items-center gap-3">
                        <span className="text-[10px] w-28 shrink-0 text-fg2">{TYPE_LABELS[type as TypeActe]}</span>
                        <div className="flex-1 h-5 bg-bg3 rounded overflow-hidden">
                          <div className="h-full bg-primary/60 rounded" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] font-mono w-24 text-right">{fmt(montant)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="bg-bg2 border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-2">ℹ️ Comptes SYSCOHADA utilisés</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
                {Object.entries(COMPTES_SANTE).map(([k, v]) => (
                  <div key={k} className="bg-bg3 rounded px-2 py-1">
                    <span className="font-mono text-primary">{v}</span>
                    <span className="text-fg3 ml-2">{k.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Modals ─── */}
      {showCatForm && (
        <Modal title="Nouvel acte médical" onClose={() => setShowCatForm(false)}>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Field label="Code"><input className="inp" value={catForm.code || ''} onChange={e => setCatForm({ ...catForm, code: e.target.value })} /></Field>
            <Field label="Désignation"><input className="inp" value={catForm.designation || ''} onChange={e => setCatForm({ ...catForm, designation: e.target.value })} /></Field>
            <Field label="Type">
              <select className="inp" value={catForm.type} onChange={e => setCatForm({ ...catForm, type: e.target.value as TypeActe })}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Prix unitaire (FCFA)"><input type="number" className="inp" value={catForm.prix_unitaire || 0} onChange={e => setCatForm({ ...catForm, prix_unitaire: Number(e.target.value) })} /></Field>
            <Field label="Compte vente">
              <select className="inp" value={catForm.compte_vente || '7061'} onChange={e => setCatForm({ ...catForm, compte_vente: e.target.value })}>
                <option value="7061">7061 — Prestations de services</option>
                <option value="701">701 — Ventes de marchandises (pharmacie)</option>
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowCatForm(false)} className="px-3 py-1.5 rounded text-xs border border-border">Annuler</button>
            <button onClick={saveActe} className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground">Enregistrer</button>
          </div>
        </Modal>
      )}

      {showConsoForm && (
        <Modal title="Nouveau consommable médical" onClose={() => setShowConsoForm(false)}>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Field label="Code"><input className="inp" value={consoForm.code} onChange={e => setConsoForm({ ...consoForm, code: e.target.value })} /></Field>
            <Field label="Désignation"><input className="inp" value={consoForm.designation} onChange={e => setConsoForm({ ...consoForm, designation: e.target.value })} /></Field>
            <Field label="Quantité en stock"><input type="number" className="inp" value={consoForm.quantite} onChange={e => setConsoForm({ ...consoForm, quantite: Number(e.target.value) })} /></Field>
            <Field label="Prix unitaire (FCFA)"><input type="number" className="inp" value={consoForm.prix_unitaire} onChange={e => setConsoForm({ ...consoForm, prix_unitaire: Number(e.target.value) })} /></Field>
            <Field label="Seuil d'alerte"><input type="number" className="inp" value={consoForm.seuil_alerte} onChange={e => setConsoForm({ ...consoForm, seuil_alerte: Number(e.target.value) })} /></Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowConsoForm(false)} className="px-3 py-1.5 rounded text-xs border border-border">Annuler</button>
            <button onClick={saveConso} className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground">Enregistrer</button>
          </div>
        </Modal>
      )}

      <style>{`.inp{width:100%;padding:6px 8px;background:hsl(var(--bg3));border:1px solid hsl(var(--border));border-radius:4px;color:hsl(var(--foreground));font-size:11px;}`}</style>
    </div>
  );
}

function StatBox({ label, value, color = '', big = false }: { label: string; value: string; color?: string; big?: boolean }) {
  return (
    <div className="bg-bg2 border border-border rounded-lg p-3">
      <div className="text-[10px] text-fg3 uppercase tracking-wide">{label}</div>
      <div className={`${big ? 'text-xl' : 'text-lg'} font-bold font-mono mt-1 ${color || 'text-foreground'}`}>{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[10px] text-fg3 mb-1">{label}</span>{children}</label>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg2 border border-border rounded-xl p-5 max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-serif text-base text-foreground">{title}</h3>
          <button onClick={onClose} className="text-fg3 hover:text-foreground">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
