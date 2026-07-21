import { useAuth } from '@/hooks/useAuth';
import { useCabinet } from '@/hooks/use-cabinet';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  fetchPlans,
  fetchCabinetSubscriptions,
  statusLabel,
  statusClasses,
  daysRemaining,
  formatDate,
  LIMIT_LABELS,
  LIMIT_UNITS,
  type Plan,
  type EntrepriseSubscription,
} from '@/lib/subscription';
import { fmt } from '@/lib/accounting';

export default function AbonnementsClientsPage() {
  const { user } = useAuth();
  const { cabinet, userRole } = useCabinet(user?.id);
  const [subscriptions, setSubscriptions] = useState<EntrepriseSubscription[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPlan, setFilterPlan] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedSub, setSelectedSub] = useState<EntrepriseSubscription | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [actionLoading, setActionLoading] = useState(false);

  const isAdmin = userRole === 'admin';

  const load = useCallback(async () => {
    if (!cabinet) return;
    setLoading(true);
    try {
      const [plansData, subsData] = await Promise.all([
        fetchPlans(),
        fetchCabinetSubscriptions(cabinet.id),
      ]);
      setPlans(plansData);
      setSubscriptions(subsData);
    } catch (err: any) {
      toast.error('Erreur chargement abonnements : ' + err.message);
    }
    setLoading(false);
  }, [cabinet]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return subscriptions.filter(s => {
      const matchStatus = filterStatus === 'all' || s.abonnement?.statut === filterStatus;
      const matchPlan = filterPlan === 'all' || s.plan?.id === filterPlan;
      const matchSearch = s.entreprise_nom.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchPlan && matchSearch;
    });
  }, [subscriptions, filterStatus, filterPlan, search]);

  const openPlanModal = (sub: EntrepriseSubscription) => {
    setSelectedSub(sub);
    setSelectedPlanId(sub.plan?.id || plans[0]?.id || '');
    setShowModal(true);
  };

  const handleChangePlan = async () => {
    if (!selectedSub || !selectedPlanId) return;
    setActionLoading(true);
    try {
      const plan = plans.find(p => p.id === selectedPlanId);
      if (!plan) return;
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from('abonnements').insert({
        entreprise_id: selectedSub.entreprise_id,
        plan_id: plan.id,
        statut: 'essai',
        date_debut: today,
        essai_fin: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      });
      if (error) throw error;
      toast.success(`Plan ${plan.nom} attribué à ${selectedSub.entreprise_nom}`);
      setShowModal(false);
      await load();
    } catch (err: any) {
      toast.error('Erreur : ' + err.message);
    }
    setActionLoading(false);
  };

  const updateStatus = async (sub: EntrepriseSubscription, statut: string, options?: { date_fin?: string }) => {
    if (!sub.abonnement) {
      toast.error('Aucun abonnement à mettre à jour');
      return;
    }
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('abonnements')
        .update({ statut, date_fin: options?.date_fin || null })
        .eq('id', sub.abonnement.id);
      if (error) throw error;
      toast.success(`Statut mis à jour : ${statusLabel(statut)}`);
      await load();
    } catch (err: any) {
      toast.error('Erreur : ' + err.message);
    }
    setActionLoading(false);
  };

  const markPaid = async (sub: EntrepriseSubscription) => {
    if (!sub.abonnement || !sub.plan) return;
    setActionLoading(true);
    try {
      const today = new Date();
      let dateFin: string;
      if (sub.plan.periodicite === 'an') {
        dateFin = new Date(today.setFullYear(today.getFullYear() + 1)).toISOString().slice(0, 10);
      } else {
        dateFin = new Date(today.setMonth(today.getMonth() + 1)).toISOString().slice(0, 10);
      }
      const { error } = await supabase
        .from('abonnements')
        .update({ statut: 'actif', date_fin: dateFin, essai_fin: null })
        .eq('id', sub.abonnement.id);
      if (error) throw error;
      toast.success(`Abonnement marqué payé jusqu'au ${formatDate(dateFin)}`);
      await load();
    } catch (err: any) {
      toast.error('Erreur : ' + err.message);
    }
    setActionLoading(false);
  };

  if (!cabinet) {
    return (
      <div className="p-5 text-fg3 text-sm">
        Cette page est réservée aux cabinets. Veuillez passer en mode cabinet.
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-5 text-destructive text-sm">
        Accès réservé aux administrateurs du cabinet.
      </div>
    );
  }

  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">🗂️ Abonnements Clients</div>
          <div className="text-[10px] text-fg3 font-mono">Gestion des plans et des essais</div>
        </div>
        <div className="text-[10px] text-fg3 font-mono px-2 py-1 bg-bg3 border border-border rounded">
          {cabinet.nom}
        </div>
      </div>

      <div className="p-5">
        {/* Filtres */}
        <div className="bg-bg2 border border-border rounded-lg p-3 mb-4 flex flex-wrap gap-3 items-center">
          <div>
            <label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Recherche</label>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Nom de l'entreprise..."
              className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px] w-48"
            />
          </div>
          <div>
            <label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Statut</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px]"
            >
              <option value="all">Tous</option>
              <option value="essai">Essai</option>
              <option value="actif">Actif</option>
              <option value="suspendu">Suspendu</option>
              <option value="resilie">Résilié</option>
            </select>
          </div>
          <div>
            <label className="text-[9px] text-fg3 uppercase font-mono block mb-1">Plan</label>
            <select
              value={filterPlan}
              onChange={e => setFilterPlan(e.target.value)}
              className="bg-bg3 border border-border rounded px-2 py-1.5 text-[11px]"
            >
              <option value="all">Tous</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.nom}</option>
              ))}
            </select>
          </div>
          <div className="flex-1" />
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 rounded text-[11px] font-bold border border-border text-fg2 hover:bg-bg3 disabled:opacity-40"
          >
            ↻ Actualiser
          </button>
        </div>

        {/* Tableau */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-border flex justify-between items-center">
            <span className="text-xs font-semibold">{filtered.length} abonnement(s)</span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Entreprise', 'Plan', 'Statut', 'Jours restants', 'Limites', 'Actions'].map(h => (
                  <th key={h} className="bg-bg3 px-3 py-1.5 text-left text-[9px] font-bold text-fg3 uppercase font-mono border-b border-border">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(sub => {
                const remaining = daysRemaining(sub.abonnement?.date_fin || sub.abonnement?.essai_fin);
                return (
                  <tr key={sub.entreprise_id} className="hover:bg-[rgba(56,189,248,.02)]">
                    <td className="px-3 py-2 text-[11px] font-bold border-b border-border/50">
                      {sub.entreprise_nom}
                    </td>
                    <td className="px-3 py-2 text-[11px] border-b border-border/50">
                      {sub.plan ? (
                        <div>
                          <div className="font-bold">{sub.plan.nom}</div>
                          <div className="text-[10px] text-fg3">{fmt(sub.plan.prix_fcfa)} F/{sub.plan.periodicite}</div>
                        </div>
                      ) : (
                        <span className="text-fg3">Aucun plan</span>
                      )}
                    </td>
                    <td className="px-3 py-2 border-b border-border/50">
                      {sub.abonnement ? (
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${statusClasses(sub.abonnement.statut)}`}>
                          {statusLabel(sub.abonnement.statut)}
                        </span>
                      ) : (
                        <span className="text-fg3 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[11px] font-mono border-b border-border/50">
                      {remaining !== null ? (
                        <span className={remaining <= 7 ? 'text-destructive font-bold' : ''}>
                          {remaining} j
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-[10px] border-b border-border/50">
                      <div className="space-y-1">
                        {Object.entries(sub.usage).map(([key, u]) => {
                          const label = LIMIT_LABELS[key] || key;
                          const unit = LIMIT_UNITS[key] || '';
                          return (
                            <div key={key} className={`${u.limit !== -1 && u.used >= u.limit ? 'text-destructive font-bold' : 'text-fg2'}`}>
                              {label}: {u.limit === -1 ? `${u.used.toFixed(1)} ${unit} / ∞` : `${u.used.toFixed(1)} / ${u.limit} ${unit}`}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-2 border-b border-border/50">
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => openPlanModal(sub)}
                          disabled={actionLoading}
                          className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary font-bold disabled:opacity-40"
                        >
                          Changer plan
                        </button>
                        {sub.abonnement?.statut !== 'actif' && (
                          <button
                            onClick={() => markPaid(sub)}
                            disabled={actionLoading}
                            className="text-[10px] px-2 py-0.5 rounded bg-success/10 text-success font-bold disabled:opacity-40"
                          >
                            ✓ Payé
                          </button>
                        )}
                        {sub.abonnement?.statut !== 'suspendu' && sub.abonnement && (
                          <button
                            onClick={() => updateStatus(sub, 'suspendu')}
                            disabled={actionLoading}
                            className="text-[10px] px-2 py-0.5 rounded bg-accent/10 text-accent font-bold disabled:opacity-40"
                          >
                            Suspendre
                          </button>
                        )}
                        {sub.abonnement?.statut !== 'resilie' && sub.abonnement && (
                          <button
                            onClick={() => updateStatus(sub, 'resilie', { date_fin: new Date().toISOString().slice(0, 10) })}
                            disabled={actionLoading}
                            className="text-[10px] px-2 py-0.5 rounded bg-destructive/10 text-destructive font-bold disabled:opacity-40"
                          >
                            Résilier
                          </button>
                        )}
                        {sub.abonnement?.statut === 'suspendu' && (
                          <button
                            onClick={() => updateStatus(sub, 'actif')}
                            disabled={actionLoading}
                            className="text-[10px] px-2 py-0.5 rounded bg-success/10 text-success font-bold disabled:opacity-40"
                          >
                            Réactiver
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-fg3 text-[11px]">
                    Aucun abonnement correspondant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal changer plan */}
      {showModal && selectedSub && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-bg2 border border-border rounded-xl p-5 w-full max-w-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg text-foreground">Changer le plan de {selectedSub.entreprise_nom}</h3>
              <button onClick={() => setShowModal(false)} className="text-fg3 hover:text-foreground">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              {plans.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlanId(p.id)}
                  className={`text-left border rounded-lg p-3 transition-all ${
                    selectedPlanId === p.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-bg3 hover:border-primary/50'
                  }`}
                >
                  <div className="font-bold text-sm">{p.nom}</div>
                  <div className="text-xs text-fg3 mb-1">{fmt(p.prix_fcfa)} F/{p.periodicite}</div>
                  <ul className="text-[10px] text-fg2 space-y-0.5">
                    <li>• Dossiers : {p.limites.dossiers === -1 ? '∞' : p.limites.dossiers}</li>
                    <li>• Utilisateurs : {p.limites.utilisateurs === -1 ? '∞' : p.limites.utilisateurs}</li>
                    <li>• Stockage : {p.limites.stockage_go === -1 ? '∞' : p.limites.stockage_go + ' Go'}</li>
                  </ul>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 rounded text-[11px] font-bold border border-border text-fg2 hover:bg-bg3"
              >
                Annuler
              </button>
              <button
                onClick={handleChangePlan}
                disabled={!selectedPlanId || actionLoading}
                className="px-3 py-1.5 rounded text-[11px] font-bold bg-primary text-primary-foreground disabled:opacity-40"
              >
                {actionLoading ? 'Traitement...' : 'Attribuer plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
