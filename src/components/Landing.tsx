import { useApp } from '@/stores/app-store';
import type { EnvMode } from '@/stores/app-store';
import { useState } from 'react';

export default function Landing() {
  const { launchDemo } = useApp();
  const [selectedEnv, setSelectedEnv] = useState<EnvMode>('entreprise');

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

      <div className="bg-bg2 border border-border rounded-xl p-6 w-full max-w-[400px]">
        <div className="flex items-center gap-2 rounded-lg p-2 mb-4 text-xs text-accent" style={{ background: 'linear-gradient(90deg, rgba(245,158,11,.15), rgba(251,113,133,.1))', border: '1px solid rgba(245,158,11,.3)' }}>
          ⚡ Mode démo — données PME 1 (2022) préchargées
        </div>
        <div className="font-serif text-lg text-primary text-center mb-4">Accès Démo</div>
        <p className="text-xs text-fg2 text-center leading-relaxed mb-4">Accès immédiat aux données de démonstration. Aucun compte requis.</p>
        <button onClick={() => launchDemo('entreprise')}
          className="w-full py-2.5 rounded-lg font-semibold text-sm bg-accent text-accent-foreground mb-2 hover:brightness-110 transition-all">
          🏭 Démo Entreprise (PME 1)
        </button>
        <button onClick={() => launchDemo('cabinet')}
          className="w-full py-2.5 rounded-lg font-semibold text-sm bg-purple text-purple-foreground hover:brightness-110 transition-all">
          ⚖️ Démo Cabinet
        </button>
      </div>
    </div>
  );
}
