import { supabase } from '@/integrations/supabase/client';

export interface Plan {
  id: string;
  code: string;
  nom: string;
  prix_fcfa: number;
  periodicite: string;
  description: string | null;
  limites: Record<string, number>;
  features: string[];
  ordre: number;
  actif: boolean;
  populaire: boolean;
}

export interface Abonnement {
  id: string;
  entreprise_id: string;
  plan_id: string;
  statut: 'essai' | 'actif' | 'suspendu' | 'resilie' | string;
  date_debut: string;
  date_fin: string | null;
  essai_fin: string | null;
  created_at: string;
  updated_at: string;
}

export interface Usage {
  dossiers: { used: number; limit: number };
  utilisateurs: { used: number; limit: number };
  stockage_go: { used: number; limit: number };
}

export interface EntrepriseSubscription {
  entreprise_id: string;
  entreprise_nom: string;
  abonnement: Abonnement | null;
  plan: Plan | null;
  usage: Usage;
}

export const LIMIT_LABELS: Record<string, string> = {
  dossiers: 'Dossiers',
  utilisateurs: 'Utilisateurs',
  stockage_go: 'Stockage (Go)',
};

export const LIMIT_UNITS: Record<string, string> = {
  dossiers: '',
  utilisateurs: '',
  stockage_go: 'Go',
};

const GB = 1024 * 1024 * 1024;

export function mapPlan(data: any): Plan {
  return {
    id: data.id,
    code: data.code,
    nom: data.nom,
    prix_fcfa: Number(data.prix_fcfa),
    periodicite: data.periodicite || 'mois',
    description: data.description || null,
    limites: (data.limites as Record<string, number>) || {},
    features: (data.features as string[]) || [],
    ordre: data.ordre || 0,
    actif: data.actif ?? true,
    populaire: data.populaire ?? false,
  };
}

