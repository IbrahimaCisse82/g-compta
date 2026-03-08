import { useMemo } from 'react';
import { useApp } from '@/stores/app-store';
import { fmt } from '@/lib/accounting';
import { exportCsv } from '@/lib/csv-export';

interface ImmoLine {
  compte: string;
  intitule: string;
  brut_debut: number;
  acquisitions: number;
  cessions: number;
  brut_fin: number;
}

interface AmortLine {
  compte: string;
  intitule: string;
  cumul_debut: number;
  dotation: number;
  reprises: number;
  cumul_fin: number;
}

export default function NotesAnnexesPage() {
  const { balance, journal, entreprise, exercice } = useApp();

  // Note 1: Tableau des immobilisations
  const immos = useMemo((): ImmoLine[] => {
    return balance
      .filter(b => /^(20|21|22|23|24|25|26|27)/.test(b.compte) && !/^(28|29)/.test(b.compte))
      .map(b => ({
        compte: b.compte,
        intitule: b.intitule,
        brut_debut: (b.sd || 0),
        acquisitions: (b.md || 0),
        cessions: (b.mc || 0),
        brut_fin: (b.sfd || 0),
      }))
      .filter(l => l.brut_debut > 0 || l.brut_fin > 0)
      .sort((a, b) => a.compte.localeCompare(b.compte));
  }, [balance]);

  // Note 2: Tableau des amortissements
  const amorts = useMemo((): AmortLine[] => {
    return balance
      .filter(b => /^(28|29)/.test(b.compte))
      .map(b => ({
        compte: b.compte,
        intitule: b.intitule,
        cumul_debut: (b.sc || 0),
        dotation: (b.mc || 0),
        reprises: (b.md || 0),
        cumul_fin: (b.sfc || 0),
      }))
      .filter(l => l.cumul_debut > 0 || l.cumul_fin > 0)
      .sort((a, b) => a.compte.localeCompare(b.compte));
  }, [balance]);

  // Note 3: Provisions
  const provisions = useMemo(() => {
    return balance
      .filter(b => /^(15|19|39|49)/.test(b.compte))
      .map(b => ({
        compte: b.compte,
        intitule: b.intitule,
        debut: (b.sc || 0),
        dotation: (b.mc || 0),
        reprises: (b.md || 0),
        fin: (b.sfc || 0),
      }))
      .filter(l => l.debut > 0 || l.fin > 0)
      .sort((a, b) => a.compte.localeCompare(b.compte));
  }, [balance]);

  // Note 4: Créances & dettes detail
  const creances = useMemo(() => {
    return balance
      .filter(b => /^(4[0-9])/.test(b.compte) && ((b.sfd || 0) > 0 || (b.sfc || 0) > 0))
      .map(b => ({
        compte: b.compte,
        intitule: b.intitule,
        debiteur: (b.sfd || 0),
        crediteur: (b.sfc || 0),
      }))
      .sort((a, b) => a.compte.localeCompare(b.compte));
  }, [balance]);

  // Note 5: Charges de personnel
  const personnel = useMemo(() => {
    return balance
      .filter(b => /^(66)/.test(b.compte))
      .map(b => ({
        compte: b.compte,
        intitule: b.intitule,
        montant: (b.sfd || 0) || (b.md || 0),
      }))
      .filter(l => l.montant > 0)
      .sort((a, b) => a.compte.localeCompare(b.compte));
  }, [balance]);

  const totalPersonnel = personnel.reduce((s, p) => s + p.montant, 0);

  // Note 6: Chiffre d'affaires détaillé
  const ca = useMemo(() => {
    return balance
      .filter(b => /^(70)/.test(b.compte))
      .map(b => ({
        compte: b.compte,
        intitule: b.intitule,
        montant: (b.sfc || 0) || (b.mc || 0),
      }))
      .filter(l => l.montant > 0)
      .sort((a, b) => a.compte.localeCompare(b.compte));
  }, [balance]);

  const totalCA = ca.reduce((s, c) => s + c.montant, 0);

  const handleExportImmo = () => {
    exportCsv(
      ['Compte', 'Intitulé', 'Brut Début', 'Acquisitions', 'Cessions', 'Brut Fin'],
      immos.map(r => [r.compte, r.intitule, r.brut_debut, r.acquisitions, r.cessions, r.brut_fin]),
      `note_immo_${exercice?.annee}`,
    );
  };

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">Notes Annexes</div>
          <div className="text-[10px] text-fg3 font-mono">SYSCOHADA Révisé — {entreprise?.nom} — Exercice {exercice?.annee}</div>
        </div>
      </div>
      <div className="p-5 space-y-5">

        {/* Note 1: Immobilisations */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border flex items-center justify-between">
            <span className="text-xs font-bold text-primary">📋 Note 1 — Tableau des Immobilisations</span>
            <button onClick={handleExportImmo} className="text-[10px] text-fg3 hover:text-primary">📥 CSV</button>
          </div>
          <table className="w-full border-collapse">
            <thead><tr>
              {['Compte', 'Intitulé', 'Brut Début', 'Acquisitions', 'Cessions/Retraits', 'Brut Fin'].map(h => (
                <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[0.5px] font-mono border-b border-border">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {immos.map(r => (
                <tr key={r.compte} className="hover:bg-[rgba(56,189,248,.02)]">
                  <td className="px-3 py-1 text-[10px] text-primary font-mono font-bold border-b border-border/30">{r.compte}</td>
                  <td className="px-3 py-1 text-[10px] border-b border-border/30">{r.intitule}</td>
                  <td className="px-3 py-1 text-[10px] font-mono text-right border-b border-border/30">{fmt(r.brut_debut)}</td>
                  <td className="px-3 py-1 text-[10px] font-mono text-right text-success border-b border-border/30">{r.acquisitions ? fmt(r.acquisitions) : '—'}</td>
                  <td className="px-3 py-1 text-[10px] font-mono text-right text-destructive border-b border-border/30">{r.cessions ? fmt(r.cessions) : '—'}</td>
                  <td className="px-3 py-1 text-[10px] font-mono text-right font-bold border-b border-border/30">{fmt(r.brut_fin)}</td>
                </tr>
              ))}
              {immos.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-fg3 text-xs">Aucune immobilisation</td></tr>}
              {immos.length > 0 && (
                <tr className="bg-bg3 font-bold">
                  <td colSpan={2} className="px-3 py-1.5 text-[10px] border-t border-border">TOTAL</td>
                  <td className="px-3 py-1.5 text-[10px] font-mono text-right border-t border-border">{fmt(immos.reduce((s, r) => s + r.brut_debut, 0))}</td>
                  <td className="px-3 py-1.5 text-[10px] font-mono text-right text-success border-t border-border">{fmt(immos.reduce((s, r) => s + r.acquisitions, 0))}</td>
                  <td className="px-3 py-1.5 text-[10px] font-mono text-right text-destructive border-t border-border">{fmt(immos.reduce((s, r) => s + r.cessions, 0))}</td>
                  <td className="px-3 py-1.5 text-[10px] font-mono text-right border-t border-border">{fmt(immos.reduce((s, r) => s + r.brut_fin, 0))}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Note 2: Amortissements */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border">
            <span className="text-xs font-bold text-primary">📋 Note 2 — Tableau des Amortissements</span>
          </div>
          <table className="w-full border-collapse">
            <thead><tr>
              {['Compte', 'Intitulé', 'Cumul Début', 'Dotation', 'Reprises', 'Cumul Fin'].map(h => (
                <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[0.5px] font-mono border-b border-border">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {amorts.map(r => (
                <tr key={r.compte} className="hover:bg-[rgba(56,189,248,.02)]">
                  <td className="px-3 py-1 text-[10px] text-primary font-mono font-bold border-b border-border/30">{r.compte}</td>
                  <td className="px-3 py-1 text-[10px] border-b border-border/30">{r.intitule}</td>
                  <td className="px-3 py-1 text-[10px] font-mono text-right border-b border-border/30">{fmt(r.cumul_debut)}</td>
                  <td className="px-3 py-1 text-[10px] font-mono text-right text-destructive border-b border-border/30">{r.dotation ? fmt(r.dotation) : '—'}</td>
                  <td className="px-3 py-1 text-[10px] font-mono text-right text-success border-b border-border/30">{r.reprises ? fmt(r.reprises) : '—'}</td>
                  <td className="px-3 py-1 text-[10px] font-mono text-right font-bold border-b border-border/30">{fmt(r.cumul_fin)}</td>
                </tr>
              ))}
              {amorts.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-fg3 text-xs">Aucun amortissement</td></tr>}
              {amorts.length > 0 && (
                <tr className="bg-bg3 font-bold">
                  <td colSpan={2} className="px-3 py-1.5 text-[10px] border-t border-border">TOTAL</td>
                  <td className="px-3 py-1.5 text-[10px] font-mono text-right border-t border-border">{fmt(amorts.reduce((s, r) => s + r.cumul_debut, 0))}</td>
                  <td className="px-3 py-1.5 text-[10px] font-mono text-right text-destructive border-t border-border">{fmt(amorts.reduce((s, r) => s + r.dotation, 0))}</td>
                  <td className="px-3 py-1.5 text-[10px] font-mono text-right text-success border-t border-border">{fmt(amorts.reduce((s, r) => s + r.reprises, 0))}</td>
                  <td className="px-3 py-1.5 text-[10px] font-mono text-right border-t border-border">{fmt(amorts.reduce((s, r) => s + r.cumul_fin, 0))}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Note 3: Provisions */}
        {provisions.length > 0 && (
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-border">
              <span className="text-xs font-bold text-primary">📋 Note 3 — Tableau des Provisions</span>
            </div>
            <table className="w-full border-collapse">
              <thead><tr>
                {['Compte', 'Intitulé', 'Début', 'Dotation', 'Reprises', 'Fin'].map(h => (
                  <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[0.5px] font-mono border-b border-border">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {provisions.map(r => (
                  <tr key={r.compte}>
                    <td className="px-3 py-1 text-[10px] text-primary font-mono font-bold border-b border-border/30">{r.compte}</td>
                    <td className="px-3 py-1 text-[10px] border-b border-border/30">{r.intitule}</td>
                    <td className="px-3 py-1 text-[10px] font-mono text-right border-b border-border/30">{fmt(r.debut)}</td>
                    <td className="px-3 py-1 text-[10px] font-mono text-right border-b border-border/30">{r.dotation ? fmt(r.dotation) : '—'}</td>
                    <td className="px-3 py-1 text-[10px] font-mono text-right border-b border-border/30">{r.reprises ? fmt(r.reprises) : '—'}</td>
                    <td className="px-3 py-1 text-[10px] font-mono text-right font-bold border-b border-border/30">{fmt(r.fin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Note 4: Créances & Dettes */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border">
            <span className="text-xs font-bold text-primary">📋 Note 4 — Détail des Créances & Dettes (Classe 4)</span>
          </div>
          <table className="w-full border-collapse">
            <thead><tr>
              {['Compte', 'Intitulé', 'Solde Débiteur', 'Solde Créditeur'].map(h => (
                <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[0.5px] font-mono border-b border-border">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {creances.map(r => (
                <tr key={r.compte} className="hover:bg-[rgba(56,189,248,.02)]">
                  <td className="px-3 py-1 text-[10px] text-primary font-mono font-bold border-b border-border/30">{r.compte}</td>
                  <td className="px-3 py-1 text-[10px] border-b border-border/30">{r.intitule}</td>
                  <td className="px-3 py-1 text-[10px] font-mono text-right text-primary border-b border-border/30">{r.debiteur ? fmt(r.debiteur) : '—'}</td>
                  <td className="px-3 py-1 text-[10px] font-mono text-right text-success border-b border-border/30">{r.crediteur ? fmt(r.crediteur) : '—'}</td>
                </tr>
              ))}
              {creances.length > 0 && (
                <tr className="bg-bg3 font-bold">
                  <td colSpan={2} className="px-3 py-1.5 text-[10px] border-t border-border">TOTAUX</td>
                  <td className="px-3 py-1.5 text-[10px] font-mono text-right text-primary border-t border-border">{fmt(creances.reduce((s, r) => s + r.debiteur, 0))}</td>
                  <td className="px-3 py-1.5 text-[10px] font-mono text-right text-success border-t border-border">{fmt(creances.reduce((s, r) => s + r.crediteur, 0))}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Note 5: Charges de personnel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-border">
              <span className="text-xs font-bold text-primary">📋 Note 5 — Charges de Personnel</span>
            </div>
            <table className="w-full border-collapse">
              <thead><tr>
                {['Compte', 'Intitulé', 'Montant'].map(h => (
                  <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[0.5px] font-mono border-b border-border">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {personnel.map(r => (
                  <tr key={r.compte}>
                    <td className="px-3 py-1 text-[10px] text-primary font-mono font-bold border-b border-border/30">{r.compte}</td>
                    <td className="px-3 py-1 text-[10px] border-b border-border/30">{r.intitule}</td>
                    <td className="px-3 py-1 text-[10px] font-mono text-right border-b border-border/30">{fmt(r.montant)}</td>
                  </tr>
                ))}
                {personnel.length > 0 && (
                  <tr className="bg-bg3 font-bold">
                    <td colSpan={2} className="px-3 py-1.5 text-[10px] border-t border-border">TOTAL</td>
                    <td className="px-3 py-1.5 text-[10px] font-mono text-right border-t border-border">{fmt(totalPersonnel)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Note 6: CA détaillé */}
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-border">
              <span className="text-xs font-bold text-primary">📋 Note 6 — Chiffre d'Affaires Détaillé</span>
            </div>
            <table className="w-full border-collapse">
              <thead><tr>
                {['Compte', 'Intitulé', 'Montant'].map(h => (
                  <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase tracking-[0.5px] font-mono border-b border-border">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {ca.map(r => (
                  <tr key={r.compte}>
                    <td className="px-3 py-1 text-[10px] text-primary font-mono font-bold border-b border-border/30">{r.compte}</td>
                    <td className="px-3 py-1 text-[10px] border-b border-border/30">{r.intitule}</td>
                    <td className="px-3 py-1 text-[10px] font-mono text-right border-b border-border/30">{fmt(r.montant)}</td>
                  </tr>
                ))}
                {ca.length > 0 && (
                  <tr className="bg-bg3 font-bold">
                    <td colSpan={2} className="px-3 py-1.5 text-[10px] border-t border-border">TOTAL CA</td>
                    <td className="px-3 py-1.5 text-[10px] font-mono text-right border-t border-border">{fmt(totalCA)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
