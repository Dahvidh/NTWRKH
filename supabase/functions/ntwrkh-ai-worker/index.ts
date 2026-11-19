import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });


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
    transcript: { type: "string" }, audioSummary: { type: "string" }, speechLanguage: { type: "string" },
    keyQuotes: { type: "array", items: { type: "string" } },
    hashtags: { type: "array", items: { type: "string" } }, keywords: { type: "array", items: { type: "string" } },
    caption: { type: "string" }, recommendations: { type: "array", items: { type: "string" } },
  }, required: ["topic", "niche", "audience", "contentFormat", "existingHashtags", "existingMentions", "transcript", "audioSummary", "speechLanguage", "keyQuotes", "hashtags", "keywords", "caption", "recommendations"],
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
    const content: any[] = [{ type: "text", text: `Analyse this creator content accurately. If an original video file is supplied, inspect its visuals and listen to its original audio track; do not rely only on sampled frames. If a standalone audio file is supplied, listen to it carefully. Transcribe intelligible spoken words faithfully, identify the language, summarize speech/music/sound effects, and extract a few short exact key quotes. If there is no audio, return empty transcript, audioSummary, speechLanguage and keyQuotes. Mark unclear speech rather than guessing. Identify content format, extract existing hashtags and @mentions exactly, separate existing from recommended hashtags, and never invent live trends or performance data. Return topic, niche, audience, format, existing hashtags/mentions, transcript, audio summary, speech language, key quotes, new hashtags, keywords, caption and distribution recommendations. User caption: ${String(p.caption || "(none)")}` }];
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
  const body: any = { model, messages, temperature: 0.7, max_tokens: 4096 };
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
    provider: "openai",
    model: String(data?.model || model),
    input_tokens: Number(data?.usage?.prompt_tokens || 0),
    output_tokens: Number(data?.usage?.completion_tokens || 0),
  };
}

function toGeminiSchema(schema: any): any {
  const output: any = {};
  if (schema.type) output.type = schema.type;
  if (schema.properties) {
    output.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, toGeminiSchema(value)]),
    );
  }
  if (schema.required) output.required = schema.required;
  if (schema.items) output.items = toGeminiSchema(schema.items);
  if (schema.enum) output.enum = schema.enum;
  if (schema.additionalProperties === false) output.additionalProperties = false;
  return output;
}

