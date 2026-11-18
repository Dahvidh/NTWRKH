import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const analysisSchema = {
  type: "object", additionalProperties: false,
  properties: {
    topic: { type: "string" }, niche: { type: "string" }, audience: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } }, keywords: { type: "array", items: { type: "string" } },
    caption: { type: "string" }, recommendations: { type: "array", items: { type: "string" } },
  }, required: ["topic", "niche", "audience", "hashtags", "keywords", "caption", "recommendations"],
};
const planSchema = {
  type: "object", additionalProperties: false,
  properties: {
    summary: { type: "string" },
    audiences: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, reason: { type: "string" } }, required: ["name", "reason"] } },
    channels: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, reason: { type: "string" } }, required: ["name", "reason"] } },
    actions: { type: "array", items: { type: "string" } },
  }, required: ["summary", "audiences", "channels", "actions"],
};
const tiktokSchema = {
  type: "object", additionalProperties: false,
  properties: {
    positioning: { type: "string" }, audienceFit: { type: "string" },
    pillars: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, angle: { type: "string" } }, required: ["name", "angle"] } },
    hooks: { type: "array", items: { type: "string" } },
    calendar: { type: "array", items: { type: "object", additionalProperties: false, properties: { topic: { type: "string" }, format: { type: "string" }, hook: { type: "string" } }, required: ["topic", "format", "hook"] } },
    searchPhrases: { type: "array", items: { type: "string" } }, hashtagThemes: { type: "array", items: { type: "string" } },
    engagementPrompts: { type: "array", items: { type: "string" } },
  }, required: ["positioning", "audienceFit", "pillars", "hooks", "calendar", "searchPhrases", "hashtagThemes", "engagementPrompts"],
};

