import { useState, useMemo } from 'react';
import { useApp } from '@/stores/app-store';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const fmt = (n: number) => n ? n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '';

const JOURNALS = [
  { code: '', label: 'Tous les journaux' },
  { code: 'AC', label: 'AC — Achats' },
  { code: 'VE', label: 'VE — Ventes' },
  { code: 'BQ', label: 'BQ — Banque' },
  { code: 'CA', label: 'CA — Caisse' },
  { code: 'OD', label: 'OD — Opérations Diverses' },
  { code: 'SA', label: 'SA — Salaires' },
  { code: 'AN', label: 'AN — À-Nouveau' },
];

function DateFilter({ value, onChange, label }: { value: Date | undefined; onChange: (d: Date | undefined) => void; label: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("h-8 text-xs justify-start font-normal w-[140px]", !value && "text-muted-foreground")}>
          📅 {value ? format(value, 'dd/MM/yyyy') : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className={cn("p-3 pointer-events-auto")} locale={fr} />
      </PopoverContent>
    </Popover>
  );
}

export default function GrandLivrePage() {
  const { journal, balance, exercice } = useApp();
  const [search, setSearch] = useState('');
  const [journalFilter, setJournalFilter] = useState('__all__');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [openAccounts, setOpenAccounts] = useState<Set<string>>(new Set());

  // Filter journal entries first
  const filteredJournal = useMemo(() => {
    let entries = journal;
    if (journalFilter && journalFilter !== '__all__') entries = entries.filter(j => j.journal_code === journalFilter);
    if (dateFrom) entries = entries.filter(j => j.date_ecriture >= format(dateFrom, 'yyyy-MM-dd'));
    if (dateTo) entries = entries.filter(j => j.date_ecriture <= format(dateTo, 'yyyy-MM-dd'));
    return entries;
  }, [journal, journalFilter, dateFrom, dateTo]);

  const hasFilters = (journalFilter && journalFilter !== '__all__') || dateFrom || dateTo;

  // Group journal entries by account
  const accounts = useMemo(() => {
    const map = new Map<string, { compte: string; intitule: string; entries: typeof journal; balLine: typeof balance[0] | undefined }>();

    // Build from balance (only if no journal filter active — otherwise only show accounts with matching entries)
    if (!hasFilters) {
      for (const b of balance) {
        if (!map.has(b.compte)) {
          map.set(b.compte, { compte: b.compte, intitule: b.intitule, entries: [], balLine: b });
        }
      }
    }

    for (const j of filteredJournal) {
      if (!map.has(j.compte)) {
        const balLine = balance.find(b => b.compte === j.compte);
        map.set(j.compte, { compte: j.compte, intitule: j.intitule, entries: [], balLine });
      }
      map.get(j.compte)!.entries.push(j);
    }

    for (const acc of map.values()) {
      acc.entries.sort((a, b) => a.date_ecriture.localeCompare(b.date_ecriture));
    }

    let result = Array.from(map.values()).sort((a, b) => a.compte.localeCompare(b.compte));

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a => a.compte.includes(q) || a.intitule.toLowerCase().includes(q));
    }

    return result;
  }, [filteredJournal, balance, search, hasFilters]);

  const toggleAccount = (compte: string) => {
    setOpenAccounts(prev => {
      const next = new Set(prev);
      next.has(compte) ? next.delete(compte) : next.add(compte);
      return next;
    });
  };

  const expandAll = () => setOpenAccounts(new Set(accounts.map(a => a.compte)));
  const collapseAll = () => setOpenAccounts(new Set());
  const clearFilters = () => { setJournalFilter('__all__'); setDateFrom(undefined); setDateTo(undefined); };

  const computeRunning = (acc: typeof accounts[0]) => {
    const sd = acc.balLine?.sd || 0;
    const sc = acc.balLine?.sc || 0;
    let solde = sd - sc;
    const rows: { entry: typeof journal[0]; solde: number }[] = [];
    for (const e of acc.entries) {
      solde += (e.debit || 0) - (e.credit || 0);
      rows.push({ entry: e, solde });
    }
    return { openingSolde: sd - sc, rows, closingSolde: solde };
  };

  const totalDebit = accounts.reduce((s, a) => s + a.entries.reduce((s2, e) => s2 + (e.debit || 0), 0), 0);
  const totalCredit = accounts.reduce((s, a) => s + a.entries.reduce((s2, e) => s2 + (e.credit || 0), 0), 0);

  // Detect unique journal codes in data for dynamic filter
  const uniqueJournals = useMemo(() => {
    const codes = new Set(journal.map(j => j.journal_code));
    return JOURNALS.filter(j => j.code === '' || codes.has(j.code));
  }, [journal]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">📖 Grand Livre</h1>
          <p className="text-xs text-muted-foreground">Exercice {exercice?.annee} — Détail des mouvements par compte</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono">{accounts.length} comptes · {filteredJournal.length} écritures</span>
          <button onClick={expandAll} className="px-2 py-1 text-[10px] border border-border rounded hover:bg-muted">Tout ouvrir</button>
          <button onClick={collapseAll} className="px-2 py-1 text-[10px] border border-border rounded hover:bg-muted">Tout fermer</button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Rechercher un compte..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-[200px] h-8 text-xs"
        />
        <Select value={journalFilter} onValueChange={setJournalFilter}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Tous les journaux" />
          </SelectTrigger>
          <SelectContent>
            {uniqueJournals.map(j => (
              <SelectItem key={j.code} value={j.code || '__all__'} className="text-xs">{j.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateFilter value={dateFrom} onChange={setDateFrom} label="Date début" />
        <DateFilter value={dateTo} onChange={setDateTo} label="Date fin" />
        {hasFilters && (
          <button onClick={clearFilters} className="px-2 py-1 text-[10px] text-destructive border border-destructive/30 rounded hover:bg-destructive/10">
            ✕ Réinitialiser
          </button>
        )}
      </div>

      {/* Summary bar */}
      <div className="flex gap-4 text-xs font-mono">
        <span className="px-3 py-1.5 bg-muted rounded">Total Débit: <strong className="text-primary">{fmt(totalDebit)}</strong></span>
        <span className="px-3 py-1.5 bg-muted rounded">Total Crédit: <strong className="text-primary">{fmt(totalCredit)}</strong></span>
      </div>

      <ScrollArea className="h-[calc(100vh-260px)]">
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
