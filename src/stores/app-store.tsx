import React, { createContext, useContext, useState, useCallback } from 'react';
import type { BalanceLine, JournalLine, PlanCompte, Entreprise, Exercice } from '@/lib/accounting';
import { supabase } from '@/integrations/supabase/client';
import { DEMO_ENTREPRISE, DEMO_EXERCICE, DEMO_LBH_BALANCE, DEMO_LBH_JOURNAL, buildPlan } from '@/lib/demo-data';
import { toast } from 'sonner';

export type EnvMode = 'entreprise' | 'cabinet';
export type PageId = 'dashboard' | 'clients' | 'journal' | 'balance' | 'grandlivre' | 'bilan' | 'resultat' | 'tft' | 'note34' | 'liasse' | 'rapprochement' | 'saisie' | 'plan' | 'exercices' | 'parametres';

interface AppState {
  env: EnvMode;
  demo: boolean;
  launched: boolean;
  loading: boolean;
  currentPage: PageId;
  entreprise: Entreprise | null;
  exercice: Exercice | null;
  exercices: Exercice[];
  balance: BalanceLine[];
  balanceN1: BalanceLine[];
  journal: JournalLine[];
  plan: PlanCompte[];
  entreprises: Entreprise[];
  setPage: (page: PageId) => void;
  launchDemo: (env: EnvMode) => void;
  logout: () => void;
  addJournalEntry: (lines: JournalLine[]) => void;
  deleteJournalEntry: (id: string) => void;
  addCompte: (c: PlanCompte) => void;
  deleteCompte: (id: string) => void;
  toggleCompte: (id: string) => void;
  addExercice: (e: Exercice) => void;
  deleteExercice: (id: string) => void;
  openExercice: (id: string) => void;
  updateEntreprise: (updates: Partial<Entreprise>) => void;
  clotureExercice: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

const DEMO_ENTREPRISE_ID = 'a0000000-0000-0000-0000-000000000001';
const DEMO_EXERCICE_ID = 'b0000000-0000-0000-0000-000000000001';

function mapEntreprise(data: any): Entreprise {
  return {
    id: data.id, nom: data.nom, sigle: data.sigle || '',
    ninea: data.ninea || '', rccm: data.rccm || '', tel: data.tel || '',
    adresse: data.adresse || '', forme_juridique: data.forme_juridique || '',
    secteur: data.secteur || '', monnaie: data.monnaie || 'FCFA',
  };
}

function mapExercice(data: any): Exercice {
  return {
    id: data.id, entreprise_id: data.entreprise_id,
    annee: data.annee, date_debut: data.date_debut,
    date_fin: data.date_fin, statut: data.statut as 'en_cours' | 'cloture',
  };
}

function mapBalance(data: any[]): BalanceLine[] {
  return data.map(d => ({
    id: d.id, exercice_id: d.exercice_id, entreprise_id: d.entreprise_id,
    compte: d.compte, intitule: d.intitule,
    sd: Number(d.sd), sc: Number(d.sc), md: Number(d.md), mc: Number(d.mc),
    sfd: Number(d.sfd), sfc: Number(d.sfc),
  }));
}

function mapJournal(data: any[]): JournalLine[] {
  return data.map(d => ({
    id: d.id, exercice_id: d.exercice_id, entreprise_id: d.entreprise_id,
    date_ecriture: d.date_ecriture, piece: d.piece, journal_code: d.journal_code,
    libelle: d.libelle, compte: d.compte, intitule: d.intitule,
    debit: Number(d.debit), credit: Number(d.credit),
  }));
}

function mapPlan(data: any[]): PlanCompte[] {
  return data.map(d => ({
    id: d.id, entreprise_id: d.entreprise_id, numero: d.numero,
    intitule: d.intitule, classe: d.classe, sens: d.sens,
    type_compte: d.type_compte, actif: d.actif,
  }));
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [env, setEnv] = useState<EnvMode>('entreprise');
  const [demo, setDemo] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null);
  const [exercice, setExercice] = useState<Exercice | null>(null);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [balance, setBalance] = useState<BalanceLine[]>([]);
  const [balanceN1, setBalanceN1] = useState<BalanceLine[]>([]);
  const [journal, setJournal] = useState<JournalLine[]>([]);
  const [plan, setPlan] = useState<PlanCompte[]>([]);
  const [entreprises, setEntreprises] = useState<Entreprise[]>([]);