async function callOpenAI(action: string, p: Record<string, any>) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw Object.assign(new Error("AI service is not configured."), { code: "AI_NOT_CONFIGURED", status: 503 });
  let messages: any[] = [];
  let schemaName: string | undefined;
  let schema: any;
  if (action === "analyze") {
    const content: any[] = [{ type: "text", text: `Analyse this creator content accurately. Use supplied media frames as visual evidence. Do not invent live trends or performance data. Return a concise topic, specific niche, likely audience, relevant hashtags, searchable keywords, an improved caption, and practical distribution recommendations. User caption: ${String(p.caption || "(none)")}` }];
    if (p.imageData && p.imageMimeType) content.push({ type: "image_url", image_url: { url: `data:${p.imageMimeType};base64,${p.imageData}` } });
    else if (Array.isArray(p.imageFrames)) for (const frame of p.imageFrames.slice(0, 3)) if (typeof frame === "string" && frame) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${frame}` } });
    messages = [{ role: "user", content }]; schemaName = "content_analysis"; schema = analysisSchema;
  } else if (action === "assistant") {
    const history = Array.isArray(p.history) ? p.history.slice(-16) : [];
    messages = [
      { role: "system", content: "You are NTWRKH, a practical content strategy assistant. Help creators understand content fit, audience, positioning and distribution. Be honest about uncertainty. Never promise virality or claim access to private account analytics." },
      ...history.map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") })),
      { role: "user", content: String(p.message || "") },
    ];
  } else if (action === "distribution") {
    messages = [
      { role: "system", content: "Build a practical content distribution plan. Recommend channels only where there is a plausible audience fit. Do not claim live trend or account analytics access." },
      { role: "user", content: `Niche: ${p.niche || "General"}\nTopic: ${p.topic || "Not supplied"}\nContent: ${p.content || "Not supplied"}\nExisting hashtags: ${JSON.stringify(p.hashtags || [])}\nExisting mentions: ${JSON.stringify(p.mentions || [])}` },
    ]; schemaName = "distribution_plan"; schema = planSchema;
  } else if (action === "tiktok-plan") {
    messages = [
      { role: "system", content: "Create an actionable TikTok creator strategy. Do not present hashtags or search phrases as live trend data." },
      { role: "user", content: `Niche: ${p.niche}\nAudience: ${p.audience || "Not specified"}\nGoal: ${p.goal}\nFormat: ${p.format}\nRegion: ${p.region || "Not specified"}` },
    ]; schemaName = "tiktok_creator_plan"; schema = tiktokSchema;
  } else throw Object.assign(new Error("Unsupported queued action."), { code: "UNSUPPORTED_ACTION", status: 400 });

  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
  const body: any = { model, messages, temperature: 0.7 };
  if (schemaName) body.response_format = { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } };
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(data?.error?.code || data?.error?.type || "AI_PROVIDER_ERROR");
    const message = String(data?.error?.message || "The AI provider could not complete this request.");
    if (["insufficient_quota","billing_hard_limit_reached","credit_balance_exhausted"].includes(code) || /no credits remaining|credit balance.*(exhausted|insufficient)|add credits to continue/i.test(message)) {
      throw Object.assign(new Error("You have no credits remaining. Add credits to continue using."), { code: "AI_PROVIDER_BILLING_LIMIT", status: 503, retryable: false });
    }
    throw Object.assign(new Error(message), { code, status: response.status, retryable: response.status >= 500 || response.status === 429 });
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw Object.assign(new Error("AI returned an empty response."), { code: "AI_EMPTY_RESPONSE", status: 502, retryable: true });
  const parsed = schemaName ? JSON.parse(content) : content;
  return {
    result: action === "analyze" ? { analysis: parsed } :
      action === "distribution" || action === "tiktok-plan" ? { plan: parsed } : { reply: content },
    model: String(data?.model || model),
    input_tokens: Number(data?.usage?.prompt_tokens || 0),
    output_tokens: Number(data?.usage?.completion_tokens || 0),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = req.headers.get("Authorization");
  const cronTimestamp = req.headers.get("x-ntwrkh-timestamp");
  const cronSignature = req.headers.get("x-ntwrkh-signature");
  const isCron = Boolean(cronTimestamp && cronSignature);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service, { auth: { persistSession: false } });

  let userId: string | null = null;
  if (isCron) {
    const { data: allowed, error: signatureError } = await admin.rpc("ntwrkh_verify_cron_worker_signature", {
      p_timestamp: cronTimestamp, p_signature: cronSignature,
    });
    if (signatureError || allowed !== true) return json({ error: "Scheduled worker authentication failed." }, 401);
  } else {
    if (!authorization) return json({ error: "Authentication required" }, 401);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Your session has expired. Please sign in again." }, 401);
    userId = user.id;
  }

  const workerId = crypto.randomUUID();
  let slotId: number | null = null;
  try {
    const { data: acquiredSlot, error: slotError } = await admin.rpc("ntwrkh_acquire_ai_worker_slot", {
      p_worker_id: workerId, p_lease_seconds: 300,
    });
    if (slotError) throw slotError;
    slotId = acquiredSlot === null ? null : Number(acquiredSlot);
    if (!slotId) return json({ processed: false, capacity: true, message: "All AI workers are busy. Your request remains safely queued." }, 202);

    const { data: jobs, error: claimError } = isCron
      ? await admin.rpc("ntwrkh_claim_next_ai_job_global")
      : await admin.rpc("ntwrkh_claim_next_ai_job", { p_user_id: userId });
    if (claimError) throw claimError;
    const job = Array.isArray(jobs) ? jobs[0] : jobs;
    if (!job) return json({ processed: false, message: "No queued AI jobs are ready." });
    const jobUserId = String(job.user_id || userId || "");
    if (!jobUserId) throw new Error("Claimed AI job has no owner.");

    const userLimit = Math.max(1, Number(Deno.env.get("AI_MAX_REQUESTS_PER_USER_PER_DAY") || 30));
    const globalLimit = Math.max(1, Number(Deno.env.get("AI_MAX_REQUESTS_PER_DAY") || 1000));
    const { data: reservation, error: reserveError } = await admin.rpc("reserve_ai_request", {
      p_user_id: jobUserId, p_request_id: job.request_id, p_action: job.action,
      p_user_daily_limit: userLimit, p_global_daily_limit: globalLimit,
    });
    if (reserveError) throw reserveError;
    if (!reservation?.allowed && reservation?.reason !== "duplicate_request") {
      const message = reservation?.reason === "user_daily_limit"
        ? "You've reached today's AI usage limit. Please try again tomorrow."
        : "NTWRKH is at its current daily AI capacity. Your content is safe; please try again later.";
      await admin.rpc("ntwrkh_fail_ai_job", { p_job_id: job.id, p_error_message: message, p_error_code: reservation?.reason || "AI_CAPACITY_LIMIT", p_retryable: false });
      return json({ processed: true, jobId: job.id, status: "failed", error: message });
    }

    try {
      const output = await callOpenAI(job.action, job.payload || {});
      const { error: ledgerError } = await admin.from("ai_usage_ledger").update({
        status: "completed", provider: "openai", model: output.model,
        input_tokens: output.input_tokens, output_tokens: output.output_tokens,
        completed_at: new Date().toISOString(),
      }).eq("user_id", jobUserId).eq("request_id", job.request_id);
      if (ledgerError) console.error("Usage ledger update failed", ledgerError.message);
      await admin.rpc("ntwrkh_finish_ai_job", { p_job_id: job.id, p_result: output.result });
      return json({ processed: true, jobId: job.id, status: "completed", result: output.result });
    } catch (providerError: any) {
      const code = String(providerError?.code || "AI_PROVIDER_ERROR");
      const message = String(providerError?.message || "The AI provider could not complete this request.");
      const retryable = providerError?.retryable === true;
      await admin.from("ai_usage_ledger").update({
        status: code === "AI_PROVIDER_BILLING_LIMIT" ? "provider_unavailable" : "failed",
        error_code: code, completed_at: new Date().toISOString(),
      }).eq("user_id", jobUserId).eq("request_id", job.request_id);
      const { data: newStatus } = await admin.rpc("ntwrkh_fail_ai_job", {
        p_job_id: job.id, p_error_message: message, p_error_code: code, p_retryable: retryable,
      });
      return json({ processed: true, jobId: job.id, status: newStatus || "failed", error: message }, 200);
    }
  } catch (error) {
    console.error("AI worker failed", error);
    return json({ error: "The AI worker could not process this request. Please try again." }, 503);
  } finally {
    if (slotId !== null && Number.isFinite(slotId)) {
      const { error: releaseError } = await admin.rpc("ntwrkh_release_ai_worker_slot", {
        p_slot_id: slotId, p_worker_id: workerId,
      });
      if (releaseError) console.error("AI worker slot release failed", releaseError.message);
    }
  }
});