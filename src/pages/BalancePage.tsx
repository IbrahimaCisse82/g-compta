import { useApp } from '@/stores/app-store';
import { fmt, pf } from '@/lib/accounting';
import { exportBalanceCsv } from '@/lib/csv-export';
import { useState, useRef } from 'react';
import ControleBalance from '@/components/ControleBalance';
import { toast } from 'sonner';
import { enregistrerLignesJournal } from '@/lib/ecritures';

function ImportCsvModal({ onImport, onClose }: { onImport: (lines: { compte: string; intitule: string; sd: number; sc: number; md: number; mc: number; sfd: number; sfc: number }[]) => void; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ compte: string; intitule: string; sd: number; sc: number; md: number; mc: number; sfd: number; sfc: number }[]>([]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast.error('Fichier vide ou invalide'); return; }

      // Detect separator (;  or ,  or \t)
      const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
      const rows = lines.slice(1).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim()));

      const parsed = rows
        .filter(r => r.length >= 2 && r[0])
        .map(r => ({
          compte: r[0],
          intitule: r[1] || '',
          sd: pf(r[2] || '0'),
          sc: pf(r[3] || '0'),
          md: pf(r[4] || '0'),
          mc: pf(r[5] || '0'),
          sfd: pf(r[6] || '0'),
          sfc: pf(r[7] || '0'),
        }));

      if (parsed.length === 0) { toast.error('Aucune ligne valide détectée'); return; }
      setPreview(parsed);
    };
    reader.readAsText(file, 'UTF-8');
  };

  return (
    <div className="bg-bg2 border border-border rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold text-sm text-primary">📂 Import CSV Balance</div>
        <button onClick={onClose} className="text-fg3 text-xs hover:text-foreground">✕ Fermer</button>
      </div>
      <p className="text-[10px] text-fg3 mb-3">
        Format attendu : <code className="bg-bg3 px-1 rounded">Compte;Intitulé;SD;SC;MD;MC;SFD;SFC</code> — Séparateur : <code>;</code> ou <code>,</code> ou tabulation.
      </p>
      <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" onChange={handleFile} className="text-xs text-fg2 mb-3" />

      {preview.length > 0 && (
        <>
          <div className="text-[11px] text-success font-bold mb-2">✓ {preview.length} ligne(s) détectée(s)</div>
          <div className="max-h-48 overflow-auto border border-border rounded mb-3">
            <table className="w-full border-collapse text-[10px]">
              <thead><tr>
                {['Compte', 'Intitulé', 'SD', 'SC', 'MD', 'MC', 'SFD', 'SFC'].map(h => (
                  <th key={h} className="bg-bg3 px-2 py-1 text-left font-mono border-b border-border">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {preview.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td className="px-2 py-0.5 font-mono text-primary border-b border-border/30">{r.compte}</td>
                    <td className="px-2 py-0.5 border-b border-border/30">{r.intitule}</td>
                    <td className="px-2 py-0.5 font-mono text-right border-b border-border/30">{fmt(r.sd)}</td>
                    <td className="px-2 py-0.5 font-mono text-right border-b border-border/30">{fmt(r.sc)}</td>
                    <td className="px-2 py-0.5 font-mono text-right border-b border-border/30">{fmt(r.md)}</td>
                    <td className="px-2 py-0.5 font-mono text-right border-b border-border/30">{fmt(r.mc)}</td>
                    <td className="px-2 py-0.5 font-mono text-right border-b border-border/30">{fmt(r.sfd)}</td>
                    <td className="px-2 py-0.5 font-mono text-right border-b border-border/30">{fmt(r.sfc)}</td>
                  </tr>
                ))}
                {preview.length > 10 && <tr><td colSpan={8} className="px-2 py-1 text-fg3">...et {preview.length - 10} lignes de plus</td></tr>}
              </tbody>
            </table>
          </div>
          <button onClick={() => onImport(preview)} className="px-4 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground hover:opacity-90">
            ✓ Importer {preview.length} lignes
          </button>
        </>
      )}
    </div>
  );
}

