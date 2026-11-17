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

async function openAI(messages: unknown[], schemaName?: string, schema?: Record<string, unknown>) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("AI service is not configured. Add OPENAI_API_KEY to Supabase function secrets.");
  const body: Record<string, unknown> = { model: Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini", messages, temperature: 0.7 };
  if (schemaName && schema) body.response_format = { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } };
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "AI request failed.");
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned an empty response.");
  return content as string;
}

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
    searchPhrases: { type: "array", items: { type: "string" } }, hashtagThemes: { type: "array", items: { type: "string" } }, engagementPrompts: { type: "array", items: { type: "string" } },
  }, required: ["positioning", "audienceFit", "pillars", "hooks", "calendar", "searchPhrases", "hashtagThemes", "engagementPrompts"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Authentication required" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Your session has expired. Please sign in again." }, 401);

    const input = await req.json();
    const action = String(input.action || "");
    if (action === "analyze") {
      const prompt = `Analyse this creator content accurately. Do not invent live trends or performance data. Return a concise topic, specific niche, likely audience, relevant hashtags, searchable keywords, an improved caption, and practical distribution recommendations. User caption: ${String(input.caption || "(none)")}`;
      const content: any[] = [{ type: "text", text: prompt }];
      if (input.imageData && input.imageMimeType) content.push({ type: "image_url", image_url: { url: `data:${input.imageMimeType};base64,${input.imageData}` } });
      const raw = await openAI([{ role: "user", content }], "content_analysis", analysisSchema);
      return json({ analysis: JSON.parse(raw) });
    }
    if (action === "assistant") {
      const history = Array.isArray(input.history) ? input.history.slice(-16) : [];
      const raw = await openAI([
        { role: "system", content: "You are NTWRKH, a practical content strategy assistant. Help creators understand content fit, audience, positioning and distribution. Be honest about uncertainty. Never promise virality or claim access to private account analytics." },
        ...history.map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") })),
        { role: "user", content: String(input.message || "") },
      ]);
      return json({ reply: raw });
    }
    if (action === "distribution") {
      const raw = await openAI([{ role: "system", content: "Build a practical content distribution plan. Recommend channels only where there is a plausible audience fit. Do not claim live trend or account analytics access." }, { role: "user", content: `Niche: ${input.niche || "General"}\nTopic: ${input.topic || "Not supplied"}\nContent: ${input.content || "Not supplied"}` }], "distribution_plan", planSchema);
      return json({ plan: JSON.parse(raw) });
    }
    if (action === "tiktok-plan") {
      const raw = await openAI([{ role: "system", content: "Create an actionable TikTok creator strategy. Do not present hashtags or search phrases as live trend data." }, { role: "user", content: `Niche: ${input.niche}\nAudience: ${input.audience || "Not specified"}\nGoal: ${input.goal}\nFormat: ${input.format}\nRegion: ${input.region || "Not specified"}` }], "tiktok_creator_plan", tiktokSchema);
      return json({ plan: JSON.parse(raw) });
    }
    if (action === "youtube-search") {
      const key = Deno.env.get("YOUTUBE_API_KEY");
      if (!key) return json({ error: "YouTube search is not configured. Add YOUTUBE_API_KEY to Supabase function secrets." }, 503);
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.search = new URLSearchParams({ part: "snippet", q: String(input.q || ""), type: input.type === "channel" ? "channel" : "video", order: String(input.order || "relevance"), maxResults: String(Math.min(25, Math.max(1, Number(input.maxResults) || 12))), key, ...(input.regionCode ? { regionCode: String(input.regionCode).slice(0, 2).toUpperCase() } : {}) }).toString();
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "YouTube search failed.");
      return json({ results: (data.items || []).map((item: any) => ({ id: item.id?.videoId || item.id?.channelId, type: item.id?.kind?.includes("channel") ? "channel" : "video", title: item.snippet?.title || "", description: item.snippet?.description || "", thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "", channelTitle: item.snippet?.channelTitle || "", publishedAt: item.snippet?.publishedAt || "" })) });
    }
    return json({ error: "Unknown NTWRKH action." }, 400);
  } catch (error) {
    console.error("ntwrkh-ai error", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected server error." }, 500);
  }
});
