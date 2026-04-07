import { useCabinet } from './use-cabinet';
import { useAuth } from './useAuth';

export type UserRole = 'admin' | 'comptable' | 'lecteur' | null;

export function useUserRole(): {
  role: UserRole;
  canWrite: boolean;
  canDelete: boolean;
  canCloturer: boolean;
  canManageCabinet: boolean;
  isReadOnly: boolean;
} {
  const { user } = useAuth();
  const { userRole } = useCabinet(user?.id);

  // If no cabinet → solo user = admin
  const role = userRole ?? 'admin';

  return {
    role,
    canWrite: role === 'admin' || role === 'comptable',
    canDelete: role === 'admin',
    canCloturer: role === 'admin',
    canManageCabinet: role === 'admin',
    isReadOnly: role === 'lecteur',
  };
}
