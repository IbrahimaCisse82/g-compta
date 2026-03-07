import { useState, useMemo } from 'react';
import { useApp } from '@/stores/app-store';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';

const fmt = (n: number) => n ? n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '';

export default function GrandLivrePage() {
  const { journal, balance, exercice } = useApp();
  const [search, setSearch] = useState('');
  const [openAccounts, setOpenAccounts] = useState<Set<string>>(new Set());

  // Group journal entries by account, sorted by account number
  const accounts = useMemo(() => {
    const map = new Map<string, { compte: string; intitule: string; entries: typeof journal; balLine: typeof balance[0] | undefined }>();

    // Build from balance (includes accounts with only opening balances)
    for (const b of balance) {
      if (!map.has(b.compte)) {
        map.set(b.compte, { compte: b.compte, intitule: b.intitule, entries: [], balLine: b });
      }
    }

    // Add journal entries
    for (const j of journal) {
      if (!map.has(j.compte)) {
        map.set(j.compte, { compte: j.compte, intitule: j.intitule, entries: [], balLine: undefined });
      }
      map.get(j.compte)!.entries.push(j);
    }

    // Sort entries by date within each account
    for (const acc of map.values()) {
      acc.entries.sort((a, b) => a.date_ecriture.localeCompare(b.date_ecriture));
    }

    let result = Array.from(map.values()).sort((a, b) => a.compte.localeCompare(b.compte));

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a => a.compte.includes(q) || a.intitule.toLowerCase().includes(q));
    }

    return result;
  }, [journal, balance, search]);

  const toggleAccount = (compte: string) => {
    setOpenAccounts(prev => {
      const next = new Set(prev);
      next.has(compte) ? next.delete(compte) : next.add(compte);
      return next;
    });
  };

  const expandAll = () => setOpenAccounts(new Set(accounts.map(a => a.compte)));
  const collapseAll = () => setOpenAccounts(new Set());

  // Compute running balance for an account
  const computeRunning = (acc: typeof accounts[0]) => {
    const sd = acc.balLine?.sd || 0;
    const sc = acc.balLine?.sc || 0;
    let solde = sd - sc; // positive = debit balance
    const rows: { entry: typeof journal[0]; solde: number }[] = [];
    for (const e of acc.entries) {
      solde += (e.debit || 0) - (e.credit || 0);
      rows.push({ entry: e, solde });
    }
    return { openingSolde: sd - sc, rows, closingSolde: solde };
  };

  const totalDebit = balance.reduce((s, b) => s + (b.md || 0), 0);
  const totalCredit = balance.reduce((s, b) => s + (b.mc || 0), 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">📖 Grand Livre</h1>
          <p className="text-xs text-muted-foreground">Exercice {exercice?.annee} — Détail des mouvements par compte</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono">{accounts.length} comptes</span>
          <button onClick={expandAll} className="px-2 py-1 text-[10px] border border-border rounded hover:bg-muted">Tout ouvrir</button>
          <button onClick={collapseAll} className="px-2 py-1 text-[10px] border border-border rounded hover:bg-muted">Tout fermer</button>
        </div>
      </div>

      <Input
        placeholder="Rechercher un compte (numéro ou intitulé)..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm h-8 text-xs"
      />

      {/* Summary bar */}
      <div className="flex gap-4 text-xs font-mono">
        <span className="px-3 py-1.5 bg-muted rounded">Total Débit: <strong className="text-primary">{fmt(totalDebit)}</strong></span>
        <span className="px-3 py-1.5 bg-muted rounded">Total Crédit: <strong className="text-primary">{fmt(totalCredit)}</strong></span>
      </div>

      <ScrollArea className="h-[calc(100vh-220px)]">
        <div className="space-y-1">
          {accounts.map(acc => {
            const isOpen = openAccounts.has(acc.compte);
            const { openingSolde, rows, closingSolde } = computeRunning(acc);
            const totalD = acc.entries.reduce((s, e) => s + (e.debit || 0), 0);
            const totalC = acc.entries.reduce((s, e) => s + (e.credit || 0), 0);

            return (
              <Collapsible key={acc.compte} open={isOpen} onOpenChange={() => toggleAccount(acc.compte)}>
                <CollapsibleTrigger asChild>
                  <button className={`w-full flex items-center justify-between px-3 py-2 rounded border text-xs transition-colors ${
                    isOpen ? 'bg-primary/5 border-primary/20' : 'bg-muted/50 border-border hover:bg-muted'
                  }`}>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground">{isOpen ? '▼' : '▶'}</span>
                      <span className="font-mono font-bold text-primary">{acc.compte}</span>
                      <span className="text-foreground">{acc.intitule}</span>
                      <span className="text-[10px] text-muted-foreground">({acc.entries.length} mvt{acc.entries.length > 1 ? 's' : ''})</span>
                    </div>
                    <div className="flex items-center gap-4 font-mono text-[11px]">
                      <span>D: {fmt(totalD)}</span>
                      <span>C: {fmt(totalC)}</span>
                      <span className={`font-bold ${closingSolde >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        Solde: {fmt(Math.abs(closingSolde))} {closingSolde >= 0 ? 'D' : 'C'}
                      </span>
                    </div>
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="ml-4 mr-1 mb-2 border border-border rounded overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-[10px] w-24">Date</TableHead>
                          <TableHead className="text-[10px] w-16">Pièce</TableHead>
                          <TableHead className="text-[10px] w-14">Jrn</TableHead>
                          <TableHead className="text-[10px]">Libellé</TableHead>
                          <TableHead className="text-[10px] text-right w-28">Débit</TableHead>
                          <TableHead className="text-[10px] text-right w-28">Crédit</TableHead>
                          <TableHead className="text-[10px] text-right w-32">Solde</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* Opening balance row */}
                        {(acc.balLine?.sd || acc.balLine?.sc) ? (
                          <TableRow className="bg-muted/20">
                            <TableCell className="text-[10px] font-mono text-muted-foreground" colSpan={4}>
                              ↳ Solde d'ouverture (à-nouveaux)
                            </TableCell>
                            <TableCell className="text-[10px] text-right font-mono">{fmt(acc.balLine?.sd || 0)}</TableCell>
                            <TableCell className="text-[10px] text-right font-mono">{fmt(acc.balLine?.sc || 0)}</TableCell>
                            <TableCell className={`text-[10px] text-right font-mono font-bold ${openingSolde >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                              {fmt(Math.abs(openingSolde))} {openingSolde >= 0 ? 'D' : 'C'}
                            </TableCell>
                          </TableRow>
                        ) : null}

                        {rows.map(({ entry, solde }) => (
                          <TableRow key={entry.id} className="hover:bg-muted/30">
                            <TableCell className="text-[10px] font-mono">{entry.date_ecriture}</TableCell>
                            <TableCell className="text-[10px] font-mono">{entry.piece}</TableCell>
                            <TableCell className="text-[10px] font-mono">{entry.journal_code}</TableCell>
                            <TableCell className="text-[10px]">{entry.libelle}</TableCell>
                            <TableCell className="text-[10px] text-right font-mono">{fmt(entry.debit)}</TableCell>
                            <TableCell className="text-[10px] text-right font-mono">{fmt(entry.credit)}</TableCell>
                            <TableCell className={`text-[10px] text-right font-mono font-bold ${solde >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                              {fmt(Math.abs(solde))} {solde >= 0 ? 'D' : 'C'}
                            </TableCell>
                          </TableRow>
                        ))}

                        {/* Totals row */}
                        <TableRow className="bg-muted/40 font-bold">
                          <TableCell className="text-[10px]" colSpan={4}>Totaux</TableCell>
                          <TableCell className="text-[10px] text-right font-mono">{fmt(totalD)}</TableCell>
                          <TableCell className="text-[10px] text-right font-mono">{fmt(totalC)}</TableCell>
                          <TableCell className={`text-[10px] text-right font-mono ${closingSolde >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                            {fmt(Math.abs(closingSolde))} {closingSolde >= 0 ? 'D' : 'C'}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
