import { useApp } from '@/stores/app-store';
import { useAuth } from '@/hooks/useAuth';
import type { EnvMode } from '@/stores/app-store';
import { useState } from 'react';
import AuthPage from '@/pages/AuthPage';
import { Link } from 'react-router-dom';

const FEATURES = [
  { icon: '✏️', title: "Saisie d'écritures", desc: 'Saisie rapide en partie double avec auto-complétion du plan comptable SYSCOHADA.' },
  { icon: '📊', title: 'États financiers complets', desc: 'Bilan, Compte de Résultat, TFT, 34 Notes Annexes et Liasse Fiscale DSF.' },
  { icon: '⚖️', title: 'Mode Cabinet', desc: 'Gestion multi-clients avec rôles (Admin, Comptable, Lecteur) et invitations.' },
  { icon: '🔒', title: 'Sécurité & Audit', desc: 'Piste d\'audit automatique, RLS par entreprise, données chiffrées.' },
  { icon: '📥', title: 'Export PDF & CSV', desc: 'Exportez tous vos états financiers en un clic pour vos déclarations.' },
  { icon: '🌗', title: 'Thème clair / sombre', desc: 'Interface adaptable avec raccourcis clavier pour une productivité maximale.' },
];

const STATS = [
  { value: '549', label: 'Comptes SYSCOHADA' },
  { value: '34', label: 'Notes Annexes' },
  { value: '∞', label: 'Entreprises' },
  { value: '100%', label: 'Conforme OHADA' },
];

