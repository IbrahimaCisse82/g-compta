import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/stores/app-store';
import { useUserRole } from '@/hooks/use-user-role';
import { calc, CR, fmt } from '@/lib/accounting';
import { calculerImpot, acomptes, baremeA, type Bareme, type LignePassage } from '@/lib/fiscal';

interface Ligne extends LignePassage { id: string; nature: string; libelle: string }

export default function FiscalPage() {
  const { balance, entreprise, exercice, demo, isExerciceCloture } = useApp();
  const { canWrite } = useUserRole();
  const [baremes, setBaremes] = useState<Bareme[]>([]);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [form, setForm] = useState({ sens: 'reintegration', nature: '', libelle: '', montant: '' });

  const load = async () => {
    const { data: b } = await supabase.from('baremes').select('code,valeur,date_effet,date_fin');
    setBaremes((b ?? []) as Bareme[]);
    if (exercice && !demo) {
      const { data } = await supabase.from('passage_fiscal').select('id,sens,nature,libelle,montant')
        .eq('exercice_id', exercice.id).order('created_at');
      setLignes((data ?? []) as Ligne[]);
    }
  };
  useEffect(() => { load(); }, [exercice?.id]);

  if (!entreprise || !exercice) return null;
  const vCR = calc(balance, CR);
  let r: ReturnType<typeof calculerImpot> | null = null; let err = '';
  try {
    r = calculerImpot({ resultatComptable: vCR['XI'] || 0, chiffreAffairesHT: vCR['XB'] || 0,
      passage: lignes, baremes, dateCloture: exercice.date_fin });
  } catch (e: any) { err = e.message; }
  const fraction = (() => { try { return baremeA(baremes, 'ACOMPTE_FRACTION', exercice.date_fin); } catch { return 1 / 3; } })();

  const ajouter = async () => {
    const m = Number(form.montant);
    if (!form.libelle || !form.nature || !(m > 0)) { toast.error('Nature, libellé et montant positif requis'); return; }
    const { error } = await supabase.from('passage_fiscal').insert({
      entreprise_id: entreprise.id, exercice_id: exercice.id, sens: form.sens, nature: form.nature,
      libelle: form.libelle, montant: Math.round(m * 100) / 100 });
    if (error) { toast.error(error.message); return; }
    setForm({ ...form, nature: '', libelle: '', montant: '' }); load();
  };
  const supprimer = async (id: string) => {
    const { error } = await supabase.from('passage_fiscal').delete().eq('id', id);
    if (error) toast.error(error.message); else load();
  };
  const editable = canWrite && !demo && !isExerciceCloture;
  const row = (l: string, v: number, b = false) => (
    <div className={`flex justify-between py-1 border-b border-border/50 ${b ? 'font-bold' : ''}`}><span>{l}</span><span className="font-mono">{fmt(v)}</span></div>);

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center px-5">
        <div><div className="font-serif text-[17px]">Résultat fiscal — IS / IMF</div>
          <div className="text-[10px] text-fg3 font-mono">{entreprise.nom} — {exercice.annee}</div></div>
      </div>
      <div className="p-5 space-y-4 text-xs">
        <div className="px-3 py-2 rounded-lg bg-accent/10 text-accent font-bold">⚠ Taux, plancher et plafond à valider sur la loi de finances en vigueur avant tout dépôt.</div>
        {err && <div className="text-destructive">{err}</div>}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-bg2 border border-border rounded-lg p-4">
            <div className="font-bold text-primary mb-2">Tableau de passage</div>
            {r && <>{row('Résultat comptable (XI)', r.resultatComptable)}{row('+ Réintégrations', r.reintegrations)}
              {row('− Déductions', r.deductions)}{row('Résultat fiscal', r.resultatFiscal, true)}</>}
            <div className="mt-3 space-y-1">
              {lignes.map(l => (
                <div key={l.id} className="flex justify-between items-center gap-2">
                  <span>{l.sens === 'reintegration' ? '+' : '−'} {l.nature} · {l.libelle}</span>
                  <span className="font-mono">{fmt(Number(l.montant))}
                    {editable && <button onClick={() => supprimer(l.id)} className="ml-2 text-destructive">✕</button>}</span>
                </div>))}
            </div>
            {editable && <div className="mt-3 grid grid-cols-2 gap-2">
              <select value={form.sens} onChange={e => setForm({ ...form, sens: e.target.value })} className="bg-bg3 border border-border rounded px-2 py-1">
                <option value="reintegration">Réintégration</option><option value="deduction">Déduction</option></select>
              <input placeholder="Nature (ex. amendes)" value={form.nature} onChange={e => setForm({ ...form, nature: e.target.value })} className="bg-bg3 border border-border rounded px-2 py-1" />
              <input placeholder="Libellé" value={form.libelle} onChange={e => setForm({ ...form, libelle: e.target.value })} className="bg-bg3 border border-border rounded px-2 py-1" />
              <input placeholder="Montant" type="number" min="0" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} className="bg-bg3 border border-border rounded px-2 py-1" />
              <button onClick={ajouter} className="col-span-2 py-1.5 rounded bg-primary text-primary-foreground font-bold">Ajouter</button>
            </div>}
          </div>
          <div className="bg-bg2 border border-border rounded-lg p-4">
            <div className="font-bold text-primary mb-2">Impôt</div>
            {r && <>{row('IS', r.is)}{row('IMF (sur CA ' + fmt(vCR['XB'] || 0) + ')', r.imf)}
              {row(`Impôt dû (${r.retenu}, le plus élevé)`, r.impotDu, true)}
              <div className="font-bold text-primary mt-4 mb-2">Acomptes provisionnels {exercice.annee + 1}</div>
              {acomptes(r.impotDu, fraction, exercice.annee + 1).map(a => row(a.echeance, a.montant))}
              <div className="text-[10px] text-fg3 mt-2">Échéances à valider.</div></>}
          </div>
        </div>
      </div>
    </div>
  );
}
