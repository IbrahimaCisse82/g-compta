import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { enregistrerLignesJournal, round2 } from '@/lib/ecritures';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TvaParam { id: string; code: string; libelle: string; taux: number; compte_tva_collectee: string; compte_tva_deductible: string; actif: boolean; }
interface Declaration { id: string; periode: string; date_debut: string; date_fin: string; tva_collectee: number; tva_deductible: number; tva_nette: number; credit_precedent: number; tva_a_payer: number; statut: string; }

export default function TvaPage() {
  const { entreprise, exercice, journal, balance } = useApp();
  const [params, setParams] = useState<TvaParam[]>([]);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'config' | 'declarations' | 'calcul'>('declarations');
  const [showParamForm, setShowParamForm] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newLibelle, setNewLibelle] = useState('');
  const [newTaux, setNewTaux] = useState(18);
  // Calcul
  const [calcDebut, setCalcDebut] = useState('');
  const [calcFin, setCalcFin] = useState('');

  const loadData = useCallback(async () => {
    if (!entreprise || !exercice) return;
    const [pRes, dRes] = await Promise.all([
      supabase.from('tva_parametrage').select('*').eq('entreprise_id', entreprise.id),
      supabase.from('declarations_tva').select('*').eq('entreprise_id', entreprise.id).eq('exercice_id', exercice.id).order('date_debut'),
    ]);
    if (pRes.data) setParams(pRes.data as any[]);
    if (dRes.data) setDeclarations(dRes.data as any[]);
  }, [entreprise, exercice]);

  useEffect(() => { loadData(); }, [loadData]);

  const addParam = async () => {
    if (!entreprise) return;
    const { error } = await supabase.from('tva_parametrage').insert({
      entreprise_id: entreprise.id, code: newCode, libelle: newLibelle, taux: newTaux,
    });
    if (error) toast.error(error.message);
    else { toast.success('Taux TVA ajouté'); setShowParamForm(false); await loadData(); }
  };

  // Calculate TVA for period
  const calcTva = useMemo(() => {
    if (!calcDebut || !calcFin) return null;
    let collectee = 0, deductible = 0;
    for (const j of journal) {
      if (j.date_ecriture < calcDebut || j.date_ecriture > calcFin) continue;
      // TVA collectée = comptes 443x (credit)
      if (/^443/.test(j.compte)) collectee += (j.credit || 0) - (j.debit || 0);
      // TVA déductible = comptes 445x (debit)
      if (/^445/.test(j.compte)) deductible += (j.debit || 0) - (j.credit || 0);
    }
    const lastDecl = declarations.filter(d => d.statut === 'validee').sort((a, b) => b.date_fin.localeCompare(a.date_fin))[0];
    const creditPrec = lastDecl && lastDecl.tva_a_payer < 0 ? Math.abs(lastDecl.tva_a_payer) : 0;
    const nette = collectee - deductible;
    const aPayer = nette - creditPrec;
    return { collectee, deductible, nette, creditPrec, aPayer };
  }, [journal, calcDebut, calcFin, declarations]);

  const saveDeclaration = async () => {
    if (!calcTva || !entreprise || !exercice) return;
    setLoading(true);
    const periode = `${calcDebut} au ${calcFin}`;
    const { error } = await supabase.from('declarations_tva').insert({
      entreprise_id: entreprise.id, exercice_id: exercice.id,
      periode, date_debut: calcDebut, date_fin: calcFin,
      tva_collectee: calcTva.collectee, tva_deductible: calcTva.deductible,
      tva_nette: calcTva.nette, credit_precedent: calcTva.creditPrec,
      tva_a_payer: calcTva.aPayer,
    });
    if (error) toast.error(error.message);
    else { toast.success('Déclaration TVA enregistrée'); await loadData(); setTab('declarations'); }
    setLoading(false);
  };

  // Validation d'une déclaration → OD de liquidation de TVA (SYSCOHADA) :
  // débit 4431 (TVA facturée) / crédit 4452 (TVA récupérable)
  // solde créditeur → 4441 TVA due ; solde débiteur → 4449 crédit à reporter.
  const validerDecl = async (id: string) => {
    const d = declarations.find(x => x.id === id);
    if (!d || !entreprise || !exercice) return;
    const collectee = round2(Number(d.tva_collectee));
    const deductible = round2(Number(d.tva_deductible));
    const solde = round2(collectee - deductible);
    if (collectee > 0 || deductible > 0) {
      const base = {
        entreprise_id: entreprise.id, exercice_id: exercice.id,
        date_ecriture: d.date_fin, piece: `TVA-${d.date_fin}`, journal_code: 'OD',
        libelle: `Liquidation TVA — ${d.periode}`,
      };
      const lignes = [
        { ...base, compte: '4431', intitule: 'TVA facturée sur ventes', debit: collectee, credit: 0 },
        { ...base, compte: '4452', intitule: 'TVA récupérable sur achats', debit: 0, credit: deductible },
        solde >= 0
          ? { ...base, compte: '4441', intitule: 'État, TVA due', debit: 0, credit: solde }
          : { ...base, compte: '4449', intitule: 'État, crédit de TVA à reporter', debit: -solde, credit: 0 },
      ].filter(l => (l.debit || 0) + (l.credit || 0) > 0);
      try {
        await enregistrerLignesJournal(lignes, { origine: 'tva' });
      } catch (e: any) {
        toast.error(`Écriture de liquidation refusée : ${e.message}`);
        return;
      }
    }
    await supabase.from('declarations_tva').update({ statut: 'validee' } as any).eq('id', id);
    toast.success('Déclaration validée et liquidation comptabilisée');
    await loadData();
  };

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div><div className="font-serif text-[17px]">🧾 TVA & Déclarations Fiscales</div>
        <div className="text-[10px] text-fg3 font-mono">Paramétrage, calcul et suivi des déclarations</div></div>
      </div>
      <div className="p-5">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-4">
          {(['declarations', 'calcul', 'config'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded text-[11px] font-bold ${tab === t ? 'bg-primary text-primary-foreground' : 'bg-bg2 border border-border text-fg2 hover:bg-bg3'}`}>
              {t === 'declarations' ? '📋 Déclarations' : t === 'calcul' ? '🧮 Calculer TVA' : '⚙️ Paramétrage'}
            </button>
          ))}
        </div>

        {/* CONFIG TAB */}
        {tab === 'config' && (
          <>
            {showParamForm && (
              <div className="bg-bg2 border border-border rounded-lg p-4 mb-4">
                <div className="flex items-end gap-3">
                  <div><label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Code</label>
                    <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="TVA18" className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] w-24 font-mono" /></div>
                  <div><label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Libellé</label>
                    <input value={newLibelle} onChange={e => setNewLibelle(e.target.value)} placeholder="TVA 18%" className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] w-40" /></div>
                  <div><label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Taux %</label>
                    <input type="number" value={newTaux} onChange={e => setNewTaux(Number(e.target.value))} className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] w-20 font-mono" /></div>
                  <button onClick={addParam} className="px-4 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground">✓ Ajouter</button>
                </div>
              </div>
            )}
            <button onClick={() => setShowParamForm(!showParamForm)} className="mb-3 px-3 py-1.5 rounded text-[11px] font-bold border border-border text-fg2 hover:bg-bg3">
              {showParamForm ? '✕' : '+ Nouveau taux'}
            </button>
            <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
              <table className="w-full border-collapse">
                <thead><tr>
                  {['Code', 'Libellé', 'Taux', 'Compte Collectée', 'Compte Déductible', ''].map(h => (
                    <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {params.map(p => (
                    <tr key={p.id} className="hover:bg-[rgba(56,189,248,.02)]">
                      <td className="px-3 py-1.5 text-[11px] font-mono font-bold text-primary border-b border-border/50">{p.code}</td>
                      <td className="px-3 py-1.5 text-[11px] border-b border-border/50">{p.libelle}</td>
                      <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{p.taux} %</td>
                      <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{p.compte_tva_collectee}</td>
                      <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{p.compte_tva_deductible}</td>
                      <td className="px-3 py-1.5 border-b border-border/50">
                        <button onClick={async () => { await supabase.from('tva_parametrage').delete().eq('id', p.id); await loadData(); }} className="text-destructive text-xs">🗑</button>
                      </td>
                    </tr>
                  ))}
                  {params.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-fg3 text-[11px]">Aucun taux configuré</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* CALCUL TAB */}
        {tab === 'calcul' && (
          <div className="bg-bg2 border border-border rounded-lg p-4">
            <div className="font-bold text-sm mb-3 text-primary">🧮 Calcul de la TVA</div>
            <div className="flex items-end gap-3 mb-4">
              <div><label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Du</label>
                <input type="date" value={calcDebut} onChange={e => setCalcDebut(e.target.value)} className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px]" /></div>
              <div><label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Au</label>
                <input type="date" value={calcFin} onChange={e => setCalcFin(e.target.value)} className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px]" /></div>
            </div>
            {calcTva && (
              <div className="space-y-2">
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-[11px]">TVA Collectée (comptes 443x)</span>
                  <span className="text-[11px] font-mono font-bold">{fmt(calcTva.collectee)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-[11px]">TVA Déductible (comptes 445x)</span>
                  <span className="text-[11px] font-mono font-bold text-accent">{fmt(calcTva.deductible)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-[11px] font-bold">TVA Nette</span>
                  <span className="text-[11px] font-mono font-bold">{fmt(calcTva.nette)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50">
                  <span className="text-[11px]">Crédit de TVA précédent</span>
                  <span className="text-[11px] font-mono">{fmt(calcTva.creditPrec)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border bg-bg3 px-3 rounded">
                  <span className="text-[12px] font-bold">TVA À PAYER</span>
                  <span className={`text-[14px] font-mono font-bold ${calcTva.aPayer >= 0 ? 'text-destructive' : 'text-success'}`}>
                    {calcTva.aPayer >= 0 ? fmt(calcTva.aPayer) : `Crédit: ${fmt(Math.abs(calcTva.aPayer))}`}
                  </span>
                </div>
                <button onClick={saveDeclaration} disabled={loading} className="mt-3 px-4 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground">
                  ✓ Enregistrer la déclaration
                </button>
              </div>
            )}
          </div>
        )}

        {/* DECLARATIONS TAB */}
        {tab === 'declarations' && (
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <table className="w-full border-collapse">
              <thead><tr>
                {['Période', 'TVA Collectée', 'TVA Déductible', 'Nette', 'Crédit préc.', 'À Payer', 'Statut', ''].map(h => (
                  <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {declarations.map(d => (
                  <tr key={d.id} className="hover:bg-[rgba(56,189,248,.02)]">
                    <td className="px-3 py-1.5 text-[11px] font-bold border-b border-border/50">{d.periode}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50">{fmt(d.tva_collectee)}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50">{fmt(d.tva_deductible)}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50">{fmt(d.tva_nette)}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50">{fmt(d.credit_precedent)}</td>
                    <td className={`px-3 py-1.5 text-[11px] font-mono text-right font-bold border-b border-border/50 ${d.tva_a_payer >= 0 ? 'text-destructive' : 'text-success'}`}>
                      {fmt(d.tva_a_payer)}
                    </td>
                    <td className="px-3 py-1.5 border-b border-border/50">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${d.statut === 'validee' ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent'}`}>
                        {d.statut === 'validee' ? '✓ Validée' : '📝 Brouillon'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 border-b border-border/50">
                      {d.statut !== 'validee' && (
                        <button onClick={() => validerDecl(d.id)} className="text-[10px] text-success hover:underline">Valider</button>
                      )}
                    </td>
                  </tr>
                ))}
                {declarations.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-fg3 text-[11px]">Aucune déclaration. Utilisez l'onglet "Calculer TVA" pour en créer.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
