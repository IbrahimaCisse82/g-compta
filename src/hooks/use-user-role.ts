import { useEffect, useState } from 'react';
import { useApp } from '@/stores/app-store';
import { useAuth } from './useAuth';
import { getRoleEntreprise } from '@/lib/ecritures';

export type UserRole = 'admin' | 'comptable' | 'lecteur' | null;

/**
 * Le rôle est TOUJOURS calculé en base (get_entreprise_role) : propriétaire de
 * l'entreprise → admin, sinon rôle du cabinet, sinon rôle applicatif explicite.
 * Aucune valeur par défaut permissive côté client : en l'absence de réponse
 * serveur, l'utilisateur est traité en lecture seule. La base reste de toute
 * façon seule décisionnaire (RLS + fonctions serveur).
 */
export function useUserRole(): {
  role: UserRole;
  loading: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canCloturer: boolean;
  canManageCabinet: boolean;
  isReadOnly: boolean;
} {
  const { user } = useAuth();
  const { entreprise, demo } = useApp();
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (demo) { setRole('admin'); setLoading(false); return; }
      if (!user || !entreprise) { setRole(null); setLoading(false); return; }
      setLoading(true);
      const r = await getRoleEntreprise(entreprise.id);
      if (!cancelled) { setRole(r ?? 'lecteur'); setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id, entreprise?.id, demo]);

  return {
    role,
    loading,
    canWrite: role === 'admin' || role === 'comptable',
    canDelete: role === 'admin',
    canCloturer: role === 'admin',
    canManageCabinet: role === 'admin',
    isReadOnly: role !== 'admin' && role !== 'comptable',
  };
}