export default function Landing() {
  const { launchDemo, launchUser } = useApp();
  const { user } = useAuth();
  const [selectedEnv, setSelectedEnv] = useState<EnvMode>('entreprise');
  const [showAuth, setShowAuth] = useState(false);

  if (showAuth && !user) return <AuthPage />;

  return (
    <div className="min-h-screen flex flex-col">
      {/* HERO */}
      <section className="relative overflow-hidden px-5 pt-16 pb-20 flex flex-col items-center text-center"
        style={{ background: 'radial-gradient(ellipse at 65% 15%, rgba(56,189,248,.07) 0%, transparent 55%), radial-gradient(ellipse at 20% 80%, rgba(167,139,250,.07) 0%, transparent 50%), hsl(var(--background))' }}>
        
        {/* Nav */}
        <nav className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4">
          <span className="font-serif text-xl text-primary">G-Compta</span>
          <div className="flex items-center gap-4 text-xs">
            <Link to="/tarifs" className="text-fg2 hover:text-primary transition-colors">Tarifs</Link>
            <span className="text-[10px] text-fg3 font-mono hidden sm:inline">par GROW HUB SARL</span>
          </div>
        </nav>

        <div className="mt-8 mb-2">
          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold font-mono tracking-wider uppercase border border-primary/30 text-primary bg-primary/5">
            SYSCOHADA · OHADA · Zone UEMOA
          </span>
        </div>
        <h1 className="font-serif text-4xl sm:text-6xl text-foreground tracking-tight mb-4 max-w-3xl leading-tight">
          La comptabilité <span className="text-primary">africaine</span>, réinventée.
        </h1>
        <p className="text-sm sm:text-base text-fg2 max-w-xl leading-relaxed mb-8">
          G-Compta est le logiciel de comptabilité 100% conforme SYSCOHADA révisé, 
          conçu pour les entreprises et cabinets d'expertise comptable en Afrique.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12 w-full max-w-2xl">
          {STATS.map(s => (
            <div key={s.label} className="bg-bg2 border border-border rounded-xl p-4">
              <div className="font-serif text-2xl text-primary">{s.value}</div>
              <div className="text-[10px] text-fg3 font-mono mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Environment Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-[760px] mb-8">
          {([
            { env: 'entreprise' as EnvMode, icon: '🏭', title: 'Espace Entreprise', desc: 'Une société gère elle-même sa comptabilité. Accès direct à ses données, journal, balance et états financiers.', color: 'hsl(var(--accent))' },
            { env: 'cabinet' as EnvMode, icon: '⚖️', title: 'Espace Cabinet', desc: "Un expert-comptable gère la comptabilité de plusieurs clients. Tableau de bord multi-entreprises.", color: 'hsl(var(--purple))' },
          ]).map(card => (
            <button key={card.env} onClick={() => setSelectedEnv(card.env)}
              className={`relative overflow-hidden rounded-2xl border p-7 text-center cursor-pointer transition-all hover:-translate-y-[3px] ${selectedEnv === card.env ? 'border-primary bg-primary/5' : 'border-border bg-bg2 hover:border-primary/50'}`}>
              <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: card.color }} />
              <div className="text-4xl mb-3">{card.icon}</div>
              <div className="font-serif text-lg text-foreground mb-1">{card.title}</div>
              <div className="text-xs text-fg3 leading-relaxed">{card.desc}</div>
            </button>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-[760px]">
          <div className="bg-bg2 border border-border rounded-xl p-6 flex-1">
            <div className="flex items-center gap-2 rounded-lg p-2 mb-4 text-xs text-accent" style={{ background: 'linear-gradient(90deg, rgba(245,158,11,.15), rgba(251,113,133,.1))', border: '1px solid rgba(245,158,11,.3)' }}>
              ⚡ Mode démo — données préchargées
            </div>
            <div className="font-serif text-lg text-primary text-center mb-4">Accès Démo</div>
            <p className="text-xs text-fg2 text-center leading-relaxed mb-4">Accès immédiat en lecture. Aucun compte requis.</p>
            <button onClick={() => launchDemo(selectedEnv)}
              className="w-full py-2.5 rounded-lg font-semibold text-sm bg-accent text-accent-foreground hover:brightness-110 transition-all">
              ⚡ Lancer la Démo
            </button>
          </div>

          <div className="bg-bg2 border border-border rounded-xl p-6 flex-1">
            <div className="flex items-center gap-2 rounded-lg p-2 mb-4 text-xs text-success" style={{ background: 'linear-gradient(90deg, rgba(52,211,153,.15), rgba(56,189,248,.1))', border: '1px solid rgba(52,211,153,.3)' }}>
              🔒 Espace sécurisé — vos données
            </div>
            <div className="font-serif text-lg text-primary text-center mb-4">Mon Espace</div>
            {user ? (
              <>
                <p className="text-xs text-fg2 text-center leading-relaxed mb-2">Connecté : <strong className="text-primary">{user.email}</strong></p>
                <button onClick={() => launchUser(selectedEnv)}
                  className="w-full py-2.5 rounded-lg font-semibold text-sm bg-primary text-primary-foreground hover:brightness-110 transition-all">
                  🚀 Accéder à mon espace
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-fg2 text-center leading-relaxed mb-4">Connectez-vous pour gérer vos propres données comptables.</p>
                <button onClick={() => setShowAuth(true)}
                  className="w-full py-2.5 rounded-lg font-semibold text-sm bg-primary text-primary-foreground hover:brightness-110 transition-all">
                  Se connecter / S'inscrire
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="px-5 py-16 bg-bg2">
        <div className="max-w-4xl mx-auto">
          <h2 className="font-serif text-2xl sm:text-3xl text-foreground text-center mb-2">Fonctionnalités complètes</h2>
          <p className="text-sm text-fg3 text-center mb-10">Tout ce dont vous avez besoin pour une comptabilité SYSCOHADA professionnelle.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-background border border-border rounded-xl p-6 hover:border-primary/40 transition-colors">
                <div className="text-3xl mb-3">{f.icon}</div>
                <div className="font-semibold text-foreground text-sm mb-1">{f.title}</div>
                <div className="text-xs text-fg3 leading-relaxed">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST / COMPANY */}
      <section className="px-5 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-serif text-2xl text-foreground mb-4">Développé par GROW HUB SARL</h2>
          <p className="text-sm text-fg2 leading-relaxed mb-6">
            GROW HUB SARL est une société de droit sénégalais spécialisée dans le développement de solutions numériques 
            pour les entreprises africaines. Basée à Dakar, nous accompagnons la transformation digitale 
            de la comptabilité en zone OHADA.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-xs text-fg3">
            <span>📍 Dakar, Sénégal</span>
            <span className="hidden sm:inline">·</span>
            <a href="mailto:g-compta@growhubsenegal.com" className="text-primary hover:underline">✉ g-compta@growhubsenegal.com</a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-bg2 border-t border-border px-5 py-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="font-serif text-lg text-primary">G-Compta</span>
            <span className="text-[10px] text-fg3 ml-2 font-mono">© {new Date().getFullYear()} GROW HUB SARL</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-fg2">
            <Link to="/cgu" className="hover:text-primary transition-colors">CGU</Link>
            <Link to="/confidentialite" className="hover:text-primary transition-colors">Confidentialité</Link>
            <Link to="/protection-donnees" className="hover:text-primary transition-colors">Protection des données</Link>
            <a href="mailto:g-compta@growhubsenegal.com" className="hover:text-primary transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
