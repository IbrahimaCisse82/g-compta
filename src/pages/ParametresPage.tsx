import { useApp } from '@/stores/app-store';
import { useState } from 'react';

export default function ParametresPage() {
  const { entreprise, updateEntreprise } = useApp();
  const [saved, setSaved] = useState(false);
  if (!entreprise) return null;

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const field = (label: string, key: keyof typeof entreprise) => (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] text-fg3 uppercase tracking-[1px] font-mono">{label}</label>
      <input className="bg-bg3 border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary" value={entreprise[key] || ''} onChange={e => updateEntreprise({ [key]: e.target.value })} />
    </div>
  );

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div className="font-serif text-[17px]">Paramètres Entreprise</div>
        <button onClick={save} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground">💾 Sauvegarder</button>
      </div>
      <div className="p-5">
        {saved && <div className="mb-3 px-3 py-2 rounded-lg bg-[rgba(52,211,153,.12)] text-success text-xs font-bold">✓ Paramètres sauvegardés</div>}
        <div className="bg-bg2 border border-border rounded-lg p-4">
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
      </div>
    </div>
  );
}
