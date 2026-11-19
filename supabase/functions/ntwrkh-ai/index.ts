import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

class ProviderError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}


function estimateAICostUSD(provider: string, model: string, inputTokens: number, outputTokens: number) {
  const normalizedModel = model.toLowerCase();
  let inputRate: number;
  let outputRate: number;
  let rateDate: string;
  if (provider === "openai" && normalizedModel.startsWith("gpt-4.1-mini")) {
    inputRate = 0.40; outputRate = 1.60; rateDate = "2026-11-18";
  } else if (provider === "google" && normalizedModel.startsWith("gemini-3.8-flash")) {
    const nextRatePeriod = new Date() >= new Date("2027-01-01T00:00:00Z");
    inputRate = nextRatePeriod ? 1.50 : 0.75;
    outputRate = nextRatePeriod ? 7.50 : 3.75;
    rateDate = nextRatePeriod ? "2027-01-01" : "2026-11-18";
  } else if (provider === "google" && normalizedModel.startsWith("gemini-3.5-flash-lite")) {
    inputRate = 0.30; outputRate = 2.50; rateDate = "2026-11-18";
  } else {
    return {
      estimated_cost_usd: null,
      cost_estimate_basis: `No configured public token price for ${provider}/${model}`,
    };
  }
  const cost = ((Math.max(0, inputTokens) * inputRate) + (Math.max(0, outputTokens) * outputRate)) / 1_000_000;
  return {
    estimated_cost_usd: Number(cost.toFixed(10)),
    cost_estimate_basis: `${model}: ${inputRate}/1M input + ${outputRate}/1M output; standard published rates from ${rateDate}`,
  };
}

const analysisSchema = {
  type: "object", additionalProperties: false,
  properties: {
    topic: { type: "string" }, niche: { type: "string" }, audience: { type: "string" },
    contentFormat: { type: "string" },
    existingHashtags: { type: "array", items: { type: "string" } },
    existingMentions: { type: "array", items: { type: "string" } },
    hashtags: { type: "array", items: { type: "string" } }, keywords: { type: "array", items: { type: "string" } },
    caption: { type: "string" }, recommendations: { type: "array", items: { type: "string" } },
  }, required: ["topic", "niche", "audience", "contentFormat", "existingHashtags", "existingMentions", "hashtags", "keywords", "caption", "recommendations"],
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

async function openAI(messages: unknown[], schemaName?: string, schema?: Record<string, unknown>) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new ProviderError("AI service is not configured.", 503, "AI_NOT_CONFIGURED");
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
  const body: Record<string, unknown> = { model, messages, temperature: 0.7, max_tokens: 4096 };
  if (schemaName && schema) body.response_format = { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } };
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(data?.error?.code || data?.error?.type || "AI_PROVIDER_ERROR");
    const message = String(data?.error?.message || "The AI provider could not complete this request.");
    throw new ProviderError(message, response.status, code);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new ProviderError("AI returned an empty response.", 502, "AI_EMPTY_RESPONSE");
  return {
    content: content as string,
    model: String(data?.model || model),
    usage: {
      input_tokens: Number(data?.usage?.prompt_tokens || 0),
      output_tokens: Number(data?.usage?.completion_tokens || 0),
    },
  };
}