async function callGemini(action: string, p: Record<string, any>, modelOverride?: string) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw Object.assign(new Error("Gemini fallback is not configured."), { code: "GEMINI_NOT_CONFIGURED", status: 503 });

  let systemInstruction = "You are NTWRKH, a practical creator content and distribution assistant. Be accurate, specific, and honest. Never invent live trends, account analytics, or performance data.";
  let contents: any[] = [];
  let schema: any;
  if (action === "analyze") {
    const parts: any[] = [{
      text: `Analyse this creator content accurately. Use supplied media frames as visual evidence and, when audio is supplied, listen to it carefully. Transcribe intelligible spoken words faithfully, identify the language, summarize speech/music/sound effects, and extract a few short exact key quotes. If there is no audio, return empty transcript, audioSummary, speechLanguage and keyQuotes. Mark unclear speech rather than guessing. Identify content format, extract existing hashtags and @mentions exactly, separate existing from recommended hashtags, and never invent live trends or performance data. Return topic, niche, audience, format, existing hashtags/mentions, transcript, audio summary, speech language, key quotes, new hashtags, keywords, caption and distribution recommendations. User caption: ${String(p.caption || "(none)")}`,
    }];
    if (p.imageData && p.imageMimeType) {
      parts.push({ inline_data: { mime_type: p.imageMimeType, data: p.imageData } });
    } else if (!p.videoFileUri && Array.isArray(p.imageFrames)) {
      for (const frame of p.imageFrames.slice(0, 3)) {
        if (typeof frame === "string" && frame) parts.push({ inline_data: { mime_type: "image/jpeg", data: frame } });
      }
    }
    if (p.videoFileUri && p.videoMimeType) {
      parts.push({ file_data: { mime_type: p.videoMimeType, file_uri: p.videoFileUri } });
    }
    if (p.audioData && p.audioMimeType) {
      parts.push({ inline_data: { mime_type: p.audioMimeType, data: p.audioData } });
    }
    contents = [{ role: "user", parts }];
    schema = analysisSchema;
  } else if (action === "assistant") {
    const history = Array.isArray(p.history) ? p.history.slice(-16) : [];
    if (history[0]?.role === "assistant") history.shift();
    contents = [
      ...history.map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content || "") }],
      })),
      { role: "user", parts: [{ text: String(p.message || "") }] },
    ];
  } else if (action === "distribution") {
    systemInstruction = "Build a practical content distribution plan. Recommend channels only where there is a plausible audience fit. Do not claim live trend or account analytics access.";
    contents = [{
      role: "user",
      parts: [{ text: `Niche: ${p.niche || "General"}\nTopic: ${p.topic || "Not supplied"}\nContent: ${p.content || "Not supplied"}\nExisting hashtags: ${JSON.stringify(p.hashtags || [])}\nExisting mentions: ${JSON.stringify(p.mentions || [])}` }],
    }];
    schema = planSchema;
  } else if (action === "tiktok-plan") {
    systemInstruction = "Create an actionable TikTok creator strategy. Do not present hashtags or search phrases as live trend data.";
    contents = [{
      role: "user",
      parts: [{ text: `Niche: ${p.niche}\nAudience: ${p.audience || "Not specified"}\nGoal: ${p.goal}\nFormat: ${p.format}\nRegion: ${p.region || "Not specified"}` }],
    }];
    schema = tiktokSchema;
  } else {
    throw Object.assign(new Error("Unsupported queued action."), { code: "UNSUPPORTED_ACTION", status: 400 });
  }

  const model = modelOverride || Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash";
  const generationConfig: Record<string, unknown> = { maxOutputTokens: 4096 };
  if (schema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseJsonSchema = toGeminiSchema(schema);
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(data?.error?.message || "Gemini could not complete this request.");
    throw Object.assign(new Error(message), {
      code: String(data?.error?.status || "GEMINI_PROVIDER_ERROR"),
      status: response.status,
      retryable: response.status >= 500 || response.status === 429,
    });
  }
  const content = (data?.candidates?.[0]?.content?.parts || [])
    .map((part: any) => typeof part.text === "string" ? part.text : "")
    .join("").trim();
  if (!content) throw Object.assign(new Error("Gemini returned an empty response."), { code: "GEMINI_EMPTY_RESPONSE", status: 502, retryable: true });
  const parsed = schema ? JSON.parse(content) : content;
  return {
    result: action === "analyze" ? { analysis: parsed } :
      action === "distribution" || action === "tiktok-plan" ? { plan: parsed } : { reply: content },
    provider: "google",
    model: String(data?.modelVersion || model),
    input_tokens: Number(data?.usageMetadata?.promptTokenCount || 0),
    output_tokens: Number(data?.usageMetadata?.candidatesTokenCount || 0),
  };
}

async function callGeminiResilient(action: string, payload: Record<string, any>) {
  const primaryModel = Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash";
  try {
    return await callGemini(action, payload, primaryModel);
  } catch (primaryError: any) {
    const shouldTrySecondary = primaryError?.retryable === true
      || primaryError?.status === 429
      || primaryError?.status === 503
      || primaryError instanceof TypeError;
    const secondaryModel = "gemini-3.5-flash-lite";
    if (!shouldTrySecondary || primaryModel === secondaryModel) throw primaryError;
    console.warn("Primary Gemini model unavailable; trying secondary model", primaryModel, secondaryModel);
    try {
      return await callGemini(action, payload, secondaryModel);
    } catch (secondaryError: any) {
      console.error("Secondary Gemini model failed", secondaryError?.code || secondaryError?.message);
      throw Object.assign(new Error("Gemini models are temporarily unavailable. Please try again shortly."), {
        code: "GEMINI_MODELS_UNAVAILABLE",
        status: Number(secondaryError?.status) || 503,
        retryable: secondaryError?.retryable === true || secondaryError?.status === 429 || secondaryError?.status === 503,
      });
    }
  }
}

