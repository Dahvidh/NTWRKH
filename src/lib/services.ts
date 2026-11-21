import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase, requireUserId } from './supabase';

export type Profile = { name?: string; userType?: string; niche?: string; goals?: string; bio?: string; avatarUrl?: string };
export type Analysis = {
  topic?: string;
  niche?: string;
  audience?: string;
  contentFormat?: string;
  existingHashtags?: string[];
  existingMentions?: string[];
  transcript?: string;
  audioSummary?: string;
  speechLanguage?: string;
  keyQuotes?: string[];
  hashtags?: string[];
  keywords?: string[];
  caption?: string;
  recommendations?: string[];
};
export type Post = { id: string; ownerId: string; caption: string; topic?: string; niche?: string; hashtags?: string[]; analysis?: Analysis; createdAt: string; visibility?: string; mediaUrl?: string };
export type ChatMessage = { role: 'user' | 'assistant'; content: string; createdAt?: string };

export type SavedAnalysis = {
  id: string;
  inputText: string;
  analysis: Analysis;
  createdAt: string;
  assetId?: string | null;
  assetName?: string;
  mediaKind?: string;
};
export type SavedPlan = {
  id: string;
  platform: string;
  status: string;
  payload: { kind?: string; title?: string; plan?: any; source?: any };
  createdAt: string;
  updatedAt: string;
};
export type SavedAsset = {
  id: string;
  fileName: string;
  mediaKind: string;
  status: string;
  storagePath: string;
  createdAt: string;
};
export type SavedConversation = {
  id: string;
  title: string;
  updatedAt: string;
  lastMessage?: string;
};
export type LibraryData = {
  analyses: SavedAnalysis[];
  plans: SavedPlan[];
  assets: SavedAsset[];
  conversations: SavedConversation[];
};


export type AIUsagePeriod = {
  requests: number;
  completed: number;
  estimatedCostUsd: number;
  inputTokens: number;
  outputTokens: number;
};
export type AIUsageSummary = {
  today: AIUsagePeriod;
  month: AIUsagePeriod;
  providerBreakdown: { provider: string; model: string; requests: number; estimatedCostUsd: number; inputTokens: number; outputTokens: number }[];
};

export type AIJob = {
  id: string;
  action: string;
  status: 'queued' | 'processing' | 'retrying' | 'completed' | 'failed';
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  last_error_code?: string | null;
};

export function mapUser(user: SupabaseUser) {
  const metadata = user.user_metadata || {};
  return { userId: user.id, name: metadata.full_name || metadata.name || user.email || 'Creator', picture: metadata.avatar_url || metadata.picture || undefined };
}

function mapProfile(row: any): Profile {
  return { name: row?.name || '', userType: row?.user_type || '', niche: row?.niche || '', goals: row?.goals || '', bio: row?.bio || '', avatarUrl: row?.avatar_url || '' };
}
function mapPost(row: any): Post {
  return { id: row.id, ownerId: row.author_user_id, caption: row.caption || '', topic: row.topic || '', niche: row.niche || '', hashtags: row.hashtags || [], analysis: row.analysis || undefined, createdAt: row.created_at, visibility: row.visibility, mediaUrl: row.media_url || undefined };
}

export async function getSession(): Promise<{ session: Session | null; user: ReturnType<typeof mapUser> | null }> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return { session: data.session, user: data.session?.user ? mapUser(data.session.user) : null };
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: 'openid email profile https://www.googleapis.com/auth/youtube.readonly',
      redirectTo: 'https://ntwrkh.vercel.app/',
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function loadProfile(userId: string): Promise<Profile> {
  const id = requireUserId(userId);
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return mapProfile(data);
}

export async function saveProfile(userId: string, profile: Profile): Promise<Profile> {
  const id = requireUserId(userId);
  const row = { id, name: profile.name || null, user_type: profile.userType || null, niche: profile.niche || null, goals: profile.goals || null, bio: profile.bio || null, avatar_url: profile.avatarUrl || null, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('profiles').upsert(row, { onConflict: 'id' }).select('*').single();
  if (error) throw error;
  return mapProfile(data);
}

export async function loadPosts(userId: string): Promise<Post[]> {
  requireUserId(userId);
  const { data, error } = await supabase.from('community_posts').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data || []).map(mapPost);
}

