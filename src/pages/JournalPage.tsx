import { useApp } from '@/stores/app-store';
import { useUserRole } from '@/hooks/use-user-role';
import { fmt } from '@/lib/accounting';
import { exportJournalCsv } from '@/lib/csv-export';
import { buildFec, downloadFec, controlerFec, type FecLine } from '@/lib/fec-export';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export default function JournalPage() {
  const { journal, demo, deleteJournalEntry, extournerEcriture, isExerciceCloture, entreprise, exercice } = useApp();
  const { canWrite, canDelete } = useUserRole();
  const [filter, setFilter] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [fec, setFec] = useState<{ content: string; report: ReturnType<typeof controlerFec>; ninea: string; annee: number; dateFin: string } | null>(null);
  const locked = isExerciceCloture();
  const showActions = !locked && canWrite;
  const rows = journal.filter(r => !filter || r.libelle?.toLowerCase().includes(filter.toLowerCase()) || r.compte?.includes(filter));

  const td = rows.reduce((s, r) => s + (r.debit || 0), 0);
  const tc = rows.reduce((s, r) => s + (r.credit || 0), 0);

  const handleExportFec = async () => {
    if (!entreprise || !exercice) return;
    setExportBusy(true);
    setFec(null);
    try {
      // Ne pas exporter la liste affichée : elle peut être limitée par le service.
      let source: (FecLine & { ecriture_id?: string | null })[] = demo ? journal : [];
      if (!demo) {
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await supabase.from('journal').select('*')
            .eq('entreprise_id', entreprise.id).eq('exercice_id', exercice.id)
            .order('id').range(offset, offset + 999);
          if (error) throw error;
          source.push(...(data || []));
          if (source.length > 100000) throw new Error('Plus de 100 000 lignes : export différé requis, pas encore disponible. Aucun fichier partiel téléchargé.');
          if (!data || data.length < 1000) break;
        }
      }
      const comptes: string[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from('plan_comptable').select('numero')
          .eq('entreprise_id', entreprise.id).order('numero').range(offset, offset + 999);
        if (error) throw error;
        comptes.push(...(data || []).map(c => c.numero));
        if (!data || data.length < 1000) break;
      }
      const ids = [...new Set(source.flatMap(j => j.ecriture_id ? [j.ecriture_id] : []))];
      const meta = new Map<string, { numero: string; valide_le: string | null; numero_sequence: number }>();
      for (let offset = 0; offset < ids.length; offset += 200) {
        const { data, error } = await supabase.from('ecritures').select('id, numero, valide_le, numero_sequence')
          .eq('entreprise_id', entreprise.id).eq('exercice_id', exercice.id).in('id', ids.slice(offset, offset + 200));
        if (error) throw error;
        for (const e of data || []) meta.set(e.id, e);
      }
      const lignes: FecLine[] = source.map(j => {
        const m = j.ecriture_id ? meta.get(j.ecriture_id) : undefined;
        return { ...j, ecriture_numero: m?.numero ?? null, valide_le: m?.valide_le ?? null, numero_sequence: m?.numero_sequence ?? null };
      });
      setFec({
        report: controlerFec(lignes, { dateDebut: exercice.date_debut, dateFin: exercice.date_fin, comptes }),
        content: buildFec(lignes, { entrepriseNom: entreprise.nom, ninea: entreprise.ninea, exerciceAnnee: exercice.annee }),
        ninea: entreprise.ninea, annee: exercice.annee, dateFin: exercice.date_fin,
      });
    } catch (error) {
      toast.error('Export FEC impossible : ' + (error instanceof Error ? error.message : String((error as { message?: string }).message || error)));
    } finally { setExportBusy(false); }
  };

  return (
    <div>
      <div className="min-h-12 bg-bg2 border-b border-border flex flex-wrap gap-2 items-center justify-between px-5 py-2">
        <div><div className="font-serif text-[17px]">Journal des Opérations</div><div className="text-[10px] text-fg3 font-mono">Partie double — Débit = Crédit</div></div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportJournalCsv(rows, `journal_${new Date().getFullYear()}`)} className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-border text-fg2 hover:bg-bg3">
            📥 Export CSV
          </button>
          <Button variant="outline" size="sm" onClick={handleExportFec} disabled={exportBusy} className="text-[11px]">
            <Download /> {exportBusy ? 'Contrôle en cours…' : 'Export FEC — format 18 colonnes'}
          </Button>
        </div>
      </div>
      <div className="p-5">
        {fec && <section aria-label="Rapport de contrôle FEC" className="border-b border-border pb-4 mb-4 space-y-3">
          <h2 className="text-sm font-semibold">Rapport de contrôle FEC — {fec.report.lignes} lignes</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>Sans numéro : <strong>{fec.report.sansNumero}</strong></div>
            <div>Sans validation : <strong>{fec.report.sansValidation}</strong></div>
            <div>Pièces déséquilibrées : <strong>{fec.report.desequilibrees}</strong></div>
            <div>Écart global : <strong>{fmt(fec.report.ecartGlobal)}</strong></div>
            <div>Hors plan : <strong>{fec.report.horsPlan}</strong></div>
            <div>Hors exercice : <strong>{fec.report.horsExercice}</strong></div>
            <div>Séquences invalides : <strong>{fec.report.sequencesInvalides}</strong></div>
            <div>Montants invalides : <strong>{fec.report.montantsInvalides}</strong></div>
          </div>
          <div className="text-xs">Trous de numérotation : {fec.report.trousNumerotation.length === 0 ? 'aucun' : fec.report.trousNumerotation.map(t => `${t.journal} : ${t.debut}–${t.fin}`).join(', ')}</div>
          <p className={`text-xs font-semibold ${fec.report.conforme ? 'text-success' : 'text-destructive'}`}>
            {fec.report.conforme ? 'Contrôles réussis.' : 'Export bloqué : corriger les anomalies avant téléchargement.'}
          </p>
          <Button size="sm" disabled={!fec.report.conforme} onClick={() => downloadFec(fec.content, fec.ninea, fec.annee, fec.dateFin)}>
            <Download /> Télécharger le FEC
          </Button>
        </section>}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Journal — {rows.length} ligne(s)</span>
            <input className="bg-bg3 border border-border rounded-md px-2.5 py-1 text-[11px] text-foreground outline-none focus:border-primary w-40" placeholder="Rechercher..." value={filter} onChange={e => setFilter(e.target.value)} />
          </div>
          <table className="w-full border-collapse">
            <thead><tr>
              {['Date', 'Pièce', 'Journal', 'Compte', 'Libellé', 'Débit', 'Crédit', ...(showActions ? ['Action'] : [])].map(h => (
                <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-[rgba(56,189,248,.02)]">
                  <td className="px-3 py-1.5 text-[11px] font-mono border-b border-border/50">{r.date_ecriture}</td>
                  <td className="px-3 py-1.5 text-[11px] border-b border-border/50"><span className="bg-[rgba(56,189,248,.12)] text-primary rounded-lg px-1.5 py-0.5 text-[9px] font-bold font-mono">{r.piece || '—'}</span></td>
                  <td className="px-3 py-1.5 text-[9px] text-fg3 border-b border-border/50">{r.journal_code}</td>
                  <td className="px-3 py-1.5 text-[11px] text-primary font-mono border-b border-border/50">{r.compte}</td>
                  <td className="px-3 py-1.5 text-[11px] border-b border-border/50">{r.libelle}<br /><small className="text-fg3">{r.intitule}</small></td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-primary border-b border-border/50">{r.debit ? fmt(r.debit) : ''}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-success border-b border-border/50">{r.credit ? fmt(r.credit) : ''}</td>
                  {showActions && (
                    <td className="px-3 py-1.5 border-b border-border/50">
                      {r.ecriture_id ? (
                        <button
                          type="button"
                          aria-label={`Extourner l'écriture ${r.piece || ''}`}
                          title="Contre-passation (l'écriture validée reste conservée)"
                          onClick={() => {
                            const motif = window.prompt('Motif de l\u2019extourne (5 caractères minimum) :');
                            if (!motif) return;
                            if (motif.trim().length < 5) { toast.error('Motif trop court'); return; }
                            extournerEcriture(r.id, motif.trim());
                          }}
                          className="text-accent text-[11px] font-semibold hover:underline"
                        >
                          ⟲ Extourner
                        </button>
                      ) : canDelete ? (
                        <button
                          type="button"
                          aria-label={`Supprimer la ligne historique ${r.compte}`}
                          title="Ligne historique sans écriture rattachée"
                          onClick={() => deleteJournalEntry(r.id)}
                          className="text-destructive text-[11px] hover:underline"
                        >
                          Supprimer
                        </button>
                      ) : <span className="text-[10px] text-fg3">—</span>}
                    </td>
                  )}
                </tr>
              ))}
              <tr className="bg-bg3 font-bold">
                <td colSpan={5} className="px-3 py-1.5 text-[11px] border-t border-border-2">TOTAUX</td>
                <td className="px-3 py-1.5 text-[11px] font-mono text-right text-primary border-t border-border-2">{fmt(td)}</td>
                <td className="px-3 py-1.5 text-[11px] font-mono text-right text-success border-t border-border-2">{fmt(tc)}</td>
                {showActions && <td className="border-t border-border-2"></td>}
              </tr>

            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}