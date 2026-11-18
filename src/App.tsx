import { useEffect, useMemo, useState } from 'react';
import {
  getSession, mapUser, signInWithGoogle, signOut as supabaseSignOut,
  loadProfile, loadPosts, loadChat, saveProfile as persistProfile,
  createPost, uploadMedia, invokeAI, sendChat, saveAnalysis, loadAIJobs,
} from './lib/services';
import { supabase } from './lib/supabase';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  FileImage,
  Filter,
  Hash,
  Home,
  Lightbulb,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Video,
  Youtube,
  ExternalLink,
  Eye,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';
import { PlayCircle } from 'lucide-react';

type User = {
  userId: string;
  name?: string;
  picture?: string;
  tiktok?: {
    openId: string;
    displayName: string;
    avatarUrl: string;
    scopes: string[];
    connectedAt: string;
  };
};
type Profile = {
  name?: string;
  userType?: string;
  niche?: string;
  goals?: string;
  bio?: string;
};
type Analysis = {
  topic?: string;
  niche?: string;
  audience?: string;
  contentFormat?: string;
  existingHashtags?: string[];
  existingMentions?: string[];
  hashtags?: string[];
  keywords?: string[];
  caption?: string;
  recommendations?: string[];
};
type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
};
type Post = {
  id: string;
  ownerId: string;
  caption: string;
  topic?: string;
  niche?: string;
  hashtags?: string[];
  analysis?: Analysis;
  createdAt: string;
  visibility?: string;
};
type View =
  | 'NTWRKH assistant'
  | 'Overview'
  | 'Discover'
  | 'Create content'
  | 'Audience finder'
  | 'Distribution planner'
  | 'Analytics'
  | 'AI activity'
  | 'YouTube Discover'
  | 'TikTok Creator Lab'
  | 'TikTok account'
  | 'My profile';

const nav = [
  { label: 'NTWRKH assistant' as View, icon: Sparkles },
  { label: 'AI activity' as View, icon: Activity },
  { label: 'Discover' as View, icon: Compass },
  { label: 'YouTube Discover' as View, icon: Youtube },
  { label: 'Distribution planner' as View, icon: Target },
  { label: 'My profile' as View, icon: Settings },
];