export async function uploadMedia(
  userId: string,
  file: File
): Promise<string> {
  const id = requireUserId(userId);

  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  const isAudio = file.type.startsWith('audio/');

  if (!isImage && !isVideo && !isAudio) {
    throw new Error('Choose an image, video or audio file.');
  }
  const supportedAudioTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac'];
  if (isAudio && !supportedAudioTypes.includes(file.type.toLowerCase())) {
    throw new Error('This audio format is not supported yet. Use MP3, WAV, AIFF, AAC, OGG or FLAC.');
  }
  const supportedVideoTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
  if (isVideo && !supportedVideoTypes.includes(file.type.toLowerCase())) {
    throw new Error('This video format is not supported yet. Use MP4, MOV or WebM.');
  }

  const maxSize = isVideo ? 50 * 1024 * 1024 : isAudio ? 12 * 1024 * 1024 : 5 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error(
      isVideo
        ? 'Video must be smaller than 50 MB.'
        : isAudio
          ? 'Audio must be 12 MB or smaller.'
          : 'Image must be smaller than 5 MB.'
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

  const path = `${id}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('ntwrkh-media')
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('content_assets')
    .insert({
      user_id: id,
      storage_path: path,
      original_filename: file.name,
      mime_type: file.type,
      media_kind: isVideo ? 'video' : isAudio ? 'audio' : 'image',
      size_bytes: file.size,
      status: 'uploaded',
    })
    .select('id,storage_path')
    .single();

  if (error) throw error;

  return data.storage_path;
}


export async function createPost(
  userId: string,
  payload: {
    caption: string;
    analysis: Analysis;
    mediaUrl?: string;
  }
): Promise<Post> {
  const id = requireUserId(userId);

  const { data, error } = await supabase
    .from('community_posts')
    .insert({
      author_user_id: id,
      caption: payload.caption,
      media_url: payload.mediaUrl || null,

      hashtags: [
        ...new Set([
          ...(payload.analysis.existingHashtags || []),
          ...(payload.analysis.hashtags || []),
        ]),
      ],

      topic: payload.analysis.topic || null,
      niche: payload.analysis.niche || null,
      analysis: payload.analysis,
      visibility: 'public',
    })
    .select('*')
    .single();

  if (error) throw error;

  return mapPost(data);
}



export async function saveAnalysis(userId: string, caption: string, analysis: Analysis, mediaStoragePath?: string) {
  const id = requireUserId(userId);
  let assetId: string | null = null;
  if (mediaStoragePath) {
    const { data: asset, error: assetError } = await supabase.from('content_assets').select('id').eq('user_id', id).eq('storage_path', mediaStoragePath).maybeSingle();
    if (assetError) throw assetError;
    assetId = asset?.id || null;
  }
  const { data, error } = await supabase.from('analyses').insert({ user_id: id, asset_id: assetId, input_text: caption || null, status: 'completed', analysis, completed_at: new Date().toISOString() }).select('id').single();
  if (error) throw error;
  const generated = [
    { asset_type: 'caption', content: { text: analysis.caption || '' } },
    { asset_type: 'hashtag_set', content: { hashtags: analysis.hashtags || [] } },
    { asset_type: 'recommendation', content: { items: analysis.recommendations || [] } },
  ];
  const { error: generatedError } = await supabase.from('generated_assets').insert(generated.map(item => ({ user_id: id, analysis_id: data.id, asset_type: item.asset_type, content: item.content })));
  if (generatedError) throw generatedError;
  if (assetId) {
    const { error: assetUpdateError } = await supabase.from('content_assets').update({ status: 'analyzed' }).eq('id', assetId).eq('user_id', id);
    if (assetUpdateError) throw assetUpdateError;
  }
  return data.id;
}

export async function loadAIJobs(userId: string): Promise<AIJob[]> {
  requireUserId(userId);
  const { data, error } = await supabase.functions.invoke('ntwrkh-ai-queue', {
    body: { mode: 'list' },
  });
  if (error) {
    const context = (error as any)?.context;
    if (context?.json) {
      const details = await context.json().catch(() => null);
      if (details?.error) throw new Error(details.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return Array.isArray(data?.jobs) ? data.jobs as AIJob[] : [];
}

export async function loadAIUsageSummary(userId: string): Promise<AIUsageSummary> {
  requireUserId(userId);
  const { data, error } = await supabase.functions.invoke('ntwrkh-ai-queue', {
    body: { mode: 'usage' },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.summary as AIUsageSummary;
}

export async function invokeAI<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const requestId = crypto.randomUUID();

  // YouTube search is a read-only API lookup, not a billable generative AI job.
  if (action === 'youtube-search') {
    const { data, error } = await supabase.functions.invoke('ntwrkh-ai', {
      body: { action, ...payload, requestId },
    });
    if (error) {
      const context = (error as any)?.context;
      if (context?.json) {
        const details = await context.json().catch(() => null);
        if (details?.error) throw new Error(details.error);
      }
      throw error;
    }
    if (data?.error) throw new Error(data.error);
    return data as T;
  }

  const readFunctionError = async (error: any) => {
    const context = error?.context;
    if (context?.json) {
      const details = await context.json().catch(() => null);
      if (details?.error) return String(details.error);
    }
    return error?.message || 'The AI request could not be completed.';
  };

  const { data: submitted, error: submitError } = await supabase.functions.invoke('ntwrkh-ai-queue', {
    body: { mode: 'submit', action, payload, requestId },
  });
  if (submitError) throw new Error(await readFunctionError(submitError));
  if (!submitted?.jobId) throw new Error(submitted?.error || 'NTWRKH could not queue this request.');

  // A worker claims one job at a time. Polling lets the UI wait safely while
  // other jobs for this account finish first or a temporary failure is retried.
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const { error: workerError } = await supabase.functions.invoke('ntwrkh-ai-worker', {
      body: {},
    });
    if (workerError) throw new Error(await readFunctionError(workerError));

    const { data: statusData, error: statusError } = await supabase.functions.invoke('ntwrkh-ai-queue', {
      body: { mode: 'status', jobId: submitted.jobId },
    });
    if (statusError) throw new Error(await readFunctionError(statusError));
    const job = statusData?.job;
    if (!job) throw new Error('NTWRKH could not find the queued AI request.');
    if (job.status === 'completed') return job.result as T;
    if (job.status === 'failed') throw new Error(job.error_message || 'NTWRKH could not complete this AI request.');

    await new Promise((resolve) => setTimeout(resolve, job.status === 'retrying' ? 5000 : 1500));
  }

  throw new Error('Your request is still processing. Please try again in a moment; it has not been discarded.');
}

async function getOrCreateConversation(userId: string): Promise<string> {
  const id = requireUserId(userId);
  const { data: existing, error: readError } = await supabase.from('conversations').select('id').eq('user_id', id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (readError) throw readError;
  if (existing?.id) return existing.id;
  const { data, error } = await supabase.from('conversations').insert({ user_id: id, title: 'NTWRKH assistant' }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function loadChat(userId: string): Promise<ChatMessage[]> {
  const id = requireUserId(userId);
  const { data: conversation, error: conversationError } = await supabase.from('conversations').select('id').eq('user_id', id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) return [];
  const { data, error } = await supabase.from('messages').select('role,content,created_at').eq('conversation_id', conversation.id).order('created_at', { ascending: true }).limit(100);
  if (error) throw error;
  return (data || []).map((m: any) => ({ role: m.role, content: m.content, createdAt: m.created_at }));
}

export async function sendChat(userId: string, message: string): Promise<ChatMessage[]> {
  const id = requireUserId(userId);
  const conversationId = await getOrCreateConversation(id);
  const { error: saveUserError } = await supabase.from('messages').insert({ conversation_id: conversationId, user_id: id, role: 'user', content: message });
  if (saveUserError) throw saveUserError;
  const history = await loadChat(id);
  const result = await invokeAI<{ reply: string }>('assistant', { message, history: history.slice(0, -1).slice(-16) });
  const { error: saveAssistantError } = await supabase.from('messages').insert({ conversation_id: conversationId, user_id: id, role: 'assistant', content: result.reply });
  if (saveAssistantError) throw saveAssistantError;
  await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
  return loadChat(id);
}


export async function loadLibrary(userId: string): Promise<LibraryData> {
  const id = requireUserId(userId);
  const [analysisResult, assetResult, planResult, conversationResult] = await Promise.all([
    supabase.from('analyses').select('id,input_text,analysis,created_at,asset_id').eq('user_id', id).order('created_at', { ascending: false }).limit(100),
    supabase.from('content_assets').select('id,original_filename,media_kind,status,storage_path,created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(100),
    supabase.from('publishing_plans').select('id,platform,status,payload,created_at,updated_at').eq('user_id', id).order('created_at', { ascending: false }).limit(100),
    supabase.from('conversations').select('id,title,updated_at').eq('user_id', id).order('updated_at', { ascending: false }).limit(50),
  ]);
  for (const result of [analysisResult, assetResult, planResult, conversationResult]) {
    if (result.error) throw result.error;
  }
  const assets = (assetResult.data || []).map((row: any) => ({
    id: row.id,
    fileName: row.original_filename || 'Uploaded content',
    mediaKind: row.media_kind || 'file',
    status: row.status || 'uploaded',
    storagePath: row.storage_path,
    createdAt: row.created_at,
  })) as SavedAsset[];
  const assetsById = new Map(assets.map(asset => [asset.id, asset]));
  const analyses = (analysisResult.data || []).map((row: any) => {
    const asset = row.asset_id ? assetsById.get(row.asset_id) : undefined;
    return {
      id: row.id,
      inputText: row.input_text || '',
      analysis: row.analysis || {},
      createdAt: row.created_at,
      assetId: row.asset_id,
      assetName: asset?.fileName,
      mediaKind: asset?.mediaKind,
    };
  }) as SavedAnalysis[];
  const plans = (planResult.data || []).map((row: any) => ({
    id: row.id,
    platform: row.platform,
    status: row.status,
    payload: row.payload || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })) as SavedPlan[];
  const conversations = (conversationResult.data || []).map((row: any) => ({
    id: row.id,
    title: row.title || 'NTWRKH assistant',
    updatedAt: row.updated_at,
  })) as SavedConversation[];
  if (conversations.length) {
    const ids = conversations.map(item => item.id);
    const { data: messageRows, error: messageError } = await supabase
      .from('messages')
      .select('conversation_id,content,created_at')
      .eq('user_id', id)
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
      .limit(200);
    if (messageError) throw messageError;
    const latestByConversation = new Map<string, string>();
    for (const message of messageRows || []) {
      if (!latestByConversation.has(message.conversation_id)) latestByConversation.set(message.conversation_id, message.content);
    }
    for (const conversation of conversations) conversation.lastMessage = latestByConversation.get(conversation.id);
  }
  return { analyses, plans, assets, conversations };
}

export async function saveWorkspacePlan(
  userId: string,
  platform: string,
  kind: 'distribution' | 'creator-plan',
  title: string,
  plan: any,
  source?: Record<string, unknown>,
): Promise<SavedPlan> {
  const id = requireUserId(userId);
  const payload = { kind, title: title.trim() || 'Saved strategy', plan, source: source || {} };
  const { data, error } = await supabase.from('publishing_plans')
    .insert({ user_id: id, platform, status: 'draft', payload })
    .select('id,platform,status,payload,created_at,updated_at')
    .single();
  if (error) throw error;
  return {
    id: data.id, platform: data.platform, status: data.status, payload: data.payload,
    createdAt: data.created_at, updatedAt: data.updated_at,
  };
}

export async function renameWorkspacePlan(userId: string, planId: string, title: string): Promise<SavedPlan> {
  const id = requireUserId(userId);
  const { data: current, error: readError } = await supabase.from('publishing_plans')
    .select('id,platform,status,payload,created_at,updated_at')
    .eq('id', planId).eq('user_id', id).single();
  if (readError) throw readError;
  const payload = { ...(current.payload || {}), title: title.trim() || 'Saved strategy' };
  const { data, error } = await supabase.from('publishing_plans')
    .update({ payload, updated_at: new Date().toISOString() })
    .eq('id', planId).eq('user_id', id)
    .select('id,platform,status,payload,created_at,updated_at').single();
  if (error) throw error;
  return { id: data.id, platform: data.platform, status: data.status, payload: data.payload, createdAt: data.created_at, updatedAt: data.updated_at };
}

export async function deleteWorkspacePlan(userId: string, planId: string): Promise<void> {
  const id = requireUserId(userId);
  const { error } = await supabase.from('publishing_plans').delete().eq('id', planId).eq('user_id', id);
  if (error) throw error;
}

export async function deleteSavedAnalysis(userId: string, analysisId: string): Promise<void> {
  const id = requireUserId(userId);
  const { error } = await supabase.from('analyses').delete().eq('id', analysisId).eq('user_id', id);
  if (error) throw error;
}
