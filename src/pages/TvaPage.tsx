import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { calculerTvaPeriode, creditTvaAnterieur, type TvaAjustements } from '@/lib/tva';
import { lireMouvementsTva } from '@/lib/tva-data';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Calculator, Save, Plus, Archive, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { exportCsv } from '@/lib/csv-export';
import type { Tables } from '@/integrations/supabase/types';

type Declaration = Tables<'declarations_tva'>;
type Param = Tables<'tva_parametrage'>;
const initial: TvaAjustements = { prorata: 100, nonRecuperable: 0, autoliquidation: 0, autoliquidationNonRecuperable: 0, retenues: 0 };
const champs: { key: keyof TvaAjustements; label: string }[] = [
  { key: 'prorata', label: 'Prorata de déduction (%)' },
  { key: 'nonRecuperable', label: 'TVA non récupérable (FCFA)' },
  { key: 'autoliquidation', label: 'Autoliquidation à ajouter, non comptabilisée (FCFA)' },
  { key: 'autoliquidationNonRecuperable', label: 'Part non récupérable de l’autoliquidation (FCFA)' },
  { key: 'retenues', label: 'Retenues subies (FCFA)' },
];

export default function TvaPage() {
  const { entreprise, exercice, demo } = useApp();
  const [params, setParams] = useState<Param[]>([]);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [systeme, setSysteme] = useState<{ role: string; compte: string; entreprise_id: string | null }[]>([]);
  const [tab, setTab] = useState('declarations');
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState('');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [ajustements, setAjustements] = useState(initial);
  const [rapport, setRapport] = useState<{ collectee: number; deductible: number; nombre: number; ca: number; comptes: Awaited<ReturnType<typeof lireMouvementsTva>>['comptes'] } | null>(null);
  const [form, setForm] = useState({ code: '', libelle: '', taux: '', collectee: '', deductible: '' });
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!entreprise || !exercice) return;
    const [p, d, c] = await Promise.all([
      supabase.from('tva_parametrage').select('*').eq('entreprise_id', entreprise.id).order('code'),
      supabase.from('declarations_tva').select('*').eq('entreprise_id', entreprise.id).order('date_fin', { ascending: false }),
      supabase.from('comptes_systeme').select('role,compte,entreprise_id').or(`entreprise_id.eq.${entreprise.id},entreprise_id.is.null`),
    ]);
    if (p.error || d.error || c.error) throw new Error(p.error?.message ?? d.error?.message ?? c.error?.message);
    setParams(p.data ?? []); setDeclarations(d.data ?? []); setSysteme(c.data ?? []);
  }, [entreprise?.id, exercice?.id]);
  useEffect(() => {
    generation.current++; setRapport(null); setParams([]); setDeclarations([]); setSysteme([]); setErreur('');
    setDebut(exercice?.date_debut ?? ''); setFin(exercice?.date_fin ?? ''); setAjustements(initial);
    load().catch(e => setErreur(e.message));
  }, [load]);
  const invalider = () => { generation.current++; setRapport(null); setErreur(''); };
  const compteSysteme = (role: string) => systeme.find(c => c.role === role && c.entreprise_id === entreprise?.id)?.compte
    ?? systeme.find(c => c.role === role && c.entreprise_id === null)?.compte ?? '';
  const comptesCol = [...new Set([...params.filter(p => p.actif).map(p => p.compte_tva_collectee), compteSysteme('tva_collectee')].filter(Boolean))];
  const comptesDed = [...new Set([...params.filter(p => p.actif).map(p => p.compte_tva_deductible), compteSysteme('tva_deductible')].filter(Boolean))];
  let resultat: ReturnType<typeof calculerTvaPeriode> | null = null;
  let calculErreur = '';
  try {
    if (rapport) resultat = calculerTvaPeriode({ ...ajustements, collectee: rapport.collectee, deductible: rapport.deductible,
      creditPrec: creditTvaAnterieur(declarations.map(d => ({ ...d, credit_reportable: d.calcul_version === 2 ? Number(d.credit_reportable) : undefined })), debut) });
  } catch (e) { calculErreur = e instanceof Error ? e.message : 'Calcul impossible'; }
  const ouverte = exercice?.statut === 'en_cours' && !demo;
  const calculer = async () => {
    if (!entreprise || !exercice) return;
    if (!debut || !fin || debut > fin || debut < exercice.date_debut || fin > exercice.date_fin) { setErreur('Période invalide ou hors exercice.'); return; }
    if (!comptesCol.length || !comptesDed.length) { setErreur('Configurez les comptes TVA dans les comptes système ou le paramétrage.'); return; }
    if (comptesCol.some(c => comptesDed.some(d => c.startsWith(d) || d.startsWith(c)))) { setErreur('Un compte ne peut pas être à la fois collecté et déductible.'); return; }
    const token = ++generation.current;
    setLoading(true); setErreur(''); setRapport(null);
    try {
      const r = await lireMouvementsTva(entreprise.id, exercice.id, debut, fin);
      if (token !== generation.current) return;
      const somme = (prefixes: string[], credit: boolean) => r.comptes.filter(c => prefixes.some(p => c.compte.startsWith(p)))
        .reduce((s, c) => s + Math.round((credit ? c.credit - c.debit : c.debit - c.credit) * 100), 0) / 100;
      setRapport({ ...r, collectee: somme(comptesCol, true), deductible: somme(comptesDed, false), ca: somme(['70'], true) });
    } catch (e) { if (token === generation.current) setErreur(e instanceof Error ? e.message : 'Lecture impossible'); }
    finally { setLoading(false); }
  };
  const sauver = async () => {
    if (!resultat || !rapport || !entreprise || !exercice || !ouverte) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('declarations_tva').insert({
        entreprise_id: entreprise.id, exercice_id: exercice.id, periode: `${debut} au ${fin}`, date_debut: debut, date_fin: fin,
        calcul_version: 2, statut: 'brouillon', tva_collectee: rapport.collectee, tva_deductible: rapport.deductible,
        tva_nette: resultat.nette, credit_precedent: resultat.creditPrec, tva_a_payer: resultat.aPayer,
        prorata: ajustements.prorata, tva_non_recuperable: ajustements.nonRecuperable, autoliquidation: ajustements.autoliquidation,
        autoliquidation_non_recuperable: ajustements.autoliquidationNonRecuperable, retenues_subies: ajustements.retenues,
        deduction_admise: resultat.deductionAdmise, credit_reportable: resultat.creditReportable,
        detail_calcul: { source: 'ecritures_validees', nombre_lignes: rapport.nombre, comptes: rapport.comptes, ca_comptable: rapport.ca, comptes_collectee: comptesCol, comptes_deductible: comptesDed },
      });
      if (error) throw error;
      await load(); setTab('declarations'); toast.success('Brouillon TVA enregistré ; aucune écriture de liquidation créée');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Enregistrement refusé'); }
    finally { setLoading(false); }
  };
  const ajouter = async () => {
    if (!entreprise || !ouverte) return;
    if (!form.code.trim() || !form.libelle.trim() || !form.collectee || !form.deductible || form.taux === '' || !Number.isFinite(Number(form.taux)) || Number(form.taux) < 0 || Number(form.taux) > 100) { toast.error('Renseignez le code, le libellé, les comptes et un taux entre 0 et 100 %.'); return; }
    setLoading(true);
    const { error } = await supabase.from('tva_parametrage').insert({ entreprise_id: entreprise.id, code: form.code.trim(), libelle: form.libelle.trim(), taux: Number(form.taux), compte_tva_collectee: form.collectee.trim(), compte_tva_deductible: form.deductible.trim() });
    try { if (error) throw error; await load(); setForm({ code: '', libelle: '', taux: '', collectee: '', deductible: '' }); invalider(); toast.success('Taux ajouté'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Enregistrement refusé'); }
    finally { setLoading(false); }
  };
  return <div>
    <header className="border-b border-border bg-bg2 px-5 py-3"><h1 className="font-serif text-lg">TVA & Déclarations fiscales</h1><p className="text-xs text-fg3">{entreprise?.nom} — {exercice?.annee}</p></header>
    <div className="p-5 space-y-4">
      <div role="status" className="border-l-2 border-accent pl-3 text-sm text-fg2">Préparation sur débits — brouillon non déclaratif. Encaissements, régularisation annuelle et liquidation complète restent à finaliser.</div>
      {erreur && <p role="alert" className="text-sm text-destructive">{erreur}</p>}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto justify-start"><TabsTrigger value="declarations">Déclarations</TabsTrigger><TabsTrigger value="calcul">Préparer TVA</TabsTrigger><TabsTrigger value="config">Paramétrage</TabsTrigger></TabsList>
        <TabsContent value="calcul" className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><Label htmlFor="tva-debut">Du</Label><Input id="tva-debut" type="date" value={debut} onChange={e => { setDebut(e.target.value); invalider(); }} /></div>
            <div><Label htmlFor="tva-fin">Au</Label><Input id="tva-fin" type="date" value={fin} onChange={e => { setFin(e.target.value); invalider(); }} /></div>
            <div className="flex items-end"><Button disabled={loading} onClick={calculer}><Calculator />{loading ? 'Lecture…' : 'Calculer'}</Button></div>
            {champs.map(c => <div key={c.key}><Label htmlFor={`tva-${c.key}`}>{c.label}</Label><Input id={`tva-${c.key}`} type="number" min="0" max={c.key === 'prorata' ? 100 : undefined} step={c.key === 'prorata' ? '0.0001' : '0.01'} value={ajustements[c.key]} onChange={e => setAjustements(a => ({ ...a, [c.key]: Number(e.target.value) }))} /></div>)}
          </div>
          {calculErreur && <p role="alert" className="text-destructive text-sm">{calculErreur}</p>}
          {rapport && resultat && <section className="border-t border-border pt-4 space-y-2">
            <h2 className="font-semibold">Préparation du {debut} au {fin}</h2>
            <p className="text-xs text-fg3">{rapport.nombre} lignes validées — chiffre d’affaires comptable : {fmt(rapport.ca)} FCFA</p>
            {Object.entries({ 'TVA collectée, autoliquidation incluse': resultat.collectee, 'TVA déductible brute': resultat.deductibleBrute, 'Déduction admise après prorata': resultat.deductionAdmise, 'Crédit antérieur validé': resultat.creditPrec, 'Retenues subies': resultat.retenues, 'TVA à payer': resultat.aPayer, 'Crédit reportable': resultat.creditReportable }).map(([label, montant]) => <div key={label} className="flex justify-between gap-4 border-b border-border py-2 text-sm"><span>{label}</span><span className="font-mono shrink-0">{fmt(montant)} FCFA</span></div>)}
            <Button onClick={sauver} disabled={loading || !ouverte || rapport.nombre === 0}><Save />Enregistrer le brouillon</Button>
            <details className="pt-2"><summary className="cursor-pointer text-sm">Détail des comptes</summary><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Compte</th><th className="text-right">Débit</th><th className="text-right">Crédit</th></tr></thead><tbody>{rapport.comptes.map(c => <tr key={c.compte}><td>{c.compte}</td><td className="text-right font-mono">{fmt(c.debit)}</td><td className="text-right font-mono">{fmt(c.credit)}</td></tr>)}</tbody></table></div></details>
          </section>}
        </TabsContent>
        <TabsContent value="declarations">
          <div className="flex justify-end mb-3"><Button variant="outline" disabled={!declarations.length} onClick={() => exportCsv(['Période', 'Collectée', 'Déductible brute', 'Prorata %', 'Retenues', 'À payer', 'Crédit reportable', 'Statut'], declarations.filter(d => d.exercice_id === exercice?.id).map(d => [d.periode, d.tva_collectee, d.tva_deductible, d.prorata, d.retenues_subies, Math.max(0, Number(d.tva_a_payer)), d.calcul_version === 2 ? d.credit_reportable : Math.max(0, -Number(d.tva_a_payer)), d.statut]), `preparation_tva_${exercice?.annee}`)}><FileSpreadsheet />CSV</Button></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Période', 'Collectée', 'Déduction admise', 'À payer', 'Crédit reportable', 'Statut'].map(t => <th className="text-left border-b border-border py-2 px-2 whitespace-nowrap" key={t}>{t}</th>)}</tr></thead><tbody>
            {declarations.filter(d => d.exercice_id === exercice?.id).map(d => <tr key={d.id} className="border-b border-border"><td className="px-2 py-3 whitespace-nowrap">{d.periode}</td><td className="px-2 font-mono">{fmt(Number(d.tva_collectee) + (d.calcul_version === 2 ? Number(d.autoliquidation) : 0))}</td><td className="px-2 font-mono">{fmt(d.calcul_version === 2 ? d.deduction_admise : d.tva_deductible)}</td><td className="px-2 font-mono">{fmt(Math.max(0, Number(d.tva_a_payer)))}</td><td className="px-2 font-mono">{fmt(d.calcul_version === 2 ? d.credit_reportable : Math.max(0, -Number(d.tva_a_payer)))}</td><td className="px-2">{d.statut === 'validee' ? 'Validée' : 'Brouillon'}</td></tr>)}
            {!declarations.some(d => d.exercice_id === exercice?.id) && <tr><td colSpan={6} className="py-8 text-center text-fg3">Aucune déclaration pour cet exercice</td></tr>}
          </tbody></table></div>
        </TabsContent>
        <TabsContent value="config" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{([{ key: 'code', label: 'Code' }, { key: 'libelle', label: 'Libellé' }, { key: 'taux', label: 'Taux (%)' }, { key: 'collectee', label: 'Compte TVA collectée' }, { key: 'deductible', label: 'Compte TVA déductible' }] as const).map(c => <div key={c.key}><Label htmlFor={`param-${c.key}`}>{c.label}</Label><Input id={`param-${c.key}`} type={c.key === 'taux' ? 'number' : 'text'} value={form[c.key]} onChange={e => setForm(f => ({ ...f, [c.key]: e.target.value }))} /></div>)}</div>
          <Button onClick={ajouter} disabled={loading || !ouverte}><Plus />Ajouter le taux</Button>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Code', 'Libellé', 'Taux', 'Collectée', 'Déductible', ''].map((t, i) => <th key={i} className="text-left border-b border-border py-2 px-2">{t}</th>)}</tr></thead><tbody>{params.map(p => <tr key={p.id} className="border-b border-border"><td className="px-2">{p.code}</td><td className="px-2 py-3">{p.libelle}</td><td className="px-2 whitespace-nowrap">{p.taux} %</td><td className="px-2 font-mono">{p.compte_tva_collectee}</td><td className="px-2 font-mono">{p.compte_tva_deductible}</td><td><Button size="icon" variant="ghost" title={p.actif ? 'Archiver le taux' : 'Réactiver le taux'} aria-label={p.actif ? `Archiver ${p.code}` : `Réactiver ${p.code}`} disabled={loading || !ouverte} onClick={async () => { const { error } = await supabase.from('tva_parametrage').update({ actif: !p.actif }).eq('id', p.id); if (error) toast.error(error.message); else { invalider(); await load(); } }}><Archive /></Button></td></tr>)}</tbody></table></div>
        </TabsContent>
      </Tabs>
    </div>
  </div>;
}
