import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { BalanceLine, JournalLine, PlanCompte, Entreprise, Exercice } from '@/lib/accounting';

export function useSupabaseData() {
  const fetchEntreprise = useCallback(async (id: string): Promise<Entreprise | null> => {
    const { data } = await supabase.from('entreprises').select('*').eq('id', id).single();
    if (!data) return null;
    return {
      id: data.id,
      nom: data.nom,
      sigle: data.sigle || '',
      ninea: data.ninea || '',
      rccm: data.rccm || '',
      tel: data.tel || '',
      adresse: data.adresse || '',
      forme_juridique: data.forme_juridique || '',
      secteur: data.secteur || '',
      monnaie: data.monnaie || 'FCFA',
    };
  }, []);

  const fetchEntreprises = useCallback(async (): Promise<Entreprise[]> => {
    const { data } = await supabase.from('entreprises').select('*');
    return (data || []).map(d => ({
      id: d.id,
      nom: d.nom,
      sigle: d.sigle || '',
      ninea: d.ninea || '',
      rccm: d.rccm || '',
      tel: d.tel || '',
      adresse: d.adresse || '',
      forme_juridique: d.forme_juridique || '',
      secteur: d.secteur || '',
      monnaie: d.monnaie || 'FCFA',
    }));
  }, []);

  const fetchExercices = useCallback(async (entrepriseId: string): Promise<Exercice[]> => {
    const { data } = await supabase.from('exercices').select('*').eq('entreprise_id', entrepriseId).order('annee', { ascending: false });
    return (data || []).map(d => ({
      id: d.id,
      entreprise_id: d.entreprise_id,
      annee: d.annee,
      date_debut: d.date_debut,
      date_fin: d.date_fin,
      statut: d.statut as 'en_cours' | 'cloture',
    }));
  }, []);

  const fetchBalance = useCallback(async (exerciceId: string): Promise<BalanceLine[]> => {
    const { data } = await supabase.from('balance').select('*').eq('exercice_id', exerciceId);
    return (data || []).map(d => ({
      id: d.id,
      exercice_id: d.exercice_id,
      entreprise_id: d.entreprise_id,
      compte: d.compte,
      intitule: d.intitule,
      sd: Number(d.sd),
      sc: Number(d.sc),
      md: Number(d.md),
      mc: Number(d.mc),
      sfd: Number(d.sfd),
      sfc: Number(d.sfc),
    }));
  }, []);

  const fetchJournal = useCallback(async (exerciceId: string): Promise<JournalLine[]> => {
    const { data } = await supabase.from('journal').select('*').eq('exercice_id', exerciceId).order('date_ecriture');
    return (data || []).map(d => ({
      id: d.id,
      exercice_id: d.exercice_id,
      entreprise_id: d.entreprise_id,
      date_ecriture: d.date_ecriture,
      piece: d.piece,
      journal_code: d.journal_code,
      libelle: d.libelle,
      compte: d.compte,
      intitule: d.intitule,
      debit: Number(d.debit),
      credit: Number(d.credit),
    }));
  }, []);

  const fetchPlan = useCallback(async (entrepriseId: string): Promise<PlanCompte[]> => {
    const { data } = await supabase.from('plan_comptable').select('*').eq('entreprise_id', entrepriseId).order('numero');
    return (data || []).map(d => ({
      id: d.id,
      entreprise_id: d.entreprise_id,
      numero: d.numero,
      intitule: d.intitule,
      classe: d.classe,
      sens: d.sens,
      type_compte: d.type_compte,
      actif: d.actif,
    }));
  }, []);

  const insertJournalLines = useCallback(async (lines: Omit<JournalLine, 'id'>[]) => {
    const { data, error } = await supabase.from('journal').insert(
      lines.map(l => ({
        exercice_id: l.exercice_id,
        entreprise_id: l.entreprise_id,
        date_ecriture: l.date_ecriture,
        piece: l.piece,
        journal_code: l.journal_code,
        libelle: l.libelle,
        compte: l.compte,
        intitule: l.intitule,
        debit: l.debit,
        credit: l.credit,
      }))
    ).select();
    if (error) throw error;
    return data;
  }, []);

  const deleteJournalLine = useCallback(async (id: string) => {
    const { error } = await supabase.from('journal').delete().eq('id', id);
    if (error) throw error;
  }, []);

  const upsertBalance = useCallback(async (lines: Omit<BalanceLine, 'id'>[]) => {
    const { error } = await supabase.from('balance').upsert(
      lines.map(l => ({
        exercice_id: l.exercice_id,
        entreprise_id: l.entreprise_id,
        compte: l.compte,
        intitule: l.intitule,
        sd: l.sd, sc: l.sc,
        md: l.md, mc: l.mc,
        sfd: l.sfd, sfc: l.sfc,
      }))
    );
    if (error) throw error;
  }, []);

  const updateEntrepriseDb = useCallback(async (id: string, updates: Partial<Entreprise>) => {
    const { error } = await supabase.from('entreprises').update(updates).eq('id', id);
    if (error) throw error;
  }, []);

  return {
    fetchEntreprise, fetchEntreprises, fetchExercices,
    fetchBalance, fetchJournal, fetchPlan,
    insertJournalLines, deleteJournalLine, upsertBalance,
    updateEntrepriseDb,
  };
}
