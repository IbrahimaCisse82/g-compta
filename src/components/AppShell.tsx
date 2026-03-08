import { useApp, type PageId } from '@/stores/app-store';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import Dashboard from '@/pages/Dashboard';
import JournalPage from '@/pages/JournalPage';
import BalancePage from '@/pages/BalancePage';
import BilanPage from '@/pages/BilanPage';
import ResultatPage from '@/pages/ResultatPage';
import TFTPage from '@/pages/TFTPage';
import PlanComptablePage from '@/pages/PlanComptablePage';
import ExercicesPage from '@/pages/ExercicesPage';
import ParametresPage from '@/pages/ParametresPage';
import SaisiePage from '@/pages/SaisiePage';
import GrandLivrePage from '@/pages/GrandLivrePage';
import BalanceAgeePage from '@/pages/BalanceAgeePage';
import RapprochementPage from '@/pages/RapprochementPage';
import NotesAnnexesPage from '@/pages/NotesAnnexesPage';
import AuditTrailPage from '@/pages/AuditTrailPage';
import LiasseFiscalePage from '@/pages/LiasseFiscalePage';

const NAV: { section: string; items: { id: PageId; icon: string; label: string; cabinet?: boolean }[] }[] = [
  { section: 'Synthèse', items: [
    { id: 'dashboard', icon: '◈', label: 'Tableau de bord' },
    { id: 'clients', icon: '👥', label: 'Mes Clients', cabinet: true },
  ]},
  { section: 'Comptabilité', items: [
    { id: 'saisie', icon: '✏️', label: "Saisie d'écritures" },
    { id: 'journal', icon: '📋', label: 'Journal' },
    { id: 'balance', icon: '⚖️', label: 'Balance' },
    { id: 'grandlivre', icon: '📖', label: 'Grand Livre' },
    { id: 'rapprochement', icon: '🏦', label: 'Rapprochement' },
  ]},
  { section: 'États Financiers', items: [
    { id: 'bilan', icon: '🏛️', label: 'Bilan' },
    { id: 'resultat', icon: '📊', label: 'Compte de Résultat' },
    { id: 'tft', icon: '💸', label: 'Flux de Trésorerie' },
    { id: 'note34', icon: '📝', label: 'Notes Annexes' },
    { id: 'liasse', icon: '📦', label: 'Liasse Fiscale DSF' },
  ]},
  { section: 'Analyse', items: [
    { id: 'balance_agee', icon: '⏳', label: 'Balance Âgée' },
    { id: 'audit', icon: '🔍', label: "Piste d'Audit" },
  ]},
  { section: 'Paramètres', items: [
    { id: 'plan', icon: '🗂️', label: 'Plan Comptable' },
    { id: 'exercices', icon: '📅', label: 'Exercices' },
    { id: 'parametres', icon: '⚙️', label: 'Paramètres' },
  ]},
];

const PAGES: Record<string, React.ComponentType> = {
  dashboard: Dashboard, journal: JournalPage, balance: BalancePage,
  bilan: BilanPage, resultat: ResultatPage, tft: TFTPage,
  plan: PlanComptablePage, exercices: ExercicesPage, parametres: ParametresPage,
  saisie: SaisiePage, grandlivre: GrandLivrePage,
  balance_agee: BalanceAgeePage, rapprochement: RapprochementPage,
  note34: NotesAnnexesPage, audit: AuditTrailPage, liasse: LiasseFiscalePage,
};