async function trackAIRequest(
  admin: ReturnType<typeof createClient>,
  userId: string,
  requestId: string,
  action: string,
  work: () => Promise<{ data: unknown; model: string; usage: { input_tokens: number; output_tokens: number } }>,
) {
  const userLimit = Math.max(1, Number(Deno.env.get("AI_MAX_REQUESTS_PER_USER_PER_DAY") || 30));
  const globalLimit = Math.max(1, Number(Deno.env.get("AI_MAX_REQUESTS_PER_DAY") || 1000));
  const { data: reservation, error: reserveError } = await admin.rpc("reserve_ai_request", {
    p_user_id: userId, p_request_id: requestId, p_action: action,
    p_user_daily_limit: userLimit, p_global_daily_limit: globalLimit,
  });
  if (reserveError) {
    console.error("AI usage reservation failed", reserveError.message);
    throw new ProviderError("NTWRKH could not reserve this AI request. Please try again shortly.", 503, "AI_CAPACITY_CHECK_FAILED");
  }
  if (!reservation?.allowed) {
    if (reservation?.reason === "duplicate_request") {
      throw new ProviderError("This AI request has already been submitted. Please wait for the existing result.", 409, "DUPLICATE_AI_REQUEST");
    }
    if (reservation?.reason === "subscription_monthly_limit") {
      throw new ProviderError("You've reached your monthly AI request limit on the Free plan. Your allowance resets next month.", 429, "SUBSCRIPTION_MONTHLY_LIMIT");
    }
    if (reservation?.reason === "user_daily_limit") {
      throw new ProviderError("You've reached today's AI usage limit. Please try again tomorrow.", 429, "USER_DAILY_LIMIT");
    }
    if (reservation?.reason === "monthly_budget_limit") {
      throw new ProviderError("NTWRKH has reached its monthly AI budget. AI requests will be available again next month.", 429, "MONTHLY_AI_BUDGET_LIMIT");
    }
    throw new ProviderError("NTWRKH is at its current daily AI capacity. Your content is safe; please try again later.", 503, "PLATFORM_DAILY_LIMIT");
  }

  try {
    const result = await work();
    const costEstimate = estimateAICostUSD("openai", result.model, result.usage.input_tokens, result.usage.output_tokens);
    const { error: updateError } = await admin.from("ai_usage_ledger").update({
      status: "completed", provider: "openai", model: result.model,
      input_tokens: result.usage.input_tokens, output_tokens: result.usage.output_tokens,
      estimated_cost_usd: costEstimate.estimated_cost_usd,
      reserved_cost_usd: costEstimate.estimated_cost_usd ?? 0.10,
      cost_estimate_basis: costEstimate.cost_estimate_basis,
      completed_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("request_id", requestId);
    if (updateError) console.error("Could not finalize AI usage record", updateError.message);
    return result.data;
  } catch (error) {
    const providerError = error instanceof ProviderError
      ? error
      : new ProviderError("The AI provider could not complete this request.", 502, "AI_PROVIDER_ERROR");
    const unavailable = ["insufficient_quota", "billing_hard_limit_reached", "credit_balance_exhausted"].includes(providerError.code) || /no credits remaining|credit balance.*(exhausted|insufficient)|add credits to continue/i.test(providerError.message);
    const { error: updateError } = await admin.from("ai_usage_ledger").update({
      status: unavailable ? "provider_unavailable" : "failed",
      error_code: providerError.code,
      completed_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("request_id", requestId);
    if (updateError) console.error("Could not record AI failure", updateError.message);
    if (unavailable) {
      throw new ProviderError("You have no credits remaining. Add credits to continue using.", 503, "AI_PROVIDER_BILLING_LIMIT");
    }
    throw providerError;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Authentication required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "NTWRKH AI infrastructure is not fully configured." }, 503);
    }
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Your session has expired. Please sign in again." }, 401);

    const input = await req.json();
    const action = String(input.action || "");
    const suppliedRequestId = String(input.requestId || "");
    const requestId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedRequestId)
      ? suppliedRequestId : crypto.randomUUID();

    if (action === "analyze") {
      const prompt = `Analyse this creator content accurately. Use supplied media frames as visual evidence. Identify the content format (for example tutorial, vlog, commentary, product demo, interview, comedy, music or educational clip). Extract existing hashtags and @mentions exactly from the supplied caption/text; do not invent or infer tagged accounts. Separate existing hashtags from newly recommended hashtags. Do not invent live trends or performance data. Return topic, specific niche, likely audience, content format, existing hashtags, existing @mentions, relevant new hashtags, searchable keywords, an improved caption, and practical distribution recommendations. User caption: ${String(input.caption || "(none)")}`;
      const content: any[] = [{ type: "text", text: prompt }];
      if (input.imageData && input.imageMimeType) {
        content.push({ type: "image_url", image_url: { url: `data:${input.imageMimeType};base64,${input.imageData}` } });
      } else if (Array.isArray(input.imageFrames)) {
        for (const frame of input.imageFrames.slice(0, 3)) {
          if (typeof frame === "string" && frame.length > 0) content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${frame}` } });
        }
      }
      const result = await trackAIRequest(admin, user.id, requestId, action, async () => {
        const ai = await openAI([{ role: "user", content }], "content_analysis", analysisSchema);
        return { data: { analysis: JSON.parse(ai.content) }, model: ai.model, usage: ai.usage };
      });
      return json(result);
    }

    if (action === "assistant") {
      const history = Array.isArray(input.history) ? input.history.slice(-16) : [];
      const result = await trackAIRequest(admin, user.id, requestId, action, async () => {
        const ai = await openAI([
          { role: "system", content: "You are NTWRKH, a practical content strategy assistant. Help creators understand content fit, audience, positioning and distribution. Be honest about uncertainty. Never promise virality or claim access to private account analytics." },
          ...history.map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") })),
          { role: "user", content: String(input.message || "") },
        ]);
        return { data: { reply: ai.content }, model: ai.model, usage: ai.usage };
      });
      return json(result);
    }

    if (action === "distribution") {
      const result = await trackAIRequest(admin, user.id, requestId, action, async () => {
        const ai = await openAI([
          { role: "system", content: "Build a practical content distribution plan. Recommend channels only where there is a plausible audience fit. Do not claim live trend or account analytics access." },
          { role: "user", content: `Niche: ${input.niche || "General"}\nTopic: ${input.topic || "Not supplied"}\nContent: ${input.content || "Not supplied"}\nExisting hashtags: ${JSON.stringify(input.hashtags || [])}\nExisting mentions: ${JSON.stringify(input.mentions || [])}` },
        ], "distribution_plan", planSchema);
        return { data: { plan: JSON.parse(ai.content) }, model: ai.model, usage: ai.usage };
      });
      return json(result);
    }

    if (action === "tiktok-plan") {
      const result = await trackAIRequest(admin, user.id, requestId, action, async () => {
        const ai = await openAI([
          { role: "system", content: "Create an actionable TikTok creator strategy. Do not present hashtags or search phrases as live trend data." },
          { role: "user", content: `Niche: ${input.niche}\nAudience: ${input.audience || "Not specified"}\nGoal: ${input.goal}\nFormat: ${input.format}\nRegion: ${input.region || "Not specified"}` },
        ], "tiktok_creator_plan", tiktokSchema);
        return { data: { plan: JSON.parse(ai.content) }, model: ai.model, usage: ai.usage };
      });
      return json(result);
    }

    if (action === "youtube-search") {
      const key = Deno.env.get("YOUTUBE_API_KEY");
      if (!key) return json({ error: "YouTube search is not configured. Add YOUTUBE_API_KEY to Supabase function secrets." }, 503);
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.search = new URLSearchParams({
        part: "snippet", q: String(input.q || ""), type: input.type === "channel" ? "channel" : "video",
        order: String(input.order || "relevance"),
        maxResults: String(Math.min(25, Math.max(1, Number(input.maxResults) || 12))), key,
        ...(input.regionCode ? { regionCode: String(input.regionCode).slice(0, 2).toUpperCase() } : {}),
      }).toString();
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "YouTube search failed.");
      return json({ results: (data.items || []).map((item: any) => ({
        id: item.id?.videoId || item.id?.channelId, type: item.id?.kind?.includes("channel") ? "channel" : "video",
        title: item.snippet?.title || "", description: item.snippet?.description || "",
        thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "",
        channelTitle: item.snippet?.channelTitle || "", publishedAt: item.snippet?.publishedAt || "",
      })) });
    }

    return json({ error: "Unknown NTWRKH action." }, 400);
  } catch (error) {
    if (error instanceof ProviderError) {
      console.error("ntwrkh-ai controlled error", { code: error.code, status: error.status });
      return json({ error: error.message, code: error.code }, error.status);
    }
    console.error("ntwrkh-ai unexpected error", error);
    return json({ error: "The request could not be completed. Please try again." }, 500);
  }
});