const sampleTopics = [
  'Fashion & style',
  'Food & lifestyle',
  'Technology',
  'Beauty',
  'Entertainment',
  'Business',
];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>({});
  const [posts, setPosts] = useState<Post[]>([]);
  const [view, setView] = useState<View>('NTWRKH assistant');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [caption, setCaption] = useState('');
  const [imageData, setImageData] = useState('');
  const [imageMime, setImageMime] = useState('image/jpeg');
  const [imageName, setImageName] = useState('');
  const [videoFrames, setVideoFrames] = useState<string[]>([]);
  const [uploadedImageUrl, setUploadedImageUrl] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [distribution, setDistribution] = useState<any>(null);
  const [profileDraft, setProfileDraft] = useState<Profile>({});
  const [search, setSearch] = useState('');
  const [audienceNiche, setAudienceNiche] = useState('');
  const [selectedPost, setSelectedPost] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [tiktokConfigured, setTiktokConfigured] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [tiktokNiche, setTiktokNiche] = useState('');
  const [tiktokAudience, setTiktokAudience] = useState('');
  const [tiktokGoal, setTiktokGoal] = useState('Grow a relevant audience');
  const [tiktokFormat, setTiktokFormat] = useState('Short-form talking video');
  const [tiktokRegion, setTiktokRegion] = useState('');
  const [tiktokPlan, setTiktokPlan] = useState<any>(null);
  const [youtubeQuery, setYoutubeQuery] = useState('');
  const [youtubeType, setYoutubeType] = useState<'video' | 'channel'>('video');
  const [youtubeOrder, setYoutubeOrder] = useState('relevance');
  const [youtubeRegion, setYoutubeRegion] = useState('');
  const [youtubeResults, setYoutubeResults] = useState<any[]>([]);
  const [youtubeBusy, setYoutubeBusy] = useState(false);
  const [youtubeSearched, setYoutubeSearched] = useState(false);
  const [youtubeError, setYoutubeError] = useState('');

  async function loadWorkspace(currentUser: User) {
    const [nextProfile, nextPosts, nextMessages] = await Promise.all([
      loadProfile(currentUser.userId),
      loadPosts(currentUser.userId),
      loadChat(currentUser.userId).catch(() => []),
    ]);
    setProfile(nextProfile);
    setProfileDraft(nextProfile);
    setPosts(nextPosts);
    setChatMessages(nextMessages);
    setAudienceNiche(nextProfile.niche || '');
    if (!nextProfile.userType || !nextProfile.niche) setView('My profile');
  }

  useEffect(() => {
    let active = true;
    getSession().then(async ({ user: restored }) => {
      if (!active) return;
      setGoogleConfigured(true);
      setTiktokConfigured(false);
      setUser(restored);
      if (restored) {
        try { await loadWorkspace(restored); }
        catch { setError('We could not load your workspace. Please refresh and try again.'); }
      }
      const params = new URLSearchParams(window.location.search);
      const authError = params.get('error_description') || params.get('auth_error') || params.get('tiktok_error');
      if (authError) {
        setError(authError);
        window.history.replaceState({}, '', window.location.pathname);
      }
      if (active) setLoading(false);
    }).catch(() => {
      if (active) { setError('NTWRKH could not restore your session. Please try again.'); setLoading(false); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const nextUser = session?.user ? mapUser(session.user) : null;
      setUser(nextUser);
      if (nextUser) loadWorkspace(nextUser).catch(() => setError('We could not load your workspace. Please refresh and try again.'));
      else { setPosts([]); setProfile({}); setChatMessages([]); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const ownPosts = useMemo(
    () => posts.filter(p => p.ownerId === user?.userId),
    [posts, user]
  );
  const visiblePosts = useMemo(
    () =>
      posts.filter(p =>
        (p.caption + ' ' + (p.topic || '') + ' ' + (p.niche || ''))
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [posts, search]
  );
  const activePost = ownPosts.find(p => p.id === selectedPost) || ownPosts[0];

  async function signIn() {
    setError('');
    try { await signInWithGoogle(); }
    catch (e: any) { setError(e?.message || 'Google authorization could not start. Check that Google is enabled in Supabase Authentication.'); }
  }

  async function signInWithTikTok() {
    setError('TikTok is now a connected-platform integration, not a sign-in provider. Sign in with Google first, then connect TikTok from your workspace.');
  }

  async function signOut() {
    try { await supabaseSignOut(); }
    finally { setUser(null); setPosts([]); setProfile({}); setChatMessages([]); }
  }

  async function saveProfile() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const savedProfile = await persistProfile(user!.userId, profileDraft);
      setProfile(savedProfile);
      setNotice('Your profile has been saved.');
      setView('Overview');
    } catch (e) {
      setError('Could not save your profile. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function extractVideoFrames(file: File): Promise<string[]> {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.src = url;
    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('The video could not be decoded in this browser.'));
      });
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (!duration) throw new Error('This video has no readable duration.');
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Video frame processing is unavailable.');
      const frames: string[] = [];
      for (const point of [0.12, 0.5, 0.88]) {
        const targetTime = Math.min(Math.max(0, duration * point), Math.max(0, duration - 0.1));
        await new Promise<void>((resolve, reject) => {
          const onSeeked = () => { cleanup(); resolve(); };
          const onError = () => { cleanup(); reject(new Error('A video frame could not be read.')); };
          const cleanup = () => {
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
          };
          video.addEventListener('seeked', onSeeked, { once: true });
          video.addEventListener('error', onError, { once: true });
          if (Math.abs(video.currentTime - targetTime) < 0.01) {
            cleanup();
            resolve();
          } else {
            video.currentTime = targetTime;
          }
        });
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.78).split(',')[1]);
      }
      return frames;
    } finally {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    }
  }

  async function chooseImage(file?: File) {
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) { setError('Choose an image or video file.'); return; }
    if (file.size > (isVideo ? 50 : 5) * 1024 * 1024) { setError(isVideo ? 'Choose a video smaller than 50 MB.' : 'Choose an image smaller than 5 MB.'); return; }
    setError('');
    setImageName(file.name);
    setImageMime(file.type);
    setUploadedImageUrl('');
    setImageData('');
    setVideoFrames([]);
    try {
      if (isImage) {
        const reader = new FileReader();
        const data = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
          reader.onerror = () => reject(new Error('We could not read that image.'));
          reader.readAsDataURL(file);
        });
        setImageData(data);
      } else {
        const frames = await extractVideoFrames(file);
        setVideoFrames(frames);
      }
      if (user?.userId) setUploadedImageUrl(await uploadMedia(user.userId, file));
    } catch (e: any) {
      setError(e?.message || 'We could not prepare this media. Please try another file.');
    }
  }

  async function analyzeContent() {
    if (!caption.trim() && !imageData && videoFrames.length === 0) {
      setError('Add the existing post caption or upload its image/video first.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    setAnalysis(null);
    try {
      const result = await invokeAI<{ analysis: Analysis }>('analyze', { caption, imageData: imageData || undefined, imageMimeType: imageMime, imageFrames: videoFrames });
      setAnalysis(result.analysis);
      if (user?.userId) await saveAnalysis(user.userId, caption, result.analysis);
    } catch (e: any) {
      console.error('NTWRKH content analysis failed:', e);
      setError(e?.message || 'The AI analysis could not be completed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function publishPost() {
    if (!analysis) {
      setError('Analyze your content before adding it to NTWRKH.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const post = await createPost(user!.userId, { caption: caption || analysis.caption || '', analysis, mediaUrl: uploadedImageUrl || undefined });
      setPosts(current => [post, ...current]);
      setCaption('');
      setImageData('');
      setImageName('');
      setVideoFrames([]);
      setUploadedImageUrl('');
      setAnalysis(null);
      setNotice('Your content is now discoverable on NTWRKH.');
      setView('Discover');
    } catch (e) {
      setError('We could not publish this content. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function sendChatMessage(message?: string) {
    const content = (message ?? chatInput).trim();
    if (!content || chatBusy) return;
    setChatInput('');
    setChatMessages(current => [
      ...current,
      { role: 'user', content, createdAt: new Date().toISOString() },
    ]);
    setChatBusy(true);
    setError('');
    try {
      const messages = await sendChat(user!.userId, content);
      setChatMessages(messages);
    } catch {
      setError('NTWRKH could not respond just now. Please try sending your message again.');
    } finally {
      setChatBusy(false);
    }
  }

  async function findAudience() {
    if (!audienceNiche.trim()) {
      setError('Enter a niche to find relevant audiences.');
      return;
    }
    setBusy(true);
    setError('');
    setDistribution(null);
    try {
      const result = await invokeAI<{ plan: any }>('distribution', { niche: audienceNiche, content: activePost?.caption || '', topic: activePost?.topic || '', hashtags: activePost?.hashtags || [], mentions: (activePost?.caption.match(/@[\w.]+/g) || []) });
      setDistribution(result.plan);
    } catch (e) {
      setError(
        'Audience recommendations are temporarily unavailable. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function searchYouTube() {
    const query = youtubeQuery.trim();
    if (query.length < 2) {
      setYoutubeError('Enter at least two characters to search YouTube.');
      return;
    }
    setYoutubeBusy(true);
    setYoutubeError('');
    setYoutubeSearched(true);
    try {
      const result = await invokeAI<{ results: any[] }>('youtube-search', { q: query, type: youtubeType, order: youtubeOrder, maxResults: 12, regionCode: youtubeRegion.trim().toUpperCase() });
      setYoutubeResults(result.results || []);
    } catch (e: any) {
      setYoutubeResults([]);
      setYoutubeError(e?.response?.data?.error || e?.message || 'YouTube search failed. Please try again.');
    } finally {
      setYoutubeBusy(false);
    }
  }

  async function generateTikTokPlan() {
    if (!tiktokNiche.trim()) { setError('Enter your TikTok niche before generating a plan.'); return; }
    setBusy(true); setError(''); setNotice(''); setTiktokPlan(null);
    try {
      const result = await invokeAI<{ plan: any }>('tiktok-plan', { niche: tiktokNiche, audience: tiktokAudience, goal: tiktokGoal, format: tiktokFormat, region: tiktokRegion });
      setTiktokPlan(result.plan);
    } catch { setError('The TikTok content plan could not be generated. Please try again.'); }
    finally { setBusy(false); }
  }

  async function makeDistributionPlan() {
    if (!activePost) {
      setError('Create or publish a piece of content first.');
      return;
    }
    setBusy(true);
    setError('');
    setDistribution(null);
    try {
      const result = await invokeAI<{ plan: any }>('distribution', { niche: activePost.niche || profile.niche || 'General', content: activePost.caption, topic: activePost.topic || '', hashtags: activePost.hashtags || [], mentions: (activePost.caption.match(/@[\w.]+/g) || []) });
      setDistribution(result.plan);
    } catch (e) {
      setError('We could not generate a plan. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <div className="loading-screen">
        <img className="brand-logo" src="/resources/ntwrkh-logo.png" alt="NTWRKH" />
        <Loader2 className="spin" size={20} />
        <span>Preparing your NTWRKH workspace</span>
      </div>
    );

  if (!user)
    return (
      <div className="auth-screen">
        <div className="auth-left">
          <div className="brand">
            <img className="brand-logo" src="/resources/ntwrkh-logo.png" alt="NTWRKH" />
            <span>NTWRKH</span>
          </div>
          <div className="auth-copy">
            <span className="eyebrow">
              <Sparkles size={14} /> CONTENT DISCOVERY, REIMAGINED
            </span>
            <h1>
              Your content deserves to find <em>its people.</em>
            </h1>
            <p>
              Understand your content, discover relevant audiences and get
              smarter recommendations for where to share next.
            </p>
            <div className="auth-points">
              <span>
                <Check size={15} /> AI content intelligence
              </span>
              <span>
                <Check size={15} /> Audience discovery
              </span>
              <span>
                <Check size={15} /> Practical distribution plans
              </span>
            </div>
          </div>
          <div className="auth-foot">Make every post more intentional.</div>
        </div>
        <div className="auth-right">
          <div className="auth-card">
            <div className="mobile-brand brand">
              <img className="brand-logo" src="/resources/ntwrkh-logo.png" alt="NTWRKH" />
              <span>NTWRKH</span>
            </div>
            <span className="eyebrow">YOUR SOCIAL IDENTITY STARTS HERE</span>
            <h2>Continue with Google.</h2>
            <p className="muted">
              Use your Google account to sign in to NTWRKH and optionally authorize access to your YouTube channel. Your Google credentials stay private.
            </p>
            <button className="primary-btn full" onClick={signIn} disabled={!googleConfigured}>
              <ArrowRight size={17} /> {googleConfigured ? 'Continue with Google' : 'Google sign-in unavailable'} <ArrowRight size={17} />
            </button>
            {!googleConfigured && <p className="tiktok-setup-hint">Google sign-in is managed securely by Supabase. If it fails, check the Google provider settings.</p>}
            {tiktokConfigured && <button className="secondary-btn full" onClick={signInWithTikTok} style={{ marginTop: 12 }}><Video size={17} /> Existing TikTok account? Sign in</button>}
            {error && <div className="error-box">{error}</div>}
            <p className="legal">
              By continuing, you agree to use NTWRKH responsibly and respect the
              rights and privacy of other creators.
            </p>
          </div>
        </div>
      </div>
    );

  return (
    <div className="app-shell">
      <aside className={'sidebar ' + (mobileNav ? 'sidebar-open' : '')}>
        <div className="brand side-brand">
          <img className="brand-logo" src="/resources/ntwrkh-logo.png" alt="NTWRKH" />
          <span>NTWRKH</span>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {nav.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                className={'nav-item ' + (view === item.label ? 'active' : '')}
                onClick={async () => {
                  setView(item.label);
                  setMobileNav(false);
                  setError('');
                  if (item.label === 'NTWRKH assistant') {
                    try {
                      const messages = await loadChat(user!.userId);
                      setChatMessages(messages);
                    } catch {
                      setError('Conversation history could not be loaded. Please try again.');
                    }
                  }
                }}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.label === 'Create content' && (
                  <span className="nav-plus">+</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon">
              <Zap size={17} />
            </div>
            <strong>Grow with intention</strong>
            <p>Build a clearer picture of who your content can reach.</p>
            <button onClick={() => setView('Distribution planner')}>
              Explore your reach <ArrowRight size={14} />
            </button>
          </div>
          <div className="user-mini">
            <div className="avatar">
              {(profile.name || user.name || user.email || 'R')
                .slice(0, 1)
                .toUpperCase()}
            </div>
            <div className="user-mini-copy">
              <strong>{profile.name || user.name || 'Your account'}</strong>
              <span>{profile.userType || 'NTWRKH member'}</span>
            </div>
            <button className="icon-btn" title="Sign out" onClick={signOut}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="scrim"
          onClick={() => setMobileNav(false)}
          aria-label="Close navigation"
        />
      )}
      <main className="main-area">
        <header className="topbar">
          <button
            className="mobile-menu icon-btn"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{view}</strong>
          </div>
          <div className="top-actions">
            <span className="status-pill">
              <span /> AI workspace
            </span>
            <button className="icon-btn notification" title="Notifications">
              <Bell size={18} />
            </button>
            <div className="avatar small">
              {(profile.name || user.name || 'R').slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>
        <div className="page-content">
          {error && (
            <div className="error-box global-error">
              <span>{error}</span>
              <button onClick={() => setError('')}>
                <X size={15} />
              </button>
            </div>
          )}
          {notice && (
            <div className="success-box">
              <Check size={16} /> {notice}
              <button onClick={() => setNotice('')}>
                <X size={15} />
              </button>
            </div>
          )}
          {view === 'NTWRKH assistant' && (
            <ReachAssistant
              messages={chatMessages}
              input={chatInput}
              setInput={setChatInput}
              busy={chatBusy}
              send={sendChatMessage}
              caption={caption}
              setCaption={setCaption}
              imageName={imageName}
              chooseImage={chooseImage}
              analysis={analysis}
              analyze={analyzeContent}
              analyzing={busy}
              distribution={distribution}
              findAudience={async () => {
                if (!analysis && !caption.trim()) { setError('Add content and analyse it first.'); return; }
                setBusy(true); setError(''); setDistribution(null);
                try {
                  const result = await invokeAI<{ plan: any }>('distribution', { niche: analysis?.niche || profile.niche || 'General', content: caption || analysis?.caption || '', topic: analysis?.topic || '', hashtags: analysis?.existingHashtags || [], mentions: analysis?.existingMentions || [] });
                  setDistribution(result.plan);
                } catch {
                  setError('We could not find distribution opportunities just now. Please try again.');
                } finally { setBusy(false); }
              }}
              finding={busy}
            />
          )}
          {view === 'AI activity' && user && (
            <AIActivity userId={user.userId} />
          )}
          {view === 'Overview' && (
            <Overview profile={profile} posts={ownPosts} setView={setView} />
          )}
          {view === 'Discover' && (
            <Discover
              posts={visiblePosts}
              search={search}
              setSearch={setSearch}
            />
          )}
          {view === 'YouTube Discover' && (
            <YouTubeDiscover
              query={youtubeQuery}
              setQuery={setYoutubeQuery}
              type={youtubeType}
              setType={setYoutubeType}
              order={youtubeOrder}
              setOrder={setYoutubeOrder}
              region={youtubeRegion}
              setRegion={setYoutubeRegion}
              results={youtubeResults}
              busy={youtubeBusy}
              searched={youtubeSearched}
              error={youtubeError}
              search={searchYouTube}
            />
          )}
          {view === 'Create content' && (
            <CreateContent
              caption={caption}
              setCaption={setCaption}
              imageName={imageName}
              chooseImage={chooseImage}
              analysis={analysis}
              busy={busy}
              analyze={analyzeContent}
              publish={publishPost}
            />
          )}
          {view === 'Audience finder' && (
            <AudienceFinder
              niche={audienceNiche}
              setNiche={setAudienceNiche}
              busy={busy}
              find={findAudience}
              plan={distribution}
            />
          )}
          {view === 'Distribution planner' && (
            <DistributionPlanner
              posts={ownPosts}
              selectedPost={selectedPost}
              setSelectedPost={setSelectedPost}
              activePost={activePost}
              plan={distribution}
              busy={busy}
              generate={makeDistributionPlan}
            />
          )}
          {view === 'Analytics' && <Analytics posts={ownPosts} />}
          {view === 'TikTok Creator Lab' && <TikTokCreatorLab niche={tiktokNiche} setNiche={setTiktokNiche} audience={tiktokAudience} setAudience={setTiktokAudience} goal={tiktokGoal} setGoal={setTiktokGoal} format={tiktokFormat} setFormat={setTiktokFormat} region={tiktokRegion} setRegion={setTiktokRegion} plan={tiktokPlan} busy={busy} generate={generateTikTokPlan} />}
          {view === 'TikTok account' && user && <TikTokAccount user={user} />
          }{view === 'My profile' && (
            <ProfileEditor
              draft={profileDraft}
              setDraft={setProfileDraft}
              busy={busy}
              save={saveProfile}
            />
          )}
        </div>
      </main>
    </div>
  );
}

type AIJob = {
  id: string;
  action: string;
  status: 'queued' | 'processing' | 'retrying' | 'completed' | 'failed';
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  last_error_code?: string | null;
};

function AIActivity({ userId }: { userId: string }) {
  const [jobs, setJobs] = useState<AIJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    setRefreshing(true);
    try {
      const rows = await loadAIJobs(userId);
      setJobs(rows);
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Could not load AI activity.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [userId]);

  const actionLabel = (action: string) => ({
    analyze: 'Content analysis',
    assistant: 'NTWRKH assistant',
    distribution: 'Distribution plan',
    'tiktok-plan': 'TikTok creator plan',
  }[action] || action.replace(/-/g, ' '));

  const statusLabel = (status: string) => ({
    queued: 'Queued',
    processing: 'Processing',
    retrying: 'Retry scheduled',
    completed: 'Completed',
    failed: 'Failed',
  }[status] || status);

  const dateLabel = (value?: string | null) =>
    value ? new Date(value).toLocaleString() : '—';

  return (
    <>
      <PageHeading
        eyebrow="YOUR AI WORKFLOW"
        title="AI activity"
        subtitle="Track requests as they move through NTWRKH. Processing continues even when you leave the app."
        action={
          <button className="secondary-btn" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? <Loader2 className="spin" size={15} /> : <Activity size={15} />}
            {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
        }
      />
      {error && <div className="error-box">{error}</div>}
      <div className="panel ai-activity-panel">
        <div className="panel-head">
          <div>
            <h3>Recent AI requests</h3>
            <p>Latest 25 requests · refreshes automatically</p>
          </div>
          <span className="ai-job-count">{jobs.length} shown</span>
        </div>
        {loading ? (
          <div className="ai-activity-loading"><Loader2 className="spin" size={20} /> Loading activity…</div>
        ) : jobs.length ? (
          <div className="ai-job-list">
            {jobs.map(job => (
              <div className="ai-job-row" key={job.id}>
                <div className="ai-job-main">
                  <strong>{actionLabel(job.action)}</strong>
                  <span>Submitted {dateLabel(job.created_at)}</span>
                  {job.error_message && job.status === 'failed' && (
                    <small className="ai-job-error">{job.error_message}</small>
                  )}
                </div>
                <div className="ai-job-meta">
                  <span className={'ai-job-status status-' + job.status}>
                    <i /> {statusLabel(job.status)}
                  </span>
                  <small>{job.completed_at ? 'Finished ' + dateLabel(job.completed_at) : job.started_at ? 'Started ' + dateLabel(job.started_at) : 'Waiting to start'}</small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Activity}
            title="No AI activity yet"
            text="When you analyze content, create a distribution plan or chat with the assistant, your requests will appear here."
          />
        )}
      </div>
    </>
  );
}

function YouTubeDiscover({ query, setQuery, type, setType, order, setOrder, region, setRegion, results, busy, searched, error, search }: any) {
  const formatCount = (value: string | number) => {
    if (value === '' || value === undefined || value === null) return 'Not public';
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(number) : String(value);
  };
  return (
    <>
      <PageHeading
        eyebrow="YOUTUBE CONTENT INTELLIGENCE"
        title="Discover beyond your feed."
        subtitle="Find relevant videos and creators using YouTube's public data. Search results are discovery signals, not endorsements or guaranteed performance."
      />
      <div className="panel youtube-search-panel">
        <div className="youtube-search-top">
          <div className="youtube-search-brand"><Youtube size={20} /><span>YOUTUBE DISCOVERY</span></div>
          <span className="youtube-api-note"><i /> Public data via YouTube Data API</span>
        </div>
        <form className="youtube-search-form" onSubmit={e => { e.preventDefault(); search(); }}>
          <div className="youtube-query-field"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search a topic, niche, keyword or creator..." aria-label="Search YouTube" /></div>
          <button className="primary-btn" type="submit" disabled={busy || query.trim().length < 2}>{busy ? <Loader2 className="spin" size={16} /> : <Search size={16} />} Search</button>
        </form>
        <div className="youtube-search-options">
          <div className="youtube-tabs">
            <button type="button" className={type === 'video' ? 'active' : ''} onClick={() => setType('video')}><PlayCircle size={15} /> Videos</button>
            <button type="button" className={type === 'channel' ? 'active' : ''} onClick={() => setType('channel')}><Users size={15} /> Creators & channels</button>
          </div>
          <div className="youtube-filters">
            <label>Sort
              <select value={order} onChange={e => setOrder(e.target.value)}>
                <option value="relevance">Most relevant</option>
                <option value="viewCount">Most viewed</option>
                <option value="date">Newest</option>
              </select>
            </label>
            <label>Region
              <input value={region} onChange={e => setRegion(e.target.value.toUpperCase().slice(0, 2))} placeholder="Any" maxLength={2} />
            </label>
          </div>
        </div>
      </div>
      {error && <div className="error-box youtube-error">{error}</div>}
      {busy ? (
        <div className="panel youtube-empty"><Loader2 className="spin" size={24} /><strong>Searching YouTube…</strong><span>Finding relevant public videos and channels.</span></div>
      ) : results.length ? (
        <div className="youtube-results-heading"><div><span className="eyebrow">DISCOVERY RESULTS</span><h2>{results.length} {type === 'video' ? 'videos' : 'channels'} for “{query}”</h2></div><span>Public YouTube data</span></div>
      ) : searched && !error ? (
        <div className="panel youtube-empty"><Search size={24} /><strong>No matching results found</strong><span>Try a broader keyword, niche or creator name.</span></div>
      ) : (
        <div className="panel youtube-empty"><div className="youtube-empty-icon"><Youtube size={24} /></div><strong>What do you want to discover?</strong><span>Search a topic to find videos or switch to creators to explore relevant channels.</span><div className="youtube-examples">{['Nigerian tech creators', 'football analysis', 'small business marketing'].map(term => <button key={term} onClick={() => { setQuery(term); }}>{term}</button>)}</div></div>
      )}
      {results.length > 0 && !busy && (
        <div className="youtube-results-grid">
          {results.map((item: any) => (
            <article className="youtube-result-card" key={item.id}>
              {item.thumbnail ? <a href={item.url} target="_blank" rel="noreferrer" className="youtube-thumb"><img src={item.thumbnail} alt="" loading="lazy" /><span>{type === 'video' ? <PlayCircle size={22} /> : <Youtube size={22} />}</span></a> : <div className="youtube-thumb youtube-thumb-empty"><Youtube size={28} /></div>}
              <div className="youtube-result-copy">
                <h3><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h3>
                <p className="youtube-channel">{type === 'video' ? item.channelTitle : (item.customUrl ? '@' + item.customUrl.replace(/^@/, '') : 'YouTube channel')}</p>
                <p className="youtube-description">{item.description || 'No description provided.'}</p>
                <div className="youtube-result-stats">
                  {type === 'video' ? <span><Eye size={13} /> {formatCount(item.viewCount)} views</span> : <><span><Users size={13} /> {item.subscriberCount ? formatCount(item.subscriberCount) + ' subscribers' : 'Subscribers hidden'}</span><span>{formatCount(item.videoCount)} videos</span></>}
                  <a href={item.url} target="_blank" rel="noreferrer">Open on YouTube <ExternalLink size={12} /></a>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function TikTokAccount({ user }: { user: User }) {
  const account = user.tiktok;
  const permissionLabels: Record<string, string> = {
    'user.info.basic': 'Basic profile identity',
    'user.info.profile': 'Extended profile information',
    'user.info.stats': 'Profile statistics',
    'video.list': 'Read public videos',
  };
  return (
    <>
      <PageHeading
        eyebrow="SOCIAL ACCOUNT CONNECTION"
        title="Your TikTok identity."
        subtitle="TikTok is the first connected platform and the starting identity for your NTWRKH account."
      />
      <div className="panel tiktok-account-panel">
        <div className="tiktok-account-top">
          {account?.avatarUrl ? <img src={account.avatarUrl} alt="TikTok profile" /> : <div className="tiktok-avatar"><Video size={24} /></div>}
          <div className="tiktok-account-copy">
            <span className="tiktok-connected"><i /> CONNECTED</span>
            <h2>{account?.displayName || user.name || 'TikTok creator'}</h2>
            <p>Connected through TikTok Login Kit</p>
          </div>
        </div>
        <div className="tiktok-account-details">
          <div><span>NTWRKH identity</span><strong>Created from TikTok</strong></div>
          <div><span>Account ID</span><strong>{account?.openId ? account.openId.slice(0, 8) + '…' : 'Available securely'}</strong></div>
          <div><span>Connected</span><strong>{account?.connectedAt ? new Date(account.connectedAt).toLocaleDateString() : 'Active session'}</strong></div>
        </div>
        <div className="tiktok-permissions">
          <h3>Permissions granted</h3>
          {(account?.scopes || ['user.info.basic']).map(scope => (
            <div className="tiktok-permission" key={scope}><Check size={15} /><span>{permissionLabels[scope] || scope}</span><small>{scope}</small></div>
          ))}
        </div>
        <p className="tiktok-security-note">Your TikTok access and refresh tokens are stored encrypted on NTWRKH's server. They are never sent to the browser.</p>
      </div>
      <div className="panel tiktok-next-panel">
        <div className="large-icon"><Sparkles size={22} /></div>
        <div><h3>What comes next?</h3><p>Once TikTok approves additional permissions, NTWRKH can read your public videos. Content publishing and analytics will be added only after their separate scopes and app review are approved.</p></div>
      </div>
    </>
  );
}

function ReachAssistant({
  messages,
  input,
  setInput,
  busy,
  send,
  caption,
  setCaption,
  imageName,
  chooseImage,
  analysis,
  analyze,
  analyzing,
  distribution,
  findAudience,
  finding,
}: {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  busy: boolean;
  send: (message?: string) => void;
  caption: string;
  setCaption: (value: string) => void;
  imageName: string;
  chooseImage: (file?: File) => void;
  analysis: Analysis | null;
  analyze: () => void;
  analyzing: boolean;
  distribution: any;
  findAudience: () => void;
  finding: boolean;
}) {
  const suggestions = [
    'Analyze my content and identify the audience it could attract.',
    'Help me find communities and channels for my niche.',
    'Build a distribution route for this existing post using relevant hashtags, creators and communities.',
  ];
  return (
    <div className="assistant-page">
      <div className="agent-hero">
        <div className="agent-hero-copy">
          <span className="eyebrow">YOUR CONTENT. OUR INTELLIGENCE.</span>
          <h1>Put your content<br /><em>in the right places.</em></h1>
          <p>Bring an existing post, image or video. NTWRKH identifies what it is, who is likely to care, which hashtags and communities fit, and how to distribute it.</p>
          <div className="agent-steps"><span><b>01</b> Understand</span><span><b>02</b> Find your people</span><span><b>03</b> Plan distribution</span></div>
        </div>
        <div className="agent-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-core"><img src="/resources/ntwrkh-logo.png" alt="" /></div><span className="orbit-node node-a"><Users size={17} /></span><span className="orbit-node node-b"><Compass size={17} /></span><span className="orbit-node node-c"><Target size={17} /></span></div>
      </div>
      <section className="intake-panel">
        <div className="intake-heading"><div><span className="eyebrow">START WITH YOUR CONTENT</span><h2>Bring content you have already created.</h2><p>Upload the original image or video and paste its existing caption. NTWRKH analyses it to find relevant hashtags, audiences, creators and communities.</p></div><span className="intake-ai"><Sparkles size={14} /> AI powered</span></div>
        <textarea className="content-intake" value={caption} onChange={event => setCaption(event.target.value)} placeholder="Paste the caption or text from your existing post. Include its current hashtags and @mentions so NTWRKH can assess them." rows={4} />
        <div className="intake-actions"><label className="upload-content-btn"><FileImage size={17} /> {imageName || 'Upload existing image / video'}<input type="file" accept="image/*,video/*" onChange={event => chooseImage(event.target.files?.[0])} /></label><span className="intake-hint">Images up to 5 MB; videos up to 50 MB. Video analysis samples key frames.</span><button className="primary-btn" onClick={analyze} disabled={analyzing || (!caption.trim() && !imageName)}>{analyzing ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />} Analyse existing content <ArrowRight size={15} /></button></div>
        {analysis && <div className="intelligence-result"><div className="result-topline"><span className="result-check"><Check size={14} /> Content understood</span><span className="result-topic">{analysis.topic || analysis.niche || 'Content analysis'}</span></div><div className="intelligence-grid"><div><small>CONTENT CATEGORY</small><strong>{analysis.niche || 'Being refined'}</strong></div><div><small>CORE TOPIC</small><strong>{analysis.topic || 'Identified from your content'}</strong></div><div><small>LIKELY AUDIENCE</small><strong>{analysis.audience || 'Audience signals identified'}</strong></div></div><div className="intelligence-grid"><div><small>FORMAT</small><strong>{analysis.contentFormat || 'Content'}</strong></div><div><small>EXISTING HASHTAGS</small><strong>{analysis.existingHashtags?.join(' ') || 'None detected'}</strong></div><div><small>EXISTING TAGGED ACCOUNTS</small><strong>{analysis.existingMentions?.join(' ') || 'None detected'}</strong></div></div>{analysis.keywords?.length ? <div className="keyword-row">{analysis.keywords.map((word: string) => <span key={word}>{word}</span>)}</div> : null}{analysis.recommendations?.length ? <ul className="insight-list">{analysis.recommendations.map((item: string, index: number) => <li key={index}>{item}</li>)}</ul> : null}<button className="primary-btn" onClick={findAudience} disabled={finding}>{finding ? <Loader2 className="spin" size={16} /> : <Target size={16} />} Find where this belongs <ArrowRight size={15} /></button></div>}
        {distribution && <div className="distribution-result"><div className="result-topline"><span className="result-check"><Check size={14} /> Distribution route prepared</span><span className="result-topic">Relevance-based recommendations · not live trend data</span></div><p className="distribution-summary">{distribution.summary}</p>{distribution.hashtagGroups?.map((group: any, index: number) => <div className="distribution-section" key={index}><h3>{group.label}</h3><p>{group.purpose}</p><div className="keyword-row">{group.hashtags?.map((tag: string) => <span key={tag}>{tag.startsWith('#') ? tag : `#${tag}`}</span>)}</div></div>)}{distribution.audiences?.length > 0 && <div className="distribution-section"><h3>People most likely to care</h3><ul className="insight-list">{distribution.audiences.map((item: any, i: number) => <li key={i}><b>{item.name}</b> — {item.reason}</li>)}</ul></div>}{distribution.communities?.length > 0 && <div className="distribution-section"><h3>Communities to participate in</h3><ul className="insight-list">{distribution.communities.map((item: any, i: number) => <li key={i}><b>{item.name} · {item.platform}</b> — {item.approach}</li>)}</ul></div>}{distribution.creatorTypes?.length > 0 && <div className="distribution-section"><h3>Creators and accounts to research</h3><ul className="insight-list">{distribution.creatorTypes.map((item: any, i: number) => <li key={i}><b>{item.type}</b> — {item.why} <span>{item.outreachAngle}</span></li>)}</ul></div>}{distribution.actions?.length > 0 && <div className="distribution-section"><h3>Your distribution checklist</h3><ol className="insight-list">{distribution.actions.map((item: string, i: number) => <li key={i}>{item}</li>)}</ol></div>}{distribution.cautions?.length > 0 && <div className="distribution-section"><h3>Keep in mind</h3><ul className="insight-list">{distribution.cautions.map((item: string, i: number) => <li key={i}>{item}</li>)}</ul></div>}</div>}
      </section>
      <div className="agent-chat-heading"><div><span className="eyebrow">WORK WITH THE AGENT</span><h2>Or just tell NTWRKH what you need.</h2></div><span className="assistant-status"><span /> Ready to help</span></div>
      <div className="assistant-chat panel">
        <div className="assistant-thread">
          {messages.length === 0 ? (
            <div className="assistant-empty">
              <div className="assistant-orb"><Sparkles size={25} /></div>
              <h2>What are you trying to reach?</h2>
              <p>Ask about an existing post, its hashtags, relevant creators and communities, or how to expand its reach.</p>
              <div className="assistant-suggestions">
                {suggestions.map(item => (
                  <button key={item} onClick={() => send(item)} disabled={busy}>{item}<ArrowRight size={14} /></button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <div className={'chat-message ' + message.role} key={index}>
                  {message.role === 'assistant' && <span className="chat-avatar"><Sparkles size={15} /></span>}
                  <div className="chat-bubble">{message.content}</div>
                </div>
              ))}
              {busy && (
                <div className="chat-message assistant">
                  <span className="chat-avatar"><Sparkles size={15} /></span>
                  <div className="chat-bubble typing"><span /><span /><span /></div>
                </div>
              )}
            </>
          )}
        </div>
        <form className="assistant-composer" onSubmit={event => { event.preventDefault(); send(); }}>
          <textarea
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder="Ask NTWRKH anything about your content or audience..."
            rows={2}
            maxLength={4000}
            disabled={busy}
          />
          <div className="composer-footer">
            <span>NTWRKH can make recommendations, but cannot guarantee external reach or engagement.</span>
            <button className="primary-btn" type="submit" disabled={busy || !input.trim()}>
              {busy ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
              Send
            </button>
          </div>
        </form>
      </div>
      <div className="assistant-footnote"><MessageCircle size={15} /> Your conversation is private to your signed-in NTWRKH workspace and can be continued from here.</div>
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function Overview({
  profile,
  posts,
  setView,
}: {
  profile: Profile;
  posts: Post[];
  setView: (v: View) => void;
}) {
  const firstName = (profile.name || 'there').split(' ')[0];
  return (
    <>
      <PageHeading
        eyebrow="YOUR CONTENT HQ"
        title={'Good to see you, ' + firstName + '.'}
        subtitle="A clearer path from creating content to finding the people who care about it."
        action={
          <button
            className="primary-btn"
            onClick={() => setView('Create content')}
          >
            <Plus size={17} /> Analyze content
          </button>
        }
      />
      <div className="welcome-banner">
        <div className="welcome-glow" />
        <div className="welcome-copy">
          <span className="banner-tag">
            <Sparkles size={13} /> YOUR NTWRKH STARTS HERE
          </span>
          <h2>Great content is only the beginning.</h2>
          <p>
            NTWRKH helps you understand what you make, identify who might care
            and choose your next distribution move.
          </p>
          <button
            className="light-btn"
            onClick={() => setView('Create content')}
          >
            Analyze your first post <ArrowRight size={15} />
          </button>
        </div>
        <div className="banner-art">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit-core">
            <Target size={34} />
          </div>
          <span className="orbit-dot dot-one" />
          <span className="orbit-dot dot-two" />
          <span className="orbit-dot dot-three" />
        </div>
      </div>
      <div className="section-title">
        <div>
          <h3>Your workspace</h3>
          <p>Early signals from your NTWRKH activity</p>
        </div>
        <span className="subtle-label">UPDATED AS YOU WORK</span>
      </div>
      <div className="stat-grid">
        <Stat
          icon={FileImage}
          label="Content analyzed"
          value={String(posts.length)}
          note="Your published content"
        />
        <Stat
          icon={Users}
          label="Audience matches"
          value="—"
          note="Build your first audience plan"
        />
        <Stat
          icon={Target}
          label="Distribution plans"
          value="—"
          note="Recommendations, not guaranteed reach"
        />
        <Stat
          icon={TrendingUp}
          label="Growth insights"
          value="—"
          note="Connect platform analytics later"
        />
      </div>
      <div className="lower-grid">
        <div className="panel recent-panel">
          <div className="panel-head">
            <div>
              <h3>Recent content</h3>
              <p>Your latest posts on NTWRKH</p>
            </div>
            <button className="text-btn" onClick={() => setView('Discover')}>
              Explore <ArrowRight size={14} />
            </button>
          </div>
          {posts.length ? (
            posts.slice(0, 3).map(post => <PostRow key={post.id} post={post} />)
          ) : (
            <EmptyState
              icon={FileImage}
              title="Your content starts here"
              text="Analyze a post to see its topic, audience fit and distribution ideas."
              action="Create your first analysis"
              onClick={() => setView('Create content')}
            />
          )}
        </div>
        <div className="panel quick-panel">
          <div className="panel-head">
            <div>
              <h3>Quick actions</h3>
              <p>Make your next move</p>
            </div>
          </div>
          <QuickAction
            icon={WandSparkles}
            title="Analyze content"
            text="Find the topic, niche and audience behind a post."
            onClick={() => setView('Create content')}
          />
          <QuickAction
            icon={Users}
            title="Find an audience"
            text="Explore the people and communities around your niche."
            onClick={() => setView('Audience finder')}
          />
          <QuickAction
            icon={Target}
            title="Plan distribution"
            text="Get practical suggestions for where to share."
            onClick={() => setView('Distribution planner')}
          />
        </div>
      </div>
    </>
  );
}

function Stat({ icon: Icon, label, value, note }: any) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <div className="stat-icon">
          <Icon size={17} />
        </div>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function QuickAction({ icon: Icon, title, text, onClick }: any) {
  return (
    <button className="quick-action" onClick={onClick}>
      <span className="quick-icon">
        <Icon size={17} />
      </span>
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
      <ArrowRight size={16} />
    </button>
  );
}
function EmptyState({ icon: Icon, title, text, action, onClick }: any) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={23} />
      </div>
      <strong>{title}</strong>
      <p>{text}</p>
      {action && (
        <button className="text-btn" onClick={onClick}>
          {action} <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}
function PostRow({ post }: { post: Post }) {
  return (
    <div className="post-row">
      <div className="post-thumb">
        <FileImage size={18} />
      </div>
      <div className="post-row-copy">
        <strong>{post.caption || 'Untitled content'}</strong>
        <span>
          {post.topic || 'Topic pending'} · {post.niche || 'Niche pending'}
        </span>
      </div>
      <span className="published-tag">On NTWRKH</span>
    </div>
  );
}

function Discover({ posts, search, setSearch }: any) {
  return (
    <>
      <PageHeading
        eyebrow="THE DISCOVERY SPACE"
        title="Find what resonates."
        subtitle="Explore content shared by the NTWRKH community and discover ideas across different niches."
      />
      <div className="search-bar">
        <Search size={18} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search topics, niches or content..."
        />
        <button>
          <Filter size={16} /> Filters
        </button>
      </div>
      <div className="topic-chips">
        {sampleTopics.map(topic => (
          <button key={topic} onClick={() => setSearch(topic)}>
            {topic}
          </button>
        ))}
      </div>
      {posts.length ? (
        <div className="discover-grid">
          {posts.map((post: Post) => (
            <article className="discover-card" key={post.id}>
              <div className="discover-card-top">
                <span className="topic-label">
                  {post.topic || 'Community post'}
                </span>
                <button className="icon-btn">
                  <Bookmark size={16} />
                </button>
              </div>
              <div className="discover-art">
                <Sparkles size={28} />
                <span>CONTENT / DISCOVERY</span>
              </div>
              <p>{post.caption}</p>
              <div className="discover-meta">
                <span>{post.niche || 'Creator'}</span>
                <span>{new Date(post.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="tag-list">
                {(post.hashtags || []).slice(0, 4).map(tag => (
                  <span key={tag}>#{tag.replace(/^#/, '')}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Compass}
          title="No matching content yet"
          text="Try another search or be one of the first creators to publish something."
        />
      )}
    </>
  );
}

function CreateContent({
  caption,
  setCaption,
  imageName,
  chooseImage,
  analysis,
  busy,
  analyze,
  publish,
}: any) {
  return (
    <>
      <PageHeading
        eyebrow="CONTENT INTELLIGENCE"
        title="Get an existing post discovered."
        subtitle="Upload content you have already made. NTWRKH analyses the media and caption, then maps relevant hashtags, audiences and communities."
      />
      <div className="create-layout">
        <div className="panel editor-panel">
          <div className="panel-head">
            <div>
              <h3>Existing content</h3>
              <p>Bring a post you have already created or published.</p>
            </div>
            <span className="step-count">01 / 02</span>
          </div>
          <label className="field-label">
            Existing post caption and hashtags
          </label>
          <textarea
            className="content-textarea"
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="Paste the existing caption exactly as published, including hashtags and @mentions. You can add context if needed."
          />
          <label className="field-label">
            Upload the existing image or video <span className="optional">OPTIONAL</span>
          </label>
          <label className="upload-zone">
            <input
              type="file"
              accept="image/*,video/*"
              onChange={e => chooseImage(e.target.files?.[0])}
            />
            <span className="upload-icon">
              <FileImage size={22} />
            </span>
            <strong>{imageName || 'Choose existing image or video'}</strong>
            <small>Images up to 5 MB; videos up to 50 MB · Key-frame analysis</small>
          </label>
          <div className="privacy-note">
            <Check size={15} /> Your analysis is linked to your NTWRKH account.
            Only published content appears in discovery.
          </div>
          <button
            className="primary-btn full"
            disabled={busy || (!caption.trim() && !imageName)}
            onClick={analyze}
          >
            {busy ? (
              <Loader2 className="spin" size={17} />
            ) : (
              <Sparkles size={17} />
            )}{' '}
            {busy ? 'Analyzing content...' : 'Analyze with AI'}
          </button>
        </div>
        <div className="panel analysis-panel">
          <div className="panel-head">
            <div>
              <h3>AI content intelligence</h3>
              <p>Your analysis will appear here.</p>
            </div>
            <span className="ai-pill">
              <Sparkles size={12} /> AI
            </span>
          </div>
          {analysis ? (
            <div className="analysis-results">
              <div className="analysis-topic">
                <span className="eyebrow">DETECTED TOPIC</span>
                <h2>{analysis.topic || 'Your content'}</h2>
                <span>{analysis.niche || 'Niche not specified'}</span>
              </div>
              <div className="analysis-block">
                <strong>
                  <Users size={16} /> Likely audience
                </strong>
                <p>{analysis.audience}</p>
              </div>
              <div className="analysis-block">
                <strong>
                  <Hash size={16} /> Suggested hashtags
                </strong>
                <div className="tag-list">
                  {(analysis.hashtags || []).map((tag: string) => (
                    <span key={tag}>#{tag.replace(/^#/, '')}</span>
                  ))}
                </div>
              </div>
              <div className="analysis-block">
                <strong>
                  <Lightbulb size={16} /> Recommendations
                </strong>
                <ul>
                  {(analysis.recommendations || []).map((item: string) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <button
                className="primary-btn full"
                onClick={publish}
                disabled={busy}
              >
                <Check size={16} /> Publish to NTWRKH discovery
              </button>
            </div>
          ) : (
            <div className="analysis-placeholder">
              <div className="placeholder-orb">
                <WandSparkles size={25} />
              </div>
              <strong>Clarity before distribution.</strong>
              <p>
                NTWRKH will turn your content into useful signals: what it is,
                who may care and what to try next.
              </p>
              <div className="placeholder-steps">
                <span>
                  <i>1</i> Understand your content
                </span>
                <span>
                  <i>2</i> Identify relevant audiences
                </span>
                <span>
                  <i>3</i> Recommend next steps
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function TikTokCreatorLab({ niche, setNiche, audience, setAudience, goal, setGoal, format, setFormat, region, setRegion, plan, busy, generate }: any) {
  return (
    <>
      <PageHeading eyebrow="TIKTOK CONTENT INTELLIGENCE" title="Build a smarter TikTok plan." subtitle="Turn your niche and growth goal into a practical weekly content system. These are AI-generated recommendations, not live trend or performance data." />
      <div className="tiktok-lab-layout">
        <div className="panel tiktok-lab-form">
          <div className="panel-head"><div><h3>Your creator brief</h3><p>Give NTWRKH enough context to make the plan specific.</p></div><span className="ai-pill"><Sparkles size={12} /> AI</span></div>
          <div className="form-field"><label className="field-label">Your TikTok niche *</label><input className="text-input" value={niche} onChange={e => setNiche(e.target.value)} placeholder="e.g. Nigerian streetwear, personal finance, gaming" /></div>
          <div className="form-field"><label className="field-label">Who do you want to reach?</label><input className="text-input" value={audience} onChange={e => setAudience(e.target.value)} placeholder="e.g. students, young professionals, small business owners" /></div>
          <div className="form-field"><label className="field-label">Primary goal</label><select className="text-input" value={goal} onChange={e => setGoal(e.target.value)}>{['Grow a relevant audience', 'Generate leads or sales', 'Build authority', 'Get brand collaborations', 'Drive traffic to another platform'].map(x => <option key={x}>{x}</option>)}</select></div>
          <div className="form-field"><label className="field-label">Preferred content format</label><select className="text-input" value={format} onChange={e => setFormat(e.target.value)}>{['Short-form talking video', 'Voiceover with B-roll', 'Tutorial or how-to', 'Storytime', 'Product showcase', 'Faceless video', 'A mix of formats'].map(x => <option key={x}>{x}</option>)}</select></div>
          <div className="form-field"><label className="field-label">Target country or region <span className="optional">OPTIONAL</span></label><input className="text-input" value={region} onChange={e => setRegion(e.target.value)} placeholder="e.g. Nigeria, West Africa, global" /></div>
          <button className="primary-btn full" onClick={generate} disabled={busy || !niche.trim()}>{busy ? <Loader2 className="spin" size={17} /> : <WandSparkles size={17} />}{busy ? 'Building your TikTok plan...' : 'Generate my TikTok plan'}</button>
        </div>
        <div className="panel tiktok-lab-intro">
          <div className="large-icon"><Video size={24} /></div><span className="eyebrow">WHAT NTWRKH WILL BUILD</span><h2>A repeatable content direction, not random posting.</h2>
          <div className="tiktok-lab-benefits"><div><Check size={16} /><span>Clear content positioning and audience fit</span></div><div><Check size={16} /><span>Content pillars and practical video hooks</span></div><div><Check size={16} /><span>A seven-day starter calendar</span></div><div><Check size={16} /><span>Search phrases, hashtag themes and engagement prompts</span></div></div>
          <p className="disclaimer">NTWRKH does not claim to read TikTok's live trends or your account analytics yet. Validate ideas against current TikTok search results and your own performance.</p>
        </div>
      </div>
      {plan && <TikTokPlanResults plan={plan} />}
    </>
  );
}

function TikTokPlanResults({ plan }: any) {
  return (
    <div className="panel tiktok-plan-results">
      <div className="panel-head"><div><span className="eyebrow">YOUR TIKTOK STARTER STRATEGY</span><h2>{plan.positioning}</h2></div><span className="ai-pill"><Sparkles size={12} /> AI generated</span></div>
      <p className="tiktok-plan-audience">{plan.audienceFit}</p>
      <div className="tiktok-plan-grid">
        <section><h3>Content pillars</h3>{(plan.pillars || []).map((x: any, i: number) => <div className="recommendation-item" key={i}><strong>{x.name}</strong><p>{x.angle}</p></div>)}</section>
        <section><h3>Hooks to test</h3>{(plan.hooks || []).map((x: string, i: number) => <div className="tiktok-hook" key={i}><span>{String(i + 1).padStart(2, '0')}</span>{x}</div>)}</section>
      </div>
      <section className="tiktok-calendar-section"><h3>Seven-day content calendar</h3><div className="tiktok-calendar">{(plan.calendar || []).map((x: any, i: number) => <article key={i}><span>DAY {i + 1}</span><strong>{x.topic}</strong><small>{x.format}</small><p>{x.hook}</p></article>)}</div></section>
      <div className="tiktok-plan-grid">
        <section><h3>Search phrases</h3><div className="tag-list">{(plan.searchPhrases || []).map((x: string) => <span key={x}>{x}</span>)}</div></section>
        <section><h3>Hashtag themes</h3><div className="tag-list">{(plan.hashtagThemes || []).map((x: string) => <span key={x}>#{x.replace(/^#/, '')}</span>)}</div></section>
      </div>
      <section className="tiktok-engagement-section"><h3>Engagement prompts</h3><ul>{(plan.engagementPrompts || []).map((x: string) => <li key={x}>{x}</li>)}</ul></section>
      <p className="disclaimer">This is a strategic starting point generated from your brief. It is not a live trend report, verified TikTok audience data or a guarantee of views and growth.</p>
    </div>
  );
}

function AudienceFinder({ niche, setNiche, busy, find, plan }: any) {
  return (
    <>
      <PageHeading
        eyebrow="AUDIENCE INTELLIGENCE"
        title="Find the people who care."
        subtitle="Describe your niche and get AI-generated audience segments, community ideas and discovery directions."
      />
      <div className="panel audience-search-panel">
        <div className="audience-search-copy">
          <div className="large-icon">
            <Users size={24} />
          </div>
          <h2>Who should discover your content?</h2>
          <p>
            Be specific. A focused niche gives the recommendation engine better
            context.
          </p>
        </div>
        <div className="audience-form">
          <label className="field-label">Your niche or audience topic</label>
          <input
            className="text-input"
            value={niche}
            onChange={e => setNiche(e.target.value)}
            placeholder="e.g. Nigerian streetwear, beginner fitness, food creators..."
          />
          <button className="primary-btn" disabled={busy} onClick={find}>
            {busy ? (
              <Loader2 className="spin" size={17} />
            ) : (
              <Search size={17} />
            )}{' '}
            Find audience matches
          </button>
        </div>
      </div>
      {plan ? (
        <PlanResults plan={plan} />
      ) : (
        <div className="audience-hints">
          <h3>What makes a useful niche?</h3>
          <div className="hint-grid">
            <div>
              <strong>Specific interests</strong>
              <p>What topics do people actively care about?</p>
            </div>
            <div>
              <strong>Shared communities</strong>
              <p>Where do people with these interests gather?</p>
            </div>
            <div>
              <strong>Clear intent</strong>
              <p>Are they learning, buying, creating or exploring?</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DistributionPlanner({
  posts,
  selectedPost,
  setSelectedPost,
  activePost,
  plan,
  busy,
  generate,
}: any) {
  return (
    <>
      <PageHeading
        eyebrow="SMART DISTRIBUTION"
        title="Put existing content in the right places."
        subtitle="Build a route for an existing post using relevant hashtag groups, audience segments, creators and communities. Recommendations are suggestions, not guaranteed placements or reach."
      />
      <div className="panel planner-input">
        <div>
          <span className="eyebrow">CHOOSE CONTENT</span>
          <h3>What are we distributing?</h3>
          <p>Select one of your published posts to create a tailored plan.</p>
        </div>
        <select
          className="text-input"
          value={selectedPost || activePost?.id || ''}
          onChange={e => setSelectedPost(e.target.value)}
        >
          <option value="">Select a post</option>
          {posts.map((p: Post) => (
            <option value={p.id} key={p.id}>
              {(p.caption || 'Untitled').slice(0, 70)}
            </option>
          ))}
        </select>
        <button
          className="primary-btn"
          disabled={busy || !activePost}
          onClick={generate}
        >
          {busy ? <Loader2 className="spin" size={17} /> : <Target size={17} />}{' '}
          Generate distribution plan
        </button>
      </div>
      {plan ? (
        <PlanResults plan={plan} />
      ) : (
        <div className="plan-empty">
          <div className="plan-target">
            <Target size={30} />
          </div>
          <h3>Your distribution strategy, made clearer.</h3>
          <p>
            NTWRKH will suggest audience segments, relevant channels,
            collaboration ideas and concrete next steps.
          </p>
        </div>
      )}
    </>
  );
}

function PlanResults({ plan }: any) {
  return (
    <div className="panel plan-results">
      <div className="panel-head">
        <div>
          <span className="eyebrow">YOUR RECOMMENDATION</span>
          <h3>
            {plan.summary || 'A starting point for your distribution strategy'}
          </h3>
        </div>
        <span className="ai-pill">
          <Sparkles size={12} /> AI generated
        </span>
      </div>
      {plan.hashtagGroups?.length > 0 && <div className="distribution-section"><h3>Hashtag routes</h3>{plan.hashtagGroups.map((group: any, i: number) => <div className="recommendation-item" key={i}><strong>{group.label}</strong><p>{group.purpose}</p><div className="keyword-row">{(group.hashtags || []).map((tag: string) => <span key={tag}>{tag.startsWith('#') ? tag : `#${tag}`}</span>)}</div></div>)}</div>}
      <div className="plan-columns">
        <div>
          <h4>
            <Users size={16} /> Audience segments
          </h4>
          {(plan.audiences || []).map((x: any, i: number) => (
            <div className="recommendation-item" key={i}>
              <strong>{x.name || x}</strong>
              <p>
                {x.reason ||
                  'A potentially relevant audience for this content.'}
              </p>
            </div>
          ))}
        </div>
        <div>
          <h4>
            <Compass size={16} /> Places to explore
          </h4>
          {(plan.channels || []).map((x: any, i: number) => (
            <div className="recommendation-item" key={i}>
              <strong>{x.name || x}</strong>
              <p>
                {x.reason ||
                  'Explore this channel and check its community guidelines.'}
              </p>
            </div>
          ))}
        </div>
      </div>
      {plan.communities?.length > 0 && <div className="distribution-section"><h3>Relevant communities</h3>{plan.communities.map((item: any, i: number) => <div className="recommendation-item" key={i}><strong>{item.name} · {item.platform}</strong><p>{item.approach}</p></div>)}</div>}
      {plan.creatorTypes?.length > 0 && <div className="distribution-section"><h3>Creator types to research</h3>{plan.creatorTypes.map((item: any, i: number) => <div className="recommendation-item" key={i}><strong>{item.type}</strong><p>{item.why} {item.outreachAngle}</p></div>)}</div>}
      <div className="next-steps">
        <h4>
          <Zap size={16} /> Suggested next steps
        </h4>
        <ol>
          {(plan.actions || []).map((x: string, i: number) => (
            <li key={i}>{x}</li>
          ))}
        </ol>
      </div>
      {plan.cautions?.length > 0 && <div className="distribution-section"><h3>Important cautions</h3><ul className="insight-list">{plan.cautions.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}
      <p className="disclaimer">
        Hashtags are relevance-based suggestions, not confirmed live trends. NTWRKH does not yet auto-publish, mass-tag accounts or guarantee external reach. Review the recommendations and execute them through your connected platform accounts.
      </p>
    </div>
  );
}

function Analytics({ posts }: { posts: Post[] }) {
  return (
    <>
      <PageHeading
        eyebrow="PERFORMANCE INTELLIGENCE"
        title="Learn what is working."
        subtitle="Your NTWRKH activity is the starting point. Verified external metrics require connected social-platform analytics."
      />
      <div className="stat-grid">
        <Stat
          icon={FileImage}
          label="Published on NTWRKH"
          value={String(posts.length)}
          note="Content in your discovery feed"
        />
        <Stat
          icon={Hash}
          label="Topics identified"
          value={String(new Set(posts.map(p => p.topic).filter(Boolean)).size)}
          note="Across your published posts"
        />
        <Stat
          icon={Target}
          label="Distribution plans"
          value="Not tracked yet"
          note="Plan history is coming next"
        />
        <Stat
          icon={Activity}
          label="External impressions"
          value="Not connected"
          note="No social analytics integration yet"
        />
      </div>
      <div className="panel analytics-note">
        <div className="large-icon">
          <BarChart3 size={23} />
        </div>
        <div>
          <h3>Honest analytics, not vanity numbers.</h3>
          <p>
            NTWRKH currently tracks content published inside the platform. Views,
            reach, engagement and conversions from Instagram, TikTok, YouTube
            and other networks will only appear after an authorized integration
            is connected.
          </p>
        </div>
      </div>
      <div className="panel recent-panel">
        <div className="panel-head">
          <div>
            <h3>Your published content</h3>
            <p>Content available for future performance tracking</p>
          </div>
        </div>
        {posts.length ? (
          posts.map(p => <PostRow key={p.id} post={p} />)
        ) : (
          <EmptyState
            icon={BarChart3}
            title="No content data yet"
            text="Publish your first analyzed post to start building your content history."
          />
        )}
      </div>
    </>
  );
}

function ProfileEditor({ draft, setDraft, busy, save }: any) {
  const update = (key: keyof Profile, value: string) =>
    setDraft((current: Profile) => ({ ...current, [key]: value }));
  return (
    <>
      <PageHeading
        eyebrow="YOUR CREATOR IDENTITY"
        title="Set up your NTWRKH profile."
        subtitle="Help the platform understand who you are, what you create and what kind of opportunities matter to you."
      />
      <div className="panel profile-form">
        <div className="profile-intro">
          <div className="profile-avatar">
            {(draft.name || 'R').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h3>Your public identity</h3>
            <p>These details help personalize discovery and recommendations.</p>
          </div>
        </div>
        <div className="form-grid">
          <div className="form-field">
            <label className="field-label">Display name</label>
            <input
              className="text-input"
              value={draft.name || ''}
              onChange={e => update('name', e.target.value)}
              placeholder="Your name or brand"
            />
          </div>
          <div className="form-field">
            <label className="field-label">I am a...</label>
            <select
              className="text-input"
              value={draft.userType || ''}
              onChange={e => update('userType', e.target.value)}
            >
              <option value="">Choose your role</option>
              {[
                'Creator',
                'Influencer',
                'Video editor',
                'Business',
                'Brand',
                'Social media manager',
                'Agency',
              ].map(x => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="form-field full-field">
            <label className="field-label">Main niche</label>
            <input
              className="text-input"
              value={draft.niche || ''}
              onChange={e => update('niche', e.target.value)}
              placeholder="e.g. Fashion, gaming, food, technology..."
            />
          </div>
          <div className="form-field full-field">
            <label className="field-label">
              What are you trying to achieve?
            </label>
            <textarea
              className="text-input bio-input"
              value={draft.goals || ''}
              onChange={e => update('goals', e.target.value)}
              placeholder="e.g. Reach more customers, grow an audience, find brand collaborations..."
            />
          </div>
          <div className="form-field full-field">
            <label className="field-label">
              Short bio <span className="optional">OPTIONAL</span>
            </label>
            <textarea
              className="text-input bio-input"
              value={draft.bio || ''}
              onChange={e => update('bio', e.target.value)}
              placeholder="Tell people what you create or what your business offers..."
            />
          </div>
        </div>
        <div className="form-footer">
          <span className="muted">
            You can update these details at any time.
          </span>
          <button
            className="primary-btn"
            disabled={
              busy ||
              !draft.name?.trim() ||
              !draft.userType ||
              !draft.niche?.trim()
            }
            onClick={save}
          >
            {busy ? (
              <Loader2 className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}{' '}
            Save profile
          </button>
        </div>
      </div>
    </>
  );
}

export default App;
