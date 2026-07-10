// Public read-only portal endpoint (no JWT). Validates access via portail_acces + email.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { entreprise_id, email, section } = await req.json();
    if (!entreprise_id || !email) {
      return new Response(JSON.stringify({ error: 'entreprise_id et email requis' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Check access
    const { data: acces, error: accErr } = await supabase
      .from('portail_acces')
      .select('*')
      .eq('entreprise_id', entreprise_id)
      .eq('email', email.toLowerCase().trim())
      .eq('actif', true)
      .maybeSingle();

    if (accErr || !acces) {
      return new Response(JSON.stringify({ error: 'Accès refusé ou inactif' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // update last connection (fire and forget)
    supabase.from('portail_acces').update({ derniere_connexion: new Date().toISOString() }).eq('id', acces.id).then(() => {});

    // 2. Load entreprise info
    const { data: entreprise } = await supabase
      .from('entreprises').select('id,nom,sigle,ninea,rccm,adresse,tel,forme_juridique,secteur,monnaie')
      .eq('id', entreprise_id).maybeSingle();

    // 3. Current exercice
    const { data: exercices } = await supabase.from('exercices').select('*').eq('entreprise_id', entreprise_id).order('annee', { ascending: false });
    const exercice = exercices?.[0] || null;

    const payload: Record<string, unknown> = {
      permissions: {
        bilan: acces.peut_voir_bilan,
        resultat: acces.peut_voir_resultat,
        documents: acces.peut_voir_documents,
        factures: acces.peut_voir_factures,
        depot: acces.peut_deposer_documents,
      },
      entreprise, exercice, exercices: exercices || [],
    };

    if ((section === 'bilan' || section === 'resultat') && exercice) {
      if ((section === 'bilan' && acces.peut_voir_bilan) || (section === 'resultat' && acces.peut_voir_resultat)) {
        const { data: balance } = await supabase.from('balance').select('*').eq('exercice_id', exercice.id);
        payload.balance = balance || [];
      }
    }

    if (section === 'documents' && acces.peut_voir_documents) {
      const { data: documents } = await supabase.from('documents').select('id,nom,categorie,file_size,mime_type,tags,created_at,file_path')
        .eq('entreprise_id', entreprise_id).order('created_at', { ascending: false }).limit(200);
      // sign URLs
      const withUrls = await Promise.all((documents || []).map(async (d: any) => {
        const { data: signed } = await supabase.storage.from('ged').createSignedUrl(d.file_path, 300);
        return { ...d, signed_url: signed?.signedUrl || null };
      }));
      payload.documents = withUrls;
    }

    if (section === 'factures' && acces.peut_voir_factures) {
      const { data: factures } = await supabase.from('factures')
        .select('id,numero,date_emission,date_echeance,statut,total_ttc,total_ht,client_nom')
        .eq('entreprise_id', entreprise_id).order('date_emission', { ascending: false }).limit(200);
      payload.factures = factures || [];
    }

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