async function callWithFallback(action: string, payload: Record<string, any>) {
  // OpenAI's current chat path is text/image-only. Route original audio and
  // video through Gemini so neither soundtrack nor moving visuals are discarded.
  if (action === "analyze" && (
    (payload.audioData && payload.audioMimeType) ||
    (payload.videoFileUri && payload.videoMimeType)
  )) {
    return await callGeminiResilient(action, payload);
  }
  try {
    return await callOpenAI(action, payload);
  } catch (openAIError: any) {
    const canFallback = openAIError?.code === "AI_NOT_CONFIGURED"
      || openAIError?.code === "AI_PROVIDER_BILLING_LIMIT"
      || openAIError?.retryable === true
      || openAIError?.status === 429
      || openAIError?.status === 401
      || openAIError?.status === 403
      || openAIError instanceof TypeError
      || Number(openAIError?.status) >= 500;
    if (!canFallback) throw openAIError;
    try {
      return await callGeminiResilient(action, payload);
    } catch (geminiError: any) {
      if (geminiError?.code === "GEMINI_NOT_CONFIGURED") throw openAIError;
      console.error("Gemini fallback failed", geminiError?.code || geminiError?.message);
      throw Object.assign(new Error("Both AI providers are currently unavailable. Please try again shortly."), {
        code: "AI_PROVIDERS_UNAVAILABLE",
        status: 503,
        retryable: geminiError?.retryable === true,
      });
    }
  }
}