// Cabinet mode: client list page with real switching
function ClientsPage() {
  const { entreprises, entreprise, switchEntreprise, loading } = useApp();
  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">👥 Mes Clients</div>
        <span className="text-[10px] text-fg3 font-mono">{entreprises.length} entreprise(s)</span>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {entreprises.map(ent => (
            <button key={ent.id} disabled={loading}
              className={`text-left bg-bg2 border rounded-lg p-4 hover:border-primary transition-all ${ent.id === entreprise?.id ? 'border-primary bg-primary/5' : 'border-border'}`}
              onClick={() => switchEntreprise(ent.id)}>
              <div className="font-bold text-sm text-foreground mb-1">{ent.nom}</div>
              <div className="text-[10px] text-fg3 font-mono">{ent.sigle && `${ent.sigle} · `}{ent.ninea || '—'}</div>
              <div className="text-[10px] text-fg3">{ent.forme_juridique} · {ent.secteur || '—'}</div>
              {ent.id === entreprise?.id && <div className="text-[9px] text-primary font-bold mt-2">✓ Sélectionné</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AppShell() {
  const { env, currentPage, setPage, entreprise, exercice, logout, demo, isExerciceCloture } = useApp();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const locked = isExerciceCloture();

  const PageComponent = currentPage === 'clients' ? ClientsPage : (PAGES[currentPage] || Dashboard);

  const handlePageChange = (page: PageId) => {
    setPage(page);
    setSidebarOpen(false);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* TOPBAR */}
      <div className="h-[50px] bg-bg2 border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3.5">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden text-fg2 text-lg">☰</button>
          <span className="font-serif text-lg text-primary">G-Compta</span>
          <div className="hidden sm:flex items-center bg-bg3 border border-border rounded-full overflow-hidden text-[11px]">
            <span className={`px-2.5 py-1 font-bold border-r border-border ${env === 'cabinet' ? 'text-purple' : 'text-accent'}`}>
              {env === 'cabinet' ? '⚖️ Cabinet' : '🏭 Entreprise'}
            </span>
            <span className="px-2.5 py-1 text-primary font-semibold truncate max-w-[150px]">{entreprise?.nom || '—'}</span>
            <span className="px-2 text-fg3 text-[10px]">›</span>
            <span className="px-2.5 py-1 text-accent font-mono font-bold">Ex. {exercice?.annee || '—'}</span>
            {locked && <span className="px-2 py-0.5 text-[9px] text-destructive font-bold">🔒</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {demo && <span className="hidden sm:inline text-[10px] text-fg3 font-mono px-2 py-0.5 bg-bg3 border border-border rounded-xl">démo</span>}
          {user && !demo && <span className="hidden sm:inline text-[10px] text-fg3 font-mono px-2 py-0.5 bg-bg3 border border-border rounded-xl truncate max-w-[150px]">{user.email}</span>}
          <button onClick={() => window.print()} className="hidden sm:inline px-2 py-1 rounded-md text-xs border border-border text-fg2 hover:bg-bg3">🖨</button>
          <button onClick={logout} className="px-3 py-1 rounded-md text-xs border border-border text-fg2 hover:bg-bg3">⬅ Quitter</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}
        
        <aside className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:relative z-50 lg:z-auto w-[225px] h-full bg-bg2 border-r border-border flex flex-col overflow-y-auto shrink-0 sidebar transition-transform duration-200`}>
          <nav className="py-1.5 flex-1">
            {NAV.map(section => (
              <div key={section.section}>
                <div className="px-3.5 pt-2 pb-0.5 text-[9px] text-fg3 uppercase tracking-[2px] font-mono">{section.section}</div>
                {section.items.filter(item => !item.cabinet || env === 'cabinet').map(item => (
                  <button key={item.id} onClick={() => handlePageChange(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-1.5 text-xs border-l-2 transition-all ${
                      currentPage === item.id
                        ? 'bg-gradient-to-r from-[rgba(56,189,248,.08)] to-transparent text-primary border-l-primary font-semibold'
                        : 'text-fg2 border-l-transparent hover:bg-bg3 hover:text-foreground hover:border-l-border-2'
                    }`}>
                    <span className="text-[13px] w-4 text-center">{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="p-2.5 border-t border-border">
            <div className={`px-2.5 py-1 rounded-2xl text-[10px] font-extrabold font-mono text-center ${locked ? 'bg-destructive/10 text-destructive' : 'bg-accent text-accent-foreground'}`}>
              {locked ? '🔒 ' : ''}Exercice {exercice?.annee || '—'}{locked ? ' (Clôturé)' : ''}
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <PageComponent />
        </main>
      </div>
    </div>
  );
}