  // Load N-1 balance for a given exercise
  const loadBalanceN1 = useCallback(async (exercicesList: Exercice[], currentExercice: Exercice) => {
    const prevExercice = exercicesList
      .filter(e => e.annee < currentExercice.annee)
      .sort((a, b) => b.annee - a.annee)[0];
    if (!prevExercice) { setBalanceN1([]); return; }
    try {
      const { data } = await supabase.from('balance').select('*').eq('exercice_id', prevExercice.id);
      if (data) setBalanceN1(mapBalance(data));
      else setBalanceN1([]);
    } catch { setBalanceN1([]); }
  }, []);

  const launchDemo = useCallback(async (envMode: EnvMode) => {
    setEnv(envMode);
    setDemo(true);
    setLoading(true);
    setCurrentPage('dashboard');

    try {
      const [entRes, excsRes, balRes, jourRes, planRes] = await Promise.all([
        supabase.from('entreprises').select('*').eq('id', DEMO_ENTREPRISE_ID).single(),
        supabase.from('exercices').select('*').eq('entreprise_id', DEMO_ENTREPRISE_ID).order('annee', { ascending: false }),
        supabase.from('balance').select('*').eq('exercice_id', DEMO_EXERCICE_ID),
        supabase.from('journal').select('*').eq('exercice_id', DEMO_EXERCICE_ID).order('date_ecriture'),
        supabase.from('plan_comptable').select('*').eq('entreprise_id', DEMO_ENTREPRISE_ID).order('numero'),
      ]);

      if (entRes.data && excsRes.data && balRes.data && jourRes.data && planRes.data) {
        const ent = mapEntreprise(entRes.data);
        const allExercices = excsRes.data.map(mapExercice);
        // Pick the most recent en_cours, or fallback to first
        const currentExc = allExercices.find(e => e.statut === 'en_cours') || allExercices[0];
        
        // If current exercice differs from demo default, reload its data
        let balData = balRes.data;
        let jourData = jourRes.data;
        if (currentExc && currentExc.id !== DEMO_EXERCICE_ID) {
          const [b2, j2] = await Promise.all([
            supabase.from('balance').select('*').eq('exercice_id', currentExc.id),
            supabase.from('journal').select('*').eq('exercice_id', currentExc.id).order('date_ecriture'),
          ]);
          if (b2.data) balData = b2.data;
          if (j2.data) jourData = j2.data;
        }

        setEntreprise(ent);
        setExercice(currentExc);
        setExercices(allExercices);
        setBalance(mapBalance(balData));
        setJournal(mapJournal(jourData));
        setPlan(mapPlan(planRes.data));
        if (envMode === 'cabinet') setEntreprises([ent]);
        
        // Load N-1
        await loadBalanceN1(allExercices, currentExc);
        
        setLaunched(true);
        setLoading(false);
        return;
      }
    } catch {
      // Fallback to local demo data
    }

    setEntreprise(DEMO_ENTREPRISE);
    setExercice(DEMO_EXERCICE);
    setExercices([DEMO_EXERCICE]);
    setBalance([...DEMO_LBH_BALANCE]);
    setJournal([...DEMO_LBH_JOURNAL]);
    setPlan(buildPlan(DEMO_ENTREPRISE.id));
    setBalanceN1([]);
    if (envMode === 'cabinet') setEntreprises([DEMO_ENTREPRISE]);
    setLaunched(true);
    setLoading(false);
  }, [loadBalanceN1]);

