// Ancrage quotidien du journal d'audit : copie le dernier hash chaîné d'audit_log
// dans un fichier de stockage (hors tables), pour détecter toute réécriture de la chaîne.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await admin
      .from("audit_log")
      .select("id, hash, created_at")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const { count } = await admin.from("audit_log").select("id", { count: "exact", head: true });

    const now = new Date();
    const ancrage = {
      horodatage: now.toISOString(),
      dernier_id: data?.id ?? null,
      dernier_hash: data?.hash ?? null,
      dernier_evenement: data?.created_at ?? null,
      nombre_evenements: count ?? 0,
    };
    const path = `${now.toISOString().slice(0, 10)}/${now.getTime()}.json`;
    const { error: upErr } = await admin.storage
      .from("audit-ancrages")
      .upload(path, new Blob([JSON.stringify(ancrage, null, 2)], { type: "application/json" }), { upsert: false });
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ ok: true, path, ...ancrage }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
