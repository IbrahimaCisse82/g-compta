import { useState, useMemo, useRef } from 'react';
import { useApp } from '@/stores/app-store';
import { fmt, pf } from '@/lib/accounting';
import { toast } from 'sonner';

interface ReleveRow {
  date: string;
  libelle: string;
  debit: number;
  credit: number;
  matched: boolean;
  matchedJournalId?: string;
}

export default function RapprochementPage() {
  const { journal, balance, exercice, entreprise } = useApp();
  const [releve, setReleve] = useState<ReleveRow[]>([]);
  const [compteFilter, setCompteFilter] = useState('521100');
  const [showImport, setShowImport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Bank journal entries
  const bankEntries = useMemo(() => {
    return journal
      .filter(j => j.compte.startsWith(compteFilter.slice(0, 3)))
      .sort((a, b) => a.date_ecriture.localeCompare(b.date_ecriture));
  }, [journal, compteFilter]);

  const matchedJournalIds = useMemo(() => new Set(releve.filter(r => r.matchedJournalId).map(r => r.matchedJournalId!)), [releve]);

  // Bank balance
  const bankBalance = useMemo(() => {
    const b = balance.find(bl => bl.compte === compteFilter);
    return b ? (b.sfd || 0) - (b.sfc || 0) : 0;
  }, [balance, compteFilter]);

  const releveTotal = useMemo(() => {
    return releve.reduce((s, r) => s + (r.debit || 0) - (r.credit || 0), 0);
  }, [releve]);

  const unmatchedReleve = releve.filter(r => !r.matched);
  const unmatchedJournal = bankEntries.filter(j => !matchedJournalIds.has(j.id));

  const ecart = bankBalance - releveTotal;

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast.error('Fichier vide ou invalide'); return; }
      const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
      const rows = lines.slice(1).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, '').trim()));

      const parsed: ReleveRow[] = rows.filter(r => r.length >= 3 && r[0]).map(r => {
        // Try formats: Date,Libellé,Débit,Crédit or Date,Libellé,Montant
        const date = r[0];
        const libelle = r[1] || '';
        let debit = 0, credit = 0;
        if (r.length >= 4) {
          debit = pf(r[2] || '0');
          credit = pf(r[3] || '0');
        } else {
          const montant = pf(r[2] || '0');
          if (montant > 0) debit = montant; else credit = -montant;
        }
        return { date, libelle, debit, credit, matched: false };
      });

      if (parsed.length === 0) { toast.error('Aucune ligne valide'); return; }
      setReleve(parsed);
      setShowImport(false);
      toast.success(`${parsed.length} lignes importées du relevé bancaire`);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const autoMatch = () => {
    const updated = [...releve];
    let count = 0;
    for (const r of updated) {
      if (r.matched) continue;
      // Try to find a matching journal entry by amount and approximate date
      const montant = (r.debit || 0) - (r.credit || 0);
      const match = bankEntries.find(j => {
        if (matchedJournalIds.has(j.id)) return false;
        const jMontant = (j.debit || 0) - (j.credit || 0);
        if (Math.abs(jMontant - montant) > 0.01) return false;
        // Date within 5 days
        const daysDiff = Math.abs(new Date(r.date).getTime() - new Date(j.date_ecriture).getTime()) / 86400000;
        return daysDiff <= 5;
      });
      if (match) {
        r.matched = true;
        r.matchedJournalId = match.id;
        matchedJournalIds.add(match.id);
        count++;
      }
    }
    setReleve(updated);
    toast.success(`${count} rapprochement(s) automatique(s)`);
  };

  const manualMatch = (releveIdx: number, journalId: string) => {
    const updated = [...releve];
    updated[releveIdx].matched = true;
    updated[releveIdx].matchedJournalId = journalId;
    setReleve(updated);
  };

  const unmatch = (releveIdx: number) => {
    const updated = [...releve];
    updated[releveIdx].matched = false;
    updated[releveIdx].matchedJournalId = undefined;
    setReleve(updated);
  };

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">Rapprochement Bancaire</div>
          <div className="text-[10px] text-fg3 font-mono">{entreprise?.nom} — Exercice {exercice?.annee}</div>
        </div>
        <div className="flex items-center gap-2">
          <select value={compteFilter} onChange={e => setCompteFilter(e.target.value)}
            className="bg-bg3 border border-border rounded px-2 py-1 text-[11px] text-foreground font-mono outline-none focus:border-primary">
            {balance.filter(b => b.compte.startsWith('52')).map(b => (
              <option key={b.compte} value={b.compte}>{b.compte} — {b.intitule}</option>
            ))}
          </select>
          <button onClick={() => setShowImport(!showImport)} className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-border text-fg2 hover:bg-bg3">
            📂 Import Relevé
          </button>
          {releve.length > 0 && (
            <button onClick={autoMatch} className="px-3 py-1.5 rounded-md text-[11px] font-bold bg-primary text-primary-foreground hover:opacity-90">
              ⚡ Rapprochement Auto
            </button>
          )}
        </div>
      </div>
      <div className="p-5">
        {/* Import panel */}
        {showImport && (
          <div className="bg-bg2 border border-border rounded-lg p-4 mb-4">
            <div className="font-bold text-sm text-primary mb-2">📂 Import Relevé Bancaire CSV</div>
            <p className="text-[10px] text-fg3 mb-3">Format : <code className="bg-bg3 px-1 rounded">Date;Libellé;Débit;Crédit</code> ou <code className="bg-bg3 px-1 rounded">Date;Libellé;Montant</code></p>
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" onChange={handleImportCsv} className="text-xs text-fg2" />
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[9px] text-fg3 uppercase tracking-[1px] font-mono">Solde Comptable</div>
            <div className={`text-lg font-bold font-mono ${bankBalance >= 0 ? 'text-success' : 'text-destructive'}`}>{fmt(bankBalance)}</div>
          </div>
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[9px] text-fg3 uppercase tracking-[1px] font-mono">Solde Relevé</div>
            <div className="text-lg font-bold font-mono text-primary">{releve.length ? fmt(releveTotal) : '—'}</div>
          </div>
          <div className={`bg-bg2 border rounded-lg p-3 ${Math.abs(ecart) < 1 ? 'border-success/30' : 'border-destructive/30'}`}>
            <div className="text-[9px] text-fg3 uppercase tracking-[1px] font-mono">Écart</div>
            <div className={`text-lg font-bold font-mono ${Math.abs(ecart) < 1 ? 'text-success' : 'text-destructive'}`}>
              {releve.length ? fmt(ecart) : '—'}
            </div>
          </div>
          <div className="bg-bg2 border border-border rounded-lg p-3">
            <div className="text-[9px] text-fg3 uppercase tracking-[1px] font-mono">Rapprochés</div>
            <div className="text-lg font-bold font-mono text-accent">
              {releve.filter(r => r.matched).length} / {releve.length}
            </div>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Non-rapprochés côté relevé */}
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-border bg-accent/5">
              <span className="text-xs font-bold text-accent">🏦 Relevé Bancaire — Non rapprochés ({unmatchedReleve.length})</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full border-collapse">
                <thead><tr>
                  {['Date', 'Libellé', 'Débit', 'Crédit', ''].map(h => (
                    <th key={h} className="bg-bg3 px-2 py-1 text-left text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {releve.map((r, i) => (
                    <tr key={i} className={r.matched ? 'opacity-30' : 'hover:bg-[rgba(56,189,248,.02)]'}>
                      <td className="px-2 py-1 text-[10px] font-mono border-b border-border/30">{r.date}</td>
                      <td className="px-2 py-1 text-[10px] border-b border-border/30 truncate max-w-[150px]">{r.libelle}</td>
                      <td className="px-2 py-1 text-[10px] font-mono text-right text-primary border-b border-border/30">{r.debit ? fmt(r.debit) : ''}</td>
                      <td className="px-2 py-1 text-[10px] font-mono text-right text-success border-b border-border/30">{r.credit ? fmt(r.credit) : ''}</td>
                      <td className="px-2 py-1 border-b border-border/30">
                        {r.matched ? (
                          <button onClick={() => unmatch(i)} className="text-[9px] text-destructive">✕</button>
                        ) : (
                          <span className="text-[9px] text-fg3">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {releve.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-fg3 text-xs">Importez un relevé CSV pour commencer</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Non-rapprochés côté journal */}
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-border bg-primary/5">
              <span className="text-xs font-bold text-primary">📋 Journal Comptable — Non rapprochés ({unmatchedJournal.length})</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full border-collapse">
                <thead><tr>
                  {['Date', 'Pièce', 'Libellé', 'Débit', 'Crédit'].map(h => (
                    <th key={h} className="bg-bg3 px-2 py-1 text-left text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {unmatchedJournal.map(j => (
                    <tr key={j.id} className="hover:bg-[rgba(56,189,248,.02)]">
                      <td className="px-2 py-1 text-[10px] font-mono border-b border-border/30">{j.date_ecriture}</td>
                      <td className="px-2 py-1 text-[10px] font-mono border-b border-border/30">
                        <span className="bg-[rgba(56,189,248,.12)] text-primary rounded px-1 py-0.5 text-[8px] font-bold">{j.piece}</span>
                      </td>
                      <td className="px-2 py-1 text-[10px] border-b border-border/30 truncate max-w-[150px]">{j.libelle}</td>
                      <td className="px-2 py-1 text-[10px] font-mono text-right text-primary border-b border-border/30">{j.debit ? fmt(j.debit) : ''}</td>
                      <td className="px-2 py-1 text-[10px] font-mono text-right text-success border-b border-border/30">{j.credit ? fmt(j.credit) : ''}</td>
                    </tr>
                  ))}
                  {unmatchedJournal.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-4 text-center text-fg3 text-xs">Toutes les écritures sont rapprochées ✓</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
