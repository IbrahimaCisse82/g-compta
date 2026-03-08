import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Cabinet {
  id: string;
  nom: string;
  owner_id: string;
  created_at: string;
}

export interface CabinetMember {
  id: string;
  cabinet_id: string;
  user_id: string;
  role: 'admin' | 'comptable' | 'lecteur';
  created_at: string;
  email?: string;
  full_name?: string;
}

export interface Invitation {
  id: string;
  cabinet_id: string;
  email: string;
  role: 'admin' | 'comptable' | 'lecteur';
  invited_by: string;
  status: string;
  created_at: string;
}

export function useCabinet(userId: string | undefined) {
  const [cabinet, setCabinet] = useState<Cabinet | null>(null);
  const [members, setMembers] = useState<CabinetMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'comptable' | 'lecteur' | null>(null);

  // Load user's cabinet (owned or member of)
  const loadCabinet = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    // Check if user owns a cabinet
    const { data: ownedCabinets } = await supabase
      .from('cabinets')
      .select('*')
      .eq('owner_id', userId)
      .limit(1);

    let cab: Cabinet | null = null;

    if (ownedCabinets && ownedCabinets.length > 0) {
      cab = ownedCabinets[0] as Cabinet;
    } else {
      // Check if user is member of a cabinet
      const { data: memberEntries } = await supabase
        .from('cabinet_members')
        .select('cabinet_id, role')
        .eq('user_id', userId)
        .limit(1);

      if (memberEntries && memberEntries.length > 0) {
        const { data: cabData } = await supabase
          .from('cabinets')
          .select('*')
          .eq('id', memberEntries[0].cabinet_id)
          .single();
        if (cabData) cab = cabData as Cabinet;
      }
    }

    if (cab) {
      setCabinet(cab);

      // Load members with profile info
      const { data: membersData } = await supabase
        .from('cabinet_members')
        .select('*')
        .eq('cabinet_id', cab.id);

      if (membersData) {
        // Enrich with profile data
        const userIds = membersData.map(m => m.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', userIds);

        const enriched = membersData.map(m => {
          const profile = profiles?.find(p => p.id === m.user_id);
          return {
            ...m,
            role: m.role as 'admin' | 'comptable' | 'lecteur',
            email: profile?.email || '',
            full_name: profile?.full_name || '',
          };
        });
        setMembers(enriched);

        const myMember = enriched.find(m => m.user_id === userId);
        setUserRole(myMember?.role || (cab.owner_id === userId ? 'admin' : null));
      }

      // Load invitations
      const { data: invData } = await supabase
        .from('invitations')
        .select('*')
        .eq('cabinet_id', cab.id);
      setInvitations((invData as Invitation[]) || []);
    }

    // Load pending invitations for current user
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.email) {
      const { data: myInvites } = await supabase
        .from('invitations')
        .select('*')
        .eq('email', userData.user.email)
        .eq('status', 'pending');
      setPendingInvitations((myInvites as Invitation[]) || []);
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => { loadCabinet(); }, [loadCabinet]);

  // Create a new cabinet
  const createCabinet = useCallback(async (nom: string) => {
    if (!userId) return;
    const { data: cab, error } = await supabase
      .from('cabinets')
      .insert({ nom, owner_id: userId })
      .select()
      .single();
    if (error) { toast.error('Erreur création cabinet: ' + error.message); return; }

    // Add owner as admin member
    await supabase.from('cabinet_members').insert({
      cabinet_id: cab.id,
      user_id: userId,
      role: 'admin',
    });

    toast.success('Cabinet créé !');
    await loadCabinet();
  }, [userId, loadCabinet]);

  // Invite a user
  const inviteUser = useCallback(async (email: string, role: 'admin' | 'comptable' | 'lecteur') => {
    if (!cabinet || !userId) return;
    const { error } = await supabase.from('invitations').insert({
      cabinet_id: cabinet.id,
      email,
      role,
      invited_by: userId,
    });
    if (error) {
      if (error.code === '23505') toast.error('Cette personne est déjà invitée.');
      else toast.error('Erreur invitation: ' + error.message);
      return;
    }
    toast.success(`Invitation envoyée à ${email}`);
    await loadCabinet();
  }, [cabinet, userId, loadCabinet]);

  // Accept an invitation
  const acceptInvitation = useCallback(async (invitation: Invitation) => {
    if (!userId) return;

    // Add user as cabinet member
    const { error: memberErr } = await supabase.from('cabinet_members').insert({
      cabinet_id: invitation.cabinet_id,
      user_id: userId,
      role: invitation.role,
    });
    if (memberErr) { toast.error('Erreur: ' + memberErr.message); return; }

    // Update invitation status
    await supabase.from('invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id);

    toast.success('Invitation acceptée !');
    await loadCabinet();
  }, [userId, loadCabinet]);

  // Decline an invitation
  const declineInvitation = useCallback(async (invitationId: string) => {
    await supabase.from('invitations')
      .update({ status: 'declined' })
      .eq('id', invitationId);
    toast.info('Invitation déclinée');
    await loadCabinet();
  }, [loadCabinet]);

  // Update member role
  const updateMemberRole = useCallback(async (memberId: string, role: 'admin' | 'comptable' | 'lecteur') => {
    const { error } = await supabase
      .from('cabinet_members')
      .update({ role })
      .eq('id', memberId);
    if (error) { toast.error('Erreur: ' + error.message); return; }
    toast.success('Rôle mis à jour');
    await loadCabinet();
  }, [loadCabinet]);

  // Remove member
  const removeMember = useCallback(async (memberId: string) => {
    const { error } = await supabase
      .from('cabinet_members')
      .delete()
      .eq('id', memberId);
    if (error) { toast.error('Erreur: ' + error.message); return; }
    toast.success('Membre retiré');
    await loadCabinet();
  }, [loadCabinet]);

  // Cancel invitation
  const cancelInvitation = useCallback(async (invitationId: string) => {
    const { error } = await supabase
      .from('invitations')
      .delete()
      .eq('id', invitationId);
    if (error) { toast.error('Erreur: ' + error.message); return; }
    toast.success('Invitation annulée');
    await loadCabinet();
  }, [loadCabinet]);

  // Link entreprise to cabinet
  const linkEntreprise = useCallback(async (entrepriseId: string) => {
    if (!cabinet) return;
    const { error } = await supabase
      .from('entreprises')
      .update({ cabinet_id: cabinet.id })
      .eq('id', entrepriseId);
    if (error) { toast.error('Erreur: ' + error.message); return; }
    toast.success('Entreprise liée au cabinet');
  }, [cabinet]);

  // Unlink entreprise from cabinet
  const unlinkEntreprise = useCallback(async (entrepriseId: string) => {
    const { error } = await supabase
      .from('entreprises')
      .update({ cabinet_id: null })
      .eq('id', entrepriseId);
    if (error) { toast.error('Erreur: ' + error.message); return; }
    toast.success('Entreprise retirée du cabinet');
  }, []);

  return {
    cabinet, members, invitations, pendingInvitations, loading, userRole,
    createCabinet, inviteUser, acceptInvitation, declineInvitation,
    updateMemberRole, removeMember, cancelInvitation,
    linkEntreprise, unlinkEntreprise, reload: loadCabinet,
  };
}