  const logout = useCallback(() => {
    setLaunched(false);
    setDemo(false);
    setEntreprise(null);
    setExercice(null);
    setBalance([]);
    setBalanceN1([]);
    setJournal([]);
    setPlan([]);
    setCurrentPage('dashboard');
  }, []);

  const addJournalEntry = useCallback(async (lines: JournalLine[]) => {
    if (!exercice || !entreprise) return;

    // 1. Persist journal lines to DB
    const inserts = lines.map(l => ({
      exercice_id: exercice.id,
      entreprise_id: entreprise.id,
      date_ecriture: l.date_ecriture,
      piece: l.piece,
      journal_code: l.journal_code,
      libelle: l.libelle,
      compte: l.compte,
      intitule: l.intitule,
      debit: l.debit || 0,
      credit: l.credit || 0,
    }));
    const { data: savedLines, error: journalErr } = await supabase.from('journal').insert(inserts).select();
    if (journalErr) { toast.error('Erreur enregistrement écriture: ' + journalErr.message); return; }

    const newLines = mapJournal(savedLines);
    setJournal(prev => [...prev, ...newLines]);

    // 2. Update balance in DB — upsert per account
    const balUpdates: Record<string, { debit: number; credit: number; intitule: string }> = {};
    for (const l of newLines) {
      if (!balUpdates[l.compte]) balUpdates[l.compte] = { debit: 0, credit: 0, intitule: l.intitule };
      balUpdates[l.compte].debit += l.debit || 0;
      balUpdates[l.compte].credit += l.credit || 0;
    }

    setBalance(prev => {
      const b = [...prev];
      const dbOps: Promise<any>[] = [];

      for (const [compte, delta] of Object.entries(balUpdates)) {
        let existing = b.find(x => x.compte === compte);
        if (existing) {
          existing.md += delta.debit;
          existing.mc += delta.credit;
          const net = (existing.sd || 0) + existing.md - ((existing.sc || 0) + existing.mc);
          existing.sfd = net > 0 ? net : 0;
          existing.sfc = net < 0 ? -net : 0;
          dbOps.push(supabase.from('balance').update({ md: existing.md, mc: existing.mc, sfd: existing.sfd, sfc: existing.sfc }).eq('id', existing.id).then() as Promise<any>);
        } else {
          const newBal: BalanceLine = {
            id: `temp-${Date.now()}-${compte}`,
            exercice_id: exercice.id,
            entreprise_id: entreprise.id,
            compte, intitule: delta.intitule,
            sd: 0, sc: 0, md: delta.debit, mc: delta.credit,
            sfd: delta.debit > delta.credit ? delta.debit - delta.credit : 0,
            sfc: delta.credit > delta.debit ? delta.credit - delta.debit : 0,
          };
          b.push(newBal);
          dbOps.push(
            supabase.from('balance').insert({
              exercice_id: exercice.id, entreprise_id: entreprise.id,
              compte, intitule: delta.intitule,
              sd: 0, sc: 0, md: delta.debit, mc: delta.credit,
              sfd: newBal.sfd, sfc: newBal.sfc,
            }).select().single().then(({ data }) => { if (data) newBal.id = data.id; }) as Promise<any>
          );
        }
      }
      Promise.all(dbOps).catch(e => toast.error('Erreur mise à jour balance: ' + e.message));
      return b;
    });

    toast.success(`${newLines.length} ligne(s) enregistrée(s)`);
  }, [exercice, entreprise]);

  const deleteJournalEntry = useCallback(async (id: string) => {
    const entry = journal.find(j => j.id === id);
    if (!entry) return;

    const { error } = await supabase.from('journal').delete().eq('id', id);
    if (error) { toast.error('Erreur suppression: ' + error.message); return; }

    setJournal(prev => prev.filter(j => j.id !== id));

    // Update balance: subtract this entry's amounts
    setBalance(prev => {
      const b = [...prev];
      const existing = b.find(x => x.compte === entry.compte);
      if (existing) {
        existing.md -= entry.debit || 0;
        existing.mc -= entry.credit || 0;
        const net = (existing.sd || 0) + existing.md - ((existing.sc || 0) + existing.mc);
        existing.sfd = net > 0 ? net : 0;
        existing.sfc = net < 0 ? -net : 0;
        supabase.from('balance').update({ md: existing.md, mc: existing.mc, sfd: existing.sfd, sfc: existing.sfc }).eq('id', existing.id);
      }
      return b;
    });

    toast.success('Écriture supprimée');
  }, [journal]);

