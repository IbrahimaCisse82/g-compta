import { useApp } from '@/stores/app-store';
import { useAuth } from '@/hooks/useAuth';
import type { EnvMode } from '@/stores/app-store';
import { useState } from 'react';
import AuthPage from '@/pages/AuthPage';

export default function Landing() {
  const { launchDemo, launchUser } = useApp();
  const { user } = useAuth();
  const [selectedEnv, setSelectedEnv] = useState<EnvMode>('entreprise');
  const [showAuth, setShowAuth] = useState(false);

  if (showAuth && !user) return <AuthPage />;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-8"
      style={{ background: 'radial-gradient(ellipse at 65% 15%, rgba(56,189,248,.07) 0%, transparent 55%), radial-gradient(ellipse at 20% 80%, rgba(167,139,250,.07) 0%, transparent 50%), hsl(var(--background))' }}>
      <h1 className="font-serif text-5xl text-primary tracking-tight mb-1">G-Compta</h1>
      <p className="text-[11px] text-fg3 tracking-[3px] uppercase font-mono mb-12">Comptabilité SYSCOHADA · Deux Environnements</p>

      <div className="grid grid-cols-2 gap-5 w-full max-w-[760px] mb-8">
        {([
          { env: 'entreprise' as EnvMode, icon: '🏭', title: 'Espace Entreprise', desc: 'Une société gère elle-même sa comptabilité. Accès direct à ses données, journal, balance et états financiers.', color: 'var(--accent)' },
          { env: 'cabinet' as EnvMode, icon: '⚖️', title: 'Espace Cabinet', desc: "Un expert-comptable gère la comptabilité de plusieurs clients. Tableau de bord multi-entreprises.", color: 'hsl(var(--purple))' },
        ]).map(card => (
          <button key={card.env} onClick={() => setSelectedEnv(card.env)}
            className={`relative overflow-hidden rounded-2xl border p-7 text-center cursor-pointer transition-all hover:-translate-y-[3px] ${selectedEnv === card.env ? 'border-primary bg-[rgba(56,189,248,.05)]' : 'border-border bg-bg2 hover:border-primary/50'}`}>
            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: card.color }} />
            <div className="text-4xl mb-3">{card.icon}</div>
            <div className="font-serif text-lg text-foreground mb-1">{card.title}</div>
            <div className="text-xs text-fg3 leading-relaxed">{card.desc}</div>
          </button>
        ))}
      </div>

      <div className="flex gap-4 w-full max-w-[760px]">
        {/* Demo access */}
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

        {/* User access */}
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
    </div>
  );
}
