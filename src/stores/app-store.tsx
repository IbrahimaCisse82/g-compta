import React, { createContext, useContext, useState, useCallback } from 'react';
import type { BalanceLine, JournalLine, PlanCompte, Entreprise, Exercice } from '@/lib/accounting';
import { DEMO_ENTREPRISE, DEMO_EXERCICE, DEMO_LBH_BALANCE, DEMO_LBH_JOURNAL, buildPlan } from '@/lib/demo-data';

export type EnvMode = 'entreprise' | 'cabinet';
export type PageId = 'dashboard' | 'clients' | 'journal' | 'balance' | 'grandlivre' | 'bilan' | 'resultat' | 'tft' | 'note34' | 'liasse' | 'rapprochement' | 'saisie' | 'plan' | 'exercices' | 'parametres';

interface AppState {
  env: EnvMode;
  demo: boolean;
  launched: boolean;
  currentPage: PageId;
  entreprise: Entreprise | null;
  exercice: Exercice | null;
  exercices: Exercice[];
  balance: BalanceLine[];
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
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [env, setEnv] = useState<EnvMode>('entreprise');
  const [demo, setDemo] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null);
  const [exercice, setExercice] = useState<Exercice | null>(null);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [balance, setBalance] = useState<BalanceLine[]>([]);
  const [journal, setJournal] = useState<JournalLine[]>([]);
  const [plan, setPlan] = useState<PlanCompte[]>([]);
  const [entreprises, setEntreprises] = useState<Entreprise[]>([]);

  const launchDemo = useCallback((envMode: EnvMode) => {
    setEnv(envMode);
    setDemo(true);
    setEntreprise(DEMO_ENTREPRISE);
    setExercice(DEMO_EXERCICE);
    setExercices([DEMO_EXERCICE]);
    setBalance([...DEMO_LBH_BALANCE]);
    setJournal([...DEMO_LBH_JOURNAL]);
    setPlan(buildPlan(DEMO_ENTREPRISE.id));
    if (envMode === 'cabinet') setEntreprises([DEMO_ENTREPRISE]);
    setCurrentPage('dashboard');
    setLaunched(true);
  }, []);

  const logout = useCallback(() => {
    setLaunched(false);
    setDemo(false);
    setEntreprise(null);
    setExercice(null);
    setBalance([]);
    setJournal([]);
    setPlan([]);
    setCurrentPage('dashboard');
  }, []);

  const addJournalEntry = useCallback((lines: JournalLine[]) => {
    setJournal(prev => [...prev, ...lines]);
    // Update balance
    setBalance(prev => {
      const b = [...prev];
      for (const r of lines) {
        let existing = b.find(x => x.compte === r.compte);
        if (!existing) {
          existing = { compte: r.compte, intitule: r.intitule, sd: 0, sc: 0, md: 0, mc: 0, sfd: 0, sfc: 0, id: `bal-${Date.now()}-${r.compte}`, exercice_id: r.exercice_id, entreprise_id: r.entreprise_id };
          b.push(existing);
        }
        existing.md += r.debit || 0;
        existing.mc += r.credit || 0;
        const net = (existing.sd || 0) + existing.md - ((existing.sc || 0) + existing.mc);
        existing.sfd = net > 0 ? net : 0;
        existing.sfc = net < 0 ? -net : 0;
      }
      return b;
    });
  }, []);

  const deleteJournalEntry = useCallback((id: string) => {
    setJournal(prev => prev.filter(j => j.id !== id));
  }, []);

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

  const openExercice = useCallback((id: string) => {
    setExercices(prev => {
      const e = prev.find(x => x.id === id);
      if (e) setExercice(e);
      return prev;
    });
  }, []);

  const updateEntreprise = useCallback((updates: Partial<Entreprise>) => {
    setEntreprise(prev => prev ? { ...prev, ...updates } : prev);
  }, []);

  return (
    <AppContext.Provider value={{
      env, demo, launched, currentPage, entreprise, exercice, exercices,
      balance, journal, plan, entreprises,
      setPage: setCurrentPage, launchDemo, logout, addJournalEntry,
      deleteJournalEntry, addCompte, deleteCompte, toggleCompte,
      addExercice, deleteExercice, openExercice, updateEntreprise,
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
