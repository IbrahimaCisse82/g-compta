import { supabase } from '@/integrations/supabase/client';

/** Lecture exhaustive et bornée, sans brouillons ni écritures de liquidation. */
export async function lireMouvementsTva(entrepriseId: string, exerciceId: string, debut: string, fin: string) {
  const totaux = new Map<string, { debit: number; credit: number }>();
  let nombre = 0;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('ecriture_lignes')
      .select('id,compte,debit,credit,ecritures!inner(statut,origine,date_ecriture)')
      .eq('entreprise_id', entrepriseId).eq('exercice_id', exerciceId)
      .eq('ecritures.statut', 'validee').neq('ecritures.origine', 'tva')
      .gte('ecritures.date_ecriture', debut).lte('ecritures.date_ecriture', fin)
      .order('id').range(offset, offset + 999);
    if (error) throw new Error(error.message);
    for (const ligne of data ?? []) {
      const total = totaux.get(ligne.compte) ?? { debit: 0, credit: 0 };
      total.debit += Math.round(Number(ligne.debit) * 100);
      total.credit += Math.round(Number(ligne.credit) * 100);
      totaux.set(ligne.compte, total);
      nombre++;
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  return { nombre, comptes: [...totaux].map(([compte, v]) => ({ compte, debit: v.debit / 100, credit: v.credit / 100 })) };
}