export function mapAbonnement(data: any): Abonnement {
  return {
    id: data.id,
    entreprise_id: data.entreprise_id,
    plan_id: data.plan_id,
    statut: data.statut || 'essai',
    date_debut: data.date_debut,
    date_fin: data.date_fin || null,
    essai_fin: data.essai_fin || null,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function fetchPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans_abonnement')
    .select('*')
    .eq('actif', true)
    .order('ordre');
  if (error) throw error;
  return (data || []).map(mapPlan);
}

export async function fetchSubscription(entrepriseId: string): Promise<{ abonnement: Abonnement | null; plan: Plan | null }> {
  const { data, error } = await supabase
    .from('abonnements')
    .select('*, plan:plans_abonnement(*)')
    .eq('entreprise_id', entrepriseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { abonnement: null, plan: null };
  return {
    abonnement: mapAbonnement(data),
    plan: data.plan ? mapPlan(data.plan) : null,
  };
}

export async function fetchCabinetSubscriptions(cabinetId: string): Promise<EntrepriseSubscription[]> {
  // Récupérer les entreprises du cabinet
  const { data: entreprises, error: entError } = await supabase
    .from('entreprises')
    .select('id, nom, cabinet_id')
    .eq('cabinet_id', cabinetId)
    .order('nom');
  if (entError) throw entError;
  if (!entreprises || entreprises.length === 0) return [];

  const entIds = entreprises.map(e => e.id);

  // Abonnements + plans
  const { data: abonnements, error: abError } = await supabase
    .from('abonnements')
    .select('*, plan:plans_abonnement(*)')
    .in('entreprise_id', entIds)
    .order('created_at', { ascending: false });
  if (abError) throw abError;

  // Dernier abonnement par entreprise
  const abonnementsByEntreprise = new Map<string, any>();
  for (const ab of abonnements || []) {
    if (!abonnementsByEntreprise.has(ab.entreprise_id)) {
      abonnementsByEntreprise.set(ab.entreprise_id, ab);
    }
  }

  // Documents (stockage)
  const { data: docs } = await supabase
    .from('documents')
    .select('entreprise_id, taille_octets')
    .in('entreprise_id', entIds);

  const stockageByEntreprise = new Map<string, number>();
  for (const d of docs || []) {
    const current = stockageByEntreprise.get(d.entreprise_id) || 0;
    stockageByEntreprise.set(d.entreprise_id, current + Number(d.taille_octets || 0));
  }

  // Membres du cabinet (pour la limite utilisateurs)
  const { data: members } = await supabase
    .from('cabinet_members')
    .select('id, cabinet_id')
    .eq('cabinet_id', cabinetId);
  const userCount = members?.length || 1;

  return entreprises.map(ent => {
    const ab = abonnementsByEntreprise.get(ent.id);
    const plan = ab?.plan ? mapPlan(ab.plan) : null;
    const limites = plan?.limites || {};
    const dossierLimit = limites.dossiers ?? -1;
    const userLimit = limites.utilisateurs ?? -1;
    const storageLimit = limites.stockage_go ?? -1;

    const dossierUsed = dossierLimit === -1 ? entIds.length : Math.min(entIds.length, Math.max(1, dossierLimit));
    const userUsed = userLimit === -1 ? userCount : Math.min(userCount, Math.max(1, userLimit));
    const storageUsed = (stockageByEntreprise.get(ent.id) || 0) / GB;

    return {
      entreprise_id: ent.id,
      entreprise_nom: ent.nom,
      abonnement: ab ? mapAbonnement(ab) : null,
      plan,
      usage: {
        dossiers: { used: dossierUsed, limit: dossierLimit },
        utilisateurs: { used: userUsed, limit: userLimit },
        stockage_go: { used: storageUsed, limit: storageLimit },
      },
    };
  });
}

export async function computeUsage(
  entrepriseId: string,
  limites: Record<string, number> = {},
  options?: { cabinetId?: string; allEntrepriseIds?: string[]; userCount?: number }
): Promise<Usage> {
  const dossierLimit = limites.dossiers ?? -1;
  const userLimit = limites.utilisateurs ?? -1;
  const storageLimit = limites.stockage_go ?? -1;

  let dossierUsed = 1;
  if (options?.allEntrepriseIds) {
    dossierUsed = dossierLimit === -1 ? options.allEntrepriseIds.length : Math.min(options.allEntrepriseIds.length, Math.max(1, dossierLimit));
  }

  let userUsed = options?.userCount ?? 1;
  if (userLimit !== -1) {
    userUsed = Math.min(userUsed, Math.max(1, userLimit));
  }

  let storageUsed = 0;
  const { data: docs } = await supabase
    .from('documents')
    .select('taille_octets')
    .eq('entreprise_id', entrepriseId);
  if (docs) {
    storageUsed = docs.reduce((sum, d) => sum + Number(d.taille_octets || 0), 0) / GB;
  }
  if (storageLimit !== -1) {
    storageUsed = Math.min(storageUsed, Math.max(0, storageLimit));
  }

  return {
    dossiers: { used: dossierUsed, limit: dossierLimit },
    utilisateurs: { used: userUsed, limit: userLimit },
    stockage_go: { used: storageUsed, limit: storageLimit },
  };
}

export function statusLabel(statut: string): string {
  switch (statut) {
    case 'essai': return 'Essai';
    case 'actif': return 'Actif';
    case 'suspendu': return 'Suspendu';
    case 'resilie': return 'Résilié';
    default: return statut;
  }
}

export function statusClasses(statut: string): string {
  switch (statut) {
    case 'essai': return 'bg-accent/10 text-accent';
    case 'actif': return 'bg-success/10 text-success';
    case 'suspendu': return 'bg-destructive/10 text-destructive';
    case 'resilie': return 'bg-fg3/10 text-fg3';
    default: return 'bg-fg3/10 text-fg3';
  }
}

export function daysRemaining(dateFin: string | null): number | null {
  if (!dateFin) return null;
  const end = new Date(dateFin);
  const now = new Date();
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}

export function isLimitExceeded(usage: Usage): boolean {
  for (const key of Object.keys(usage) as Array<keyof Usage>) {
    const u = usage[key];
    if (u.limit !== -1 && u.used >= u.limit) return true;
  }
  return false;
}