async function attachAudioFromStorage(admin: ReturnType<typeof createClient>, userId: string, payload: Record<string, any>) {
  const path = String(payload.audioStoragePath || "");
  const mimeType = String(payload.audioMimeType || "").toLowerCase();
  const supportedTypes = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/aiff", "audio/aac", "audio/ogg", "audio/flac"]);
  if (!path || !path.startsWith(`${userId}/`) || path.includes("..")) {
    throw Object.assign(new Error("The uploaded audio file could not be verified."), { code: "AUDIO_ASSET_INVALID", retryable: false });
  }
  if (!supportedTypes.has(mimeType)) {
    throw Object.assign(new Error("This audio format is not supported yet. Try MP3, WAV, AIFF, AAC, OGG or FLAC."), { code: "AUDIO_FORMAT_UNSUPPORTED", retryable: false });
  }
  const { data, error } = await admin.storage.from("ntwrkh-media").download(path);
  if (error || !data) {
    throw Object.assign(new Error("NTWRKH could not retrieve the uploaded audio. Please upload it again."), { code: "AUDIO_ASSET_UNAVAILABLE", retryable: false });
  }
  if (data.size > 12 * 1024 * 1024) {
    throw Object.assign(new Error("Audio files must be 12 MB or smaller for this first audio-analysis release."), { code: "AUDIO_FILE_TOO_LARGE", retryable: false });
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  const normalizedMime = mimeType === "audio/x-wav" ? "audio/wav" : mimeType === "audio/mpeg" ? "audio/mp3" : mimeType;
  return { ...payload, audioData: btoa(binary), audioMimeType: normalizedMime };
}

async function attachVideoFromStorage(admin: ReturnType<typeof createClient>, userId: string, payload: Record<string, any>) {
  const path = String(payload.videoStoragePath || "");
  const mimeType = String(payload.videoMimeType || "").toLowerCase();
  const supportedTypes = new Set(["video/mp4", "video/quicktime", "video/webm"]);
  if (!path || !path.startsWith(userId + "/") || path.includes("..")) {
    throw Object.assign(new Error("The uploaded video file could not be verified."), { code: "VIDEO_ASSET_INVALID", retryable: false });
  }
  if (!supportedTypes.has(mimeType)) {
    throw Object.assign(new Error("This video format is not supported yet. Use MP4, MOV or WebM."), { code: "VIDEO_FORMAT_UNSUPPORTED", retryable: false });
  }
  const { data: asset, error: assetError } = await admin.from("content_assets")
    .select("size_bytes,mime_type")
    .eq("user_id", userId)
    .eq("storage_path", path)
    .maybeSingle();
  if (assetError || !asset) {
    throw Object.assign(new Error("NTWRKH could not verify this uploaded video. Please upload it again."), { code: "VIDEO_ASSET_UNAVAILABLE", retryable: false });
  }
  const sizeBytes = Number(asset.size_bytes || 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > 50 * 1024 * 1024) {
    throw Object.assign(new Error("Video files must be 50 MB or smaller."), { code: "VIDEO_FILE_TOO_LARGE", retryable: false });
  }
  if (String(asset.mime_type || "").toLowerCase() !== mimeType) {
    throw Object.assign(new Error("The uploaded video's file type could not be verified."), { code: "VIDEO_MIME_MISMATCH", retryable: false });
  }

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw Object.assign(new Error("Gemini video analysis is not configured."), { code: "GEMINI_NOT_CONFIGURED", status: 503 });
  const { data: signed, error: signedError } = await admin.storage.from("ntwrkh-media").createSignedUrl(path, 600);
  if (signedError || !signed?.signedUrl) {
    throw Object.assign(new Error("NTWRKH could not securely access the uploaded video."), { code: "VIDEO_SIGNED_URL_FAILED", retryable: true });
  }

  const start = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files?key=" + encodeURIComponent(key), {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(sizeBytes),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "ntwrkh-" + crypto.randomUUID() } }),
  });
  if (!start.ok) {
    const details = await start.text().catch(() => "");
    throw Object.assign(new Error("Gemini could not prepare the video upload."), { code: "GEMINI_VIDEO_UPLOAD_START_FAILED", status: start.status, retryable: start.status >= 500 || start.status === 429, details: details.slice(0, 300) });
  }
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw Object.assign(new Error("Gemini did not return a secure video upload address."), { code: "GEMINI_VIDEO_UPLOAD_URL_MISSING", retryable: true });
  }

  const source = await fetch(signed.signedUrl);
  if (!source.ok || !source.body) {
    throw Object.assign(new Error("NTWRKH could not read the uploaded video from storage."), { code: "VIDEO_STORAGE_READ_FAILED", status: source.status, retryable: true });
  }
  const uploaded = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(sizeBytes),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: source.body,
  });
  const uploadedData = await uploaded.json().catch(() => ({}));
  const file = uploadedData?.file || uploadedData;
  if (!uploaded.ok || !file?.name || !file?.uri) {
    throw Object.assign(new Error("Gemini could not receive the uploaded video."), { code: "GEMINI_VIDEO_UPLOAD_FAILED", status: uploaded.status, retryable: uploaded.status >= 500 || uploaded.status === 429 });
  }

  try {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const statusResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/" + file.name + "?key=" + encodeURIComponent(key));
      const statusData = await statusResponse.json().catch(() => ({}));
      if (!statusResponse.ok) {
        throw Object.assign(new Error("Gemini could not check video processing status."), { code: "GEMINI_VIDEO_STATUS_FAILED", status: statusResponse.status, retryable: statusResponse.status >= 500 || statusResponse.status === 429 });
      }
      const state = String(statusData?.state || "").toUpperCase();
      if (state === "ACTIVE") {
        return { ...payload, videoFileUri: String(statusData.uri || file.uri), videoMimeType: String(statusData.mimeType || mimeType), geminiFileName: String(file.name) };
      }
      if (state === "FAILED") {
        throw Object.assign(new Error("Gemini could not process this video. Try a shorter MP4, MOV or WebM file."), { code: "GEMINI_VIDEO_PROCESSING_FAILED", retryable: false });
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw Object.assign(new Error("Video processing is taking longer than expected. Please retry shortly."), { code: "GEMINI_VIDEO_PROCESSING_TIMEOUT", retryable: true });
  } catch (error) {
    await fetch("https://generativelanguage.googleapis.com/v1beta/" + file.name + "?key=" + encodeURIComponent(key), { method: "DELETE" }).catch(() => undefined);
    throw error;
  }
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

  const requestBody = await req.json().catch(() => ({}));
  if (isCron && requestBody?.mode === "test-gemini") {
    try {
      const test = await callGeminiResilient("assistant", {
        message: "Reply with exactly: NTWRKH Gemini connection test successful.",
      });
      return json({ tested: true, configured: true, successful: true, provider: test.provider, model: test.model });
    } catch (error: any) {
      return json({
        tested: true,
        configured: Boolean(Deno.env.get("GEMINI_API_KEY")),
        successful: false,
        errorCode: String(error?.code || "GEMINI_TEST_FAILED"),
        error: String(error?.message || "Gemini connection test failed."),
      }, Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 503);
    }
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
      const message = reservation?.reason === "subscription_monthly_limit"
        ? `You've reached your monthly AI request limit on the ${reservation?.plan || "Free"} plan. Your allowance resets next month.`
        : reservation?.reason === "user_daily_limit"
          ? "You've reached today's AI usage limit. Please try again tomorrow."
          : reservation?.reason === "monthly_budget_limit"
            ? "NTWRKH has reached its monthly AI budget. AI requests will be available again next month."
            : "NTWRKH is at its current daily AI capacity. Your content is safe; please try again later.";
      await admin.rpc("ntwrkh_fail_ai_job", { p_job_id: job.id, p_error_message: message, p_error_code: reservation?.reason || "AI_CAPACITY_LIMIT", p_retryable: false });
      return json({ processed: true, jobId: job.id, status: "failed", error: message });
    }

    let geminiFileName: string | null = null;
    try {
      let jobPayload = job.payload || {};
      if (job.action === "analyze" && jobPayload.audioStoragePath) {
        jobPayload = await attachAudioFromStorage(admin, jobUserId, jobPayload);
      }
      if (job.action === "analyze" && jobPayload.videoStoragePath) {
        jobPayload = await attachVideoFromStorage(admin, jobUserId, jobPayload);
        geminiFileName = String(jobPayload.geminiFileName || "") || null;
      }
      const output = await callWithFallback(job.action, jobPayload);
      const costEstimate = estimateAICostUSD(output.provider, output.model, output.input_tokens, output.output_tokens);
      const { error: ledgerError } = await admin.from("ai_usage_ledger").update({
        status: "completed", provider: output.provider, model: output.model,
        input_tokens: output.input_tokens, output_tokens: output.output_tokens,
        estimated_cost_usd: costEstimate.estimated_cost_usd,
        reserved_cost_usd: costEstimate.estimated_cost_usd ?? 0.10,
        cost_estimate_basis: costEstimate.cost_estimate_basis,
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
    } finally {
      if (geminiFileName) {
        const key = Deno.env.get("GEMINI_API_KEY");
        if (key) {
          const cleanup = await fetch("https://generativelanguage.googleapis.com/v1beta/" + geminiFileName + "?key=" + encodeURIComponent(key), { method: "DELETE" }).catch(() => null);
          if (cleanup && !cleanup.ok) console.warn("Gemini temporary video cleanup failed", geminiFileName, cleanup.status);
        }
      }
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