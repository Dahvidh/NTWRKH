import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization) return reply({ error: "Authentication required" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return reply({ error: "Your session has expired. Please sign in again." }, 401);

  try {
    const input = await req.json();
    if (input.mode === "status") {
      const { data, error } = await admin.rpc("ntwrkh_get_ai_job", { p_job_id: String(input.jobId || ""), p_user_id: user.id }).then(({data,error}) => ({data: Array.isArray(data) ? data[0] || null : data, error}));
      if (error) throw error;
      if (!data) return reply({ error: "AI job not found." }, 404);
      return reply({ job: data });
    }

    if (input.mode === "list") {
      const { data, error } = await admin.rpc("ntwrkh_list_ai_jobs", { p_user_id: user.id });
      if (error) throw error;
      return reply({ jobs: data || [] });
    }

    if (input.mode !== "submit") return reply({ error: "Unknown queue operation." }, 400);
    const action = String(input.action || "");
    const requestId = String(input.requestId || "");
    if (!["analyze", "assistant", "distribution", "tiktok-plan"].includes(action)) {
      return reply({ error: "This AI action cannot be queued." }, 400);
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      return reply({ error: "A valid request ID is required." }, 400);
    }
    const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
    const { data, error } = await admin.rpc("ntwrkh_enqueue_ai_job", {
      p_user_id: user.id, p_request_id: requestId, p_action: action, p_payload: payload,
    });
    if (error) {
      console.error("AI enqueue failed", error.message);
      return reply({ error: "NTWRKH could not queue this request. Please try again shortly." }, 503);
    }
    const row = Array.isArray(data) ? data[0] : data;
    return reply({ jobId: row.job_id, status: row.job_status, duplicate: row.duplicate });
  } catch (error) {
    console.error("AI queue endpoint failed", error);
    return reply({ error: "The request could not be completed. Please try again." }, 500);
  }
});