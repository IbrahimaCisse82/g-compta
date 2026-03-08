import { useApp } from '@/stores/app-store';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import { toast } from 'sonner';

export default function ParametresPage() {
  const { entreprise, updateEntreprise, demo } = useApp();
  const { user, signOut } = useAuth();
  const [saving, setSaving] = useState(false);
  if (!entreprise) return null;

  const save = async () => {
    if (demo) { toast.info('Mode démo — modifications non sauvegardées.'); return; }
    setSaving(true);
    await updateEntreprise({
      nom: entreprise.nom,
      sigle: entreprise.sigle,
      ninea: entreprise.ninea,
      rccm: entreprise.rccm,
      tel: entreprise.tel,
      adresse: entreprise.adresse,
      forme_juridique: entreprise.forme_juridique,
      secteur: entreprise.secteur,
      monnaie: entreprise.monnaie,
    });
    setSaving(false);
    toast.success('Paramètres sauvegardés');
  };

  const field = (label: string, key: keyof typeof entreprise) => (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] text-fg3 uppercase tracking-[1px] font-mono">{label}</label>
      <input className="bg-bg3 border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary" value={entreprise[key] || ''} onChange={e => updateEntreprise({ [key]: e.target.value })} disabled={demo} />
    </div>
  );

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">Paramètres Entreprise</div>
        <div className="flex items-center gap-2">
          {!demo && <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-50">
            {saving ? '...' : '💾 Sauvegarder'}
          </button>}
        </div>
      </div>
      <div className="p-5">
        {demo && <div className="mb-3 px-3 py-2 rounded-lg bg-accent/10 text-accent text-xs font-bold">⚡ Mode démo — modifications désactivées</div>}
        
        <div className="bg-bg2 border border-border rounded-lg p-4 mb-4">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="col-span-2">{field('Dénomination sociale', 'nom')}</div>
            {field('Sigle', 'sigle')}
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            {field('NINEA', 'ninea')}
            {field('RCCM', 'rccm')}
            {field('Téléphone', 'tel')}
          </div>
          <div className="mb-3">{field('Adresse', 'adresse')}</div>
          <div className="grid grid-cols-3 gap-3">
            {field('Forme juridique', 'forme_juridique')}
            {field('Secteur', 'secteur')}
            {field('Monnaie', 'monnaie')}
          </div>
        </div>

        {/* User info */}
        {user && (
          <div className="bg-bg2 border border-border rounded-lg p-4">
            <div className="text-xs font-bold text-primary mb-3">👤 Compte Utilisateur</div>
            <div className="text-[11px] text-fg2 mb-2">Email : <strong className="text-foreground">{user.email}</strong></div>
            <button onClick={signOut} className="px-3 py-1.5 rounded-md text-xs border border-destructive/30 text-destructive hover:bg-destructive/10">
              Se déconnecter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
