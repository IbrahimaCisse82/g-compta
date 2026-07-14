import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface Plan {
  id: string;
  code: string;
  nom: string;
  prix_fcfa: number;
  periodicite: string;
  description: string | null;
  limites: Record<string, number>;
  features: string[];
  ordre: number;
  populaire: boolean;
}

const fmtFcfa = (n: number) => n.toLocaleString('fr-FR');

const COMPARATIF = [
  { feat: 'SYSCOHADA révisé complet (549 comptes)', starter: true, pro: true, cabinet: true },
  { feat: '34 Notes Annexes + Liasse Fiscale DSF', starter: true, pro: true, cabinet: true },
  { feat: 'Mobile Money (Wave / Orange Money / Free)', starter: true, pro: true, cabinet: true },
  { feat: 'Paie & bulletins SYSCOHADA', starter: false, pro: true, cabinet: true },
  { feat: 'Immobilisations & amortissements', starter: false, pro: true, cabinet: true },
  { feat: 'e-Facturation DGID (Sénégal)', starter: false, pro: true, cabinet: true },
  { feat: 'Analytique multi-axes & Budgets', starter: false, pro: true, cabinet: true },
  { feat: 'Portail client & GED illimitée', starter: false, pro: false, cabinet: true },
  { feat: 'Copilote IA (imputation, anomalies)', starter: false, pro: false, cabinet: true },
  { feat: 'Dossiers & utilisateurs illimités', starter: false, pro: false, cabinet: true },
];

export default function TarifsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('plans_abonnement').select('*').eq('actif', true).order('ordre')
      .then(({ data }) => {
        setPlans((data as any[])?.map(p => ({ ...p, limites: p.limites || {}, features: p.features || [] })) || []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border px-6 py-4 flex items-center justify-between">
        <Link to="/" className="font-serif text-xl text-primary">G-Compta</Link>
        <div className="flex items-center gap-4 text-xs">
          <Link to="/" className="text-fg2 hover:text-primary">Accueil</Link>
          <Link to="/tarifs" className="text-primary font-semibold">Tarifs</Link>
        </div>
      </nav>

      <section className="px-5 py-12 text-center max-w-4xl mx-auto">
        <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold font-mono tracking-wider uppercase border border-primary/30 text-primary bg-primary/5 mb-4">
          Tarifs transparents · FCFA
        </span>
        <h1 className="font-serif text-3xl sm:text-5xl text-foreground mb-3">Un plan pour chaque étape</h1>
        <p className="text-sm text-fg2 max-w-xl mx-auto">
          Essai gratuit 14 jours, sans carte bancaire. Sans engagement. Résiliez à tout moment.
        </p>
      </section>

      <section className="px-5 pb-16 max-w-5xl mx-auto">
        {loading ? (
          <div className="text-center text-fg3 py-10">Chargement des plans...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {plans.map(p => (
              <div key={p.id} className={`relative rounded-2xl border p-6 flex flex-col ${p.populaire ? 'border-primary bg-primary/5 shadow-lg' : 'border-border bg-bg2'}`}>
                {p.populaire && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[9px] font-bold uppercase font-mono px-3 py-1 rounded-full">
                    ★ Le plus choisi
                  </span>
                )}
                <div className="font-serif text-xl text-foreground mb-1">{p.nom}</div>
                <div className="text-xs text-fg3 mb-4 min-h-[32px]">{p.description}</div>
                <div className="mb-4">
                  <span className="font-serif text-3xl text-primary">{fmtFcfa(p.prix_fcfa)}</span>
                  <span className="text-xs text-fg3 ml-1">F/{p.periodicite}</span>
                </div>
                <ul className="space-y-1.5 text-xs text-fg2 flex-1 mb-5">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-accent shrink-0">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/" className={`w-full block text-center py-2.5 rounded-lg font-semibold text-sm transition-all ${p.populaire ? 'bg-primary text-primary-foreground' : 'bg-bg3 text-foreground border border-border hover:border-primary'}`}>
                  Essayer 14 jours gratuits
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="px-5 py-16 bg-bg2 border-t border-border">
        <div className="max-w-4xl mx-auto">
          <h2 className="font-serif text-2xl text-center mb-8">Comparatif détaillé</h2>
          <div className="bg-background border border-border rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-bg3 text-[10px] uppercase font-mono text-fg3">
                <tr>
                  <th className="text-left px-4 py-3">Fonctionnalité</th>
                  <th className="text-center px-4 py-3">Starter</th>
                  <th className="text-center px-4 py-3 text-primary">Pro</th>
                  <th className="text-center px-4 py-3">Cabinet</th>
                </tr>
              </thead>
              <tbody>
                {COMPARATIF.map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-4 py-2.5 text-fg2">{row.feat}</td>
                    <td className="text-center py-2.5">{row.starter ? <span className="text-accent">✓</span> : <span className="text-fg3">—</span>}</td>
                    <td className="text-center py-2.5">{row.pro ? <span className="text-accent">✓</span> : <span className="text-fg3">—</span>}</td>
                    <td className="text-center py-2.5">{row.cabinet ? <span className="text-accent">✓</span> : <span className="text-fg3">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="px-5 py-16 max-w-3xl mx-auto">
        <h2 className="font-serif text-2xl text-center mb-8">Questions fréquentes</h2>
        <div className="space-y-3">
          {[
            { q: "L'essai gratuit demande-t-il une carte bancaire ?", a: "Non. Vous accédez à toutes les fonctionnalités pendant 14 jours sans aucun moyen de paiement." },
            { q: "Puis-je changer de plan à tout moment ?", a: "Oui. Vous pouvez passer d'un plan à l'autre depuis votre espace, avec proratisation automatique." },
            { q: "Mes données sont-elles conservées 10 ans ?", a: "Oui, conformément à l'article 24 de l'Acte Uniforme OHADA. Archivage inclus dans tous les plans." },
            { q: "Puis-je payer en Wave ou Orange Money ?", a: "Oui. En plus des cartes, nous acceptons Wave, Orange Money et virement bancaire (BCEAO)." },
          ].map((f, i) => (
            <details key={i} className="group bg-bg2 border border-border rounded-lg">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold flex justify-between items-center list-none">
                {f.q}
                <span className="text-primary group-open:rotate-45 transition-transform">+</span>
              </summary>
              <div className="px-4 pb-3 text-xs text-fg2 leading-relaxed">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      <footer className="bg-bg2 border-t border-border px-5 py-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-fg3">
          <span>© {new Date().getFullYear()} GROW HUB SARL · G-Compta</span>
          <div className="flex gap-5">
            <Link to="/cgu" className="hover:text-primary">CGU</Link>
            <Link to="/confidentialite" className="hover:text-primary">Confidentialité</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
