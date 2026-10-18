import React from 'react';
import { STATUTS, type StatutAffiche } from '@/lib/medical';

/** Feuille de style partagée par les écrans médicaux (préfixe .med-inp). */
export function MedicalStyles() {
  return (
    <style>{`
      .med-inp{width:100%;padding:6px 8px;background:hsl(var(--background-3));border:1px solid hsl(var(--border));border-radius:4px;color:hsl(var(--foreground));font-size:11px;}
      .med-inp:disabled{opacity:.55;}
      @media print { body * { visibility: hidden; } .med-print, .med-print * { visibility: visible; } .med-print { position: absolute; left:0; top:0; width:100%; } }
    `}</style>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] text-fg3 mb-1">{label}</span>
      {children}
    </label>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-bg2 border border-border rounded-lg p-3">
      <div className="text-[10px] text-fg3 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold font-mono mt-1 ${tone || ''}`}>{value}</div>
    </div>
  );
}

export function StatutBadge({ statut }: { statut: StatutAffiche }) {
  const s = STATUTS[statut] || STATUTS.a_encaisser;
  return <span className={`text-[10px] px-2 py-0.5 rounded whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}

export function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-bg2 border border-border rounded-xl p-5 w-full max-h-[90vh] overflow-y-auto ${wide ? 'max-w-5xl' : 'max-w-2xl'}`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-serif text-base">{title}</h3>
          <button onClick={onClose} className="text-fg3 hover:text-foreground">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5 print:hidden">
      <div className="font-serif text-[17px]">{icon} {title}</div>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

/** Affiché quand la migration médicale n'a pas encore été appliquée en base. */
export function ModuleAbsent() {
  return (
    <div className="m-5 bg-bg2 border border-destructive/40 rounded-lg p-5 text-xs space-y-2">
      <div className="text-sm font-semibold text-destructive">Module médical non installé</div>
      <p className="text-fg2">
        Les tables du module n'existent pas encore dans la base Supabase. Appliquez la migration
        <span className="font-mono text-foreground"> supabase/migrations/20261002120000_medical_mvp.sql</span>
        {' '}via l'éditeur SQL de votre projet Supabase, puis rechargez cette page.
      </p>
    </div>
  );
}
