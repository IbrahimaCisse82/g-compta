import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useNotesData(entrepriseId: string | undefined, exerciceId: string | undefined) {
  const [data, setData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entrepriseId || !exerciceId) return;
    setLoading(true);
    supabase
      .from('notes_annexes_data')
      .select('note_key, note_value')
      .eq('entreprise_id', entrepriseId)
      .eq('exercice_id', exerciceId)
      .then(({ data: rows }) => {
        const map: Record<string, string> = {};
        (rows as any[] || []).forEach(r => { map[r.note_key] = r.note_value; });
        setData(map);
        setLoading(false);
      });
  }, [entrepriseId, exerciceId]);

  const save = useCallback(async (key: string, value: string) => {
    if (!entrepriseId || !exerciceId) return;
    setData(prev => ({ ...prev, [key]: value }));
    
    const { error } = await supabase
      .from('notes_annexes_data')
      .upsert({
        entreprise_id: entrepriseId,
        exercice_id: exerciceId,
        note_key: key,
        note_value: value,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'entreprise_id,exercice_id,note_key' });
    
    if (error) toast.error('Erreur sauvegarde note: ' + error.message);
  }, [entrepriseId, exerciceId]);

  return { data, loading, save };
}