  const addCompte = useCallback((c: PlanCompte) => {
    setPlan(prev => [...prev, c]);
  }, []);

  const deleteCompte = useCallback((id: string) => {
    setPlan(prev => prev.filter(p => p.id !== id));
  }, []);

  const toggleCompte = useCallback((id: string) => {
    setPlan(prev => prev.map(p => p.id === id ? { ...p, actif: !p.actif } : p));
  }, []);

  const addExercice = useCallback((e: Exercice) => {
    setExercices(prev => [...prev, e]);
  }, []);

  const deleteExercice = useCallback((id: string) => {
    setExercices(prev => prev.filter(e => e.id !== id));
  }, []);

  const openExercice = useCallback(async (id: string) => {
    setExercices(prev => {
      const e = prev.find(x => x.id === id);
      if (e) {
        setExercice(e);
        // Load balance & journal for this exercice
        (async () => {
          setLoading(true);
          try {
            const [balRes, jourRes] = await Promise.all([
              supabase.from('balance').select('*').eq('exercice_id', id),
              supabase.from('journal').select('*').eq('exercice_id', id).order('date_ecriture'),
            ]);
            if (balRes.data) setBalance(mapBalance(balRes.data));
            if (jourRes.data) setJournal(mapJournal(jourRes.data));
            // Load N-1
            await loadBalanceN1(prev, e);
          } catch { /* keep current data */ }
          setLoading(false);
        })();
      }
      return prev;
    });
  }, [loadBalanceN1]);

  const updateEntreprise = useCallback((updates: Partial<Entreprise>) => {
    setEntreprise(prev => prev ? { ...prev, ...updates } : prev);
  }, []);