export default function BalancePage() {
  const { balance, entreprise, exercice, demo, isExerciceCloture } = useApp();
  const [filter, setFilter] = useState('');
  const [showImport, setShowImport] = useState(false);
  const locked = isExerciceCloture();

  const rows = balance
    .filter(r => !filter || r.compte.includes(filter) || r.intitule.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.compte.localeCompare(b.compte));

  const T = rows.reduce((t, r) => ({ sd: t.sd + (r.sd || 0), sc: t.sc + (r.sc || 0), md: t.md + (r.md || 0), mc: t.mc + (r.mc || 0), sfd: t.sfd + (r.sfd || 0), sfc: t.sfc + (r.sfc || 0) }), { sd: 0, sc: 0, md: 0, mc: 0, sfd: 0, sfc: 0 });
  const eqInit = Math.abs(T.sd - T.sc) < 1;
  const eqMvt = Math.abs(T.md - T.mc) < 1;
  const eqFin = Math.abs(T.sfd - T.sfc) < 1;

  const handleImport = async (lines: { compte: string; intitule: string; sd: number; sc: number; md: number; mc: number; sfd: number; sfc: number }[]) => {
    if (!exercice || !entreprise) { toast.error('Sélectionnez un exercice.'); return; }
    // A7 : la table `balance` est gelée. L'import d'un solde d'ouverture se fait
    // désormais par des à-nouveaux au journal AN (moteur serveur : équilibre + droits).
    const anLignes = [];
    for (const l of lines) {
      if (l.sfd > 0) anLignes.push({ entreprise_id: entreprise.id, exercice_id: exercice.id, date_ecriture: exercice.date_debut, piece: 'AN', journal_code: 'AN', libelle: 'À-nouveau (import)', compte: l.compte, intitule: l.intitule, debit: l.sfd, credit: 0 });
      if (l.sfc > 0) anLignes.push({ entreprise_id: entreprise.id, exercice_id: exercice.id, date_ecriture: exercice.date_debut, piece: 'AN', journal_code: 'AN', libelle: 'À-nouveau (import)', compte: l.compte, intitule: l.intitule, debit: 0, credit: l.sfc });
    }
    if (anLignes.length === 0) { toast.error('Aucun solde à importer.'); return; }
    const totD = anLignes.reduce((s, l) => s + (l.debit || 0), 0);
    const totC = anLignes.reduce((s, l) => s + (l.credit || 0), 0);
    if (Math.abs(totD - totC) > 0.01) { toast.error(`Balance non équilibrée (D=${totD}, C=${totC}).`); return; }
    try {
      await enregistrerLignesJournal(anLignes, { statut: 'validee', origine: 'a_nouveau' });
      toast.success(`${lines.length} ligne(s) importée(s) via à-nouveaux (journal AN). Rechargez la page.`);
      setShowImport(false);
    } catch (e: any) {
      toast.error('Import refusé : ' + (e?.message || 'Erreur'));
    }
  };

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div><div className="font-serif text-[17px]">Balance Générale</div><div className="text-[10px] text-fg3 font-mono">{entreprise?.nom} — Exercice {exercice?.annee}</div></div>
        <div className="flex items-center gap-2">
          {!locked && !demo && (
            <button onClick={() => setShowImport(!showImport)} className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-border text-fg2 hover:bg-bg3">
              {showImport ? '✕' : '📂 Import CSV'}
            </button>
          )}
          <button onClick={() => exportBalanceCsv(rows, `balance_${exercice?.annee}`)} className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-border text-fg2 hover:bg-bg3">
            📥 Export CSV
          </button>
        </div>
      </div>
      <div className="p-5">
        {showImport && <ImportCsvModal onImport={handleImport} onClose={() => setShowImport(false)} />}

        {!demo && <ControleBalance entrepriseId={entreprise?.id} exerciceId={exercice?.id} />}

        <div className={`rounded-lg px-4 py-2 mb-4 text-center font-bold text-[11px] ${eqInit && eqMvt && eqFin ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
          {eqInit && eqMvt && eqFin ? '✓ BALANCE ÉQUILIBRÉE' : '⚠ BALANCE DÉSÉQUILIBRÉE'}
          {!eqInit && ` — Écart soldes initiaux: ${fmt(Math.abs(T.sd - T.sc))}`}
          {!eqMvt && ` — Écart mouvements: ${fmt(Math.abs(T.md - T.mc))}`}
          {!eqFin && ` — Écart soldes finaux: ${fmt(Math.abs(T.sfd - T.sfc))}`}
        </div>

        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Balance des comptes — {rows.length} ligne(s)</span>
            <input className="bg-bg3 border border-border rounded-md px-2.5 py-1 text-[11px] text-foreground outline-none focus:border-primary w-40" placeholder="N° ou libellé..." value={filter} onChange={e => setFilter(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr>
                {['N° Compte', 'Intitulé', 'Sol.Init.D', 'Sol.Init.C', 'Mvt.Débit', 'Mvt.Crédit', 'Sol.Fin D', 'Sol.Fin C'].map(h => (
                  <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[1px] font-mono border-b border-border whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.compte} className="hover:bg-[rgba(56,189,248,.02)]">
                    <td className="px-3 py-1.5 text-[11px] text-primary font-bold font-mono border-b border-border/50">{r.compte}</td>
                    <td className="px-3 py-1.5 text-[11px] border-b border-border/50">{r.intitule}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50">{r.sd ? fmt(r.sd) : '—'}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right border-b border-border/50">{r.sc ? fmt(r.sc) : '—'}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right text-primary border-b border-border/50">{r.md ? fmt(r.md) : '—'}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right text-success border-b border-border/50">{r.mc ? fmt(r.mc) : '—'}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right text-primary border-b border-border/50">{r.sfd ? fmt(r.sfd) : '—'}</td>
                    <td className="px-3 py-1.5 text-[11px] font-mono text-right text-success border-b border-border/50">{r.sfc ? fmt(r.sfc) : '—'}</td>
                  </tr>
                ))}
                <tr className="bg-bg3 font-bold">
                  <td colSpan={2} className="px-3 py-1.5 text-[11px] border-t border-border-2">TOTAUX ({rows.length} comptes)</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right border-t border-border-2">{fmt(T.sd)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right border-t border-border-2">{fmt(T.sc)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-primary border-t border-border-2">{fmt(T.md)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-success border-t border-border-2">{fmt(T.mc)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-primary border-t border-border-2">{fmt(T.sfd)}</td>
                  <td className="px-3 py-1.5 text-[11px] font-mono text-right text-success border-t border-border-2">{fmt(T.sfc)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