  // ─── CLÔTURE D'EXERCICE ──────────────────────────────
  const clotureExercice = useCallback(async () => {
    if (!exercice || !entreprise) return;
    
    setLoading(true);
    try {
      // 1. Mark current exercice as clôturé
      await supabase.from('exercices').update({ statut: 'cloture' }).eq('id', exercice.id);

      // 2. Create new exercice N+1
      const newAnnee = exercice.annee + 1;
      const newDebut = `${newAnnee}-01-01`;
      const newFin = `${newAnnee}-12-31`;
      const { data: newExcData, error: excErr } = await supabase.from('exercices').insert({
        entreprise_id: entreprise.id,
        annee: newAnnee,
        date_debut: newDebut,
        date_fin: newFin,
        statut: 'en_cours',
      }).select().single();
      if (excErr || !newExcData) throw excErr || new Error('Erreur création exercice');

      const newExercice = mapExercice(newExcData);

      // 3. Generate à-nouveaux: carry forward bilan accounts (classes 1-5)
      // Résultat accounts (6-8) are zeroed out
      // Net result goes to Report à Nouveau (131/139)
      const bilanAccounts = balance.filter(b => /^[1-5]/.test(b.compte));
      const resultatNet = balance
        .filter(b => /^[6-8]/.test(b.compte))
        .reduce((sum, b) => sum + ((b.sfc || 0) - (b.sfd || 0)), 0);

      const aNouveaux: any[] = [];

      for (const b of bilanAccounts) {
        const soldeNet = (b.sfd || 0) - (b.sfc || 0);
        if (Math.abs(soldeNet) < 0.01) continue;
        aNouveaux.push({
          exercice_id: newExercice.id,
          entreprise_id: entreprise.id,
          compte: b.compte,
          intitule: b.intitule,
          sd: soldeNet > 0 ? soldeNet : 0,
          sc: soldeNet < 0 ? -soldeNet : 0,
          md: 0, mc: 0,
          sfd: soldeNet > 0 ? soldeNet : 0,
          sfc: soldeNet < 0 ? -soldeNet : 0,
        });
      }

      // Post résultat net to Report à Nouveau (compte 131)
      if (Math.abs(resultatNet) > 0.01) {
        const existingRAN = aNouveaux.find(a => a.compte === '131000');
        if (existingRAN) {
          const newSolde = (existingRAN.sc - existingRAN.sd) + resultatNet;
          existingRAN.sd = newSolde < 0 ? -newSolde : 0;
          existingRAN.sc = newSolde > 0 ? newSolde : 0;
          existingRAN.sfd = existingRAN.sd;
          existingRAN.sfc = existingRAN.sc;
        } else {
          aNouveaux.push({
            exercice_id: newExercice.id,
            entreprise_id: entreprise.id,
            compte: '131000',
            intitule: 'Report à nouveau',
            sd: resultatNet < 0 ? -resultatNet : 0,
            sc: resultatNet > 0 ? resultatNet : 0,
            md: 0, mc: 0,
            sfd: resultatNet < 0 ? -resultatNet : 0,
            sfc: resultatNet > 0 ? resultatNet : 0,
          });
        }
      }

      // 4. Insert à-nouveaux balance into DB
      if (aNouveaux.length > 0) {
        const { error: balErr } = await supabase.from('balance').insert(aNouveaux);
        if (balErr) throw balErr;
      }

      // 5. Generate à-nouveaux journal entries
      const aNouveauxJournal: any[] = [];
      for (const an of aNouveaux) {
        if (an.sd > 0) {
          aNouveauxJournal.push({
            exercice_id: newExercice.id,
            entreprise_id: entreprise.id,
            date_ecriture: newDebut,
            piece: 'AN',
            journal_code: 'AN',
            libelle: 'À-nouveau',
            compte: an.compte,
            intitule: an.intitule,
            debit: an.sd,
            credit: 0,
          });
        }
        if (an.sc > 0) {
          aNouveauxJournal.push({
            exercice_id: newExercice.id,
            entreprise_id: entreprise.id,
            date_ecriture: newDebut,
            piece: 'AN',
            journal_code: 'AN',
            libelle: 'À-nouveau',
            compte: an.compte,
            intitule: an.intitule,
            debit: 0,
            credit: an.sc,
          });
        }
      }
      if (aNouveauxJournal.length > 0) {
        await supabase.from('journal').insert(aNouveauxJournal);
      }

      // 6. Update local state
      const updatedCurrent = { ...exercice, statut: 'cloture' as const };
      setExercices(prev => {
        const updated = prev.map(e => e.id === exercice.id ? updatedCurrent : e);
        return [...updated, newExercice];
      });
      
      // Save current balance as N-1 before switching
      setBalanceN1(balance);
      
      // Switch to new exercice
      setExercice(newExercice);
      setBalance(mapBalance(aNouveaux.map((a, i) => ({ ...a, id: `an-${i}` }))));
      setJournal(mapJournal(aNouveauxJournal.map((j, i) => ({ ...j, id: `anj-${i}` }))));

      toast.success(`Exercice ${exercice.annee} clôturé. Exercice ${newAnnee} créé avec les à-nouveaux.`);
    } catch (err: any) {
      toast.error('Erreur lors de la clôture: ' + (err?.message || 'Erreur inconnue'));
    }
    setLoading(false);
  }, [exercice, entreprise, balance]);

  return (
    <AppContext.Provider value={{
      env, demo, launched, loading, currentPage, entreprise, exercice, exercices,
      balance, balanceN1, journal, plan, entreprises,
      setPage: setCurrentPage, launchDemo, logout, addJournalEntry,
      deleteJournalEntry, addCompte, deleteCompte, toggleCompte,
      addExercice, deleteExercice, openExercice, updateEntreprise,
      clotureExercice,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
