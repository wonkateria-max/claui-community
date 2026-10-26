import { integer, safeImage } from '../../../tikfinity-events.js';

const PUBLIC_KEY = 'sb_publishable_53ofNWMueg05oCmHjUvvpg_rYLdMJq5';
const SITE = 'https://wonkateria-max.github.io';
const PROFILE = 'https://www.tiktok.com/@clawiwawi';
const ROOM = /^\d{10,30}$/;
const VIDEO = /^\d{15,25}$/;
type Obj = Record<string, any>;
const object = (value: unknown): Obj => value && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {};

export function decodeCover(value: unknown) {
  if (typeof value !== 'string' || value.length > 600000) throw new Error('Cover image is too large. Choose a smaller image.');
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Use a JPG, PNG or WebP cover image.');
  const bytes = Uint8Array.from(atob(match[2]),character=>character.charCodeAt(0));
  const valid = match[1] === 'image/jpeg' ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255
    : match[1] === 'image/png' ? [137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x)
    : String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if (!valid) throw new Error('The cover image could not be read. Choose a JPG, PNG or WebP file.');
  return {bytes,type:match[1]};
}

export function validateEvent(value: unknown, now = Date.now()) {
  const e = object(value);
  if (!['gift','like'].includes(e.kind) || typeof e.event_id !== 'string' || !/^(gift|like):[\w.:-]{1,280}$/.test(e.event_id)
    || !e.event_id.startsWith(`${e.kind}:`) || typeof e.viewer_id !== 'string' || !/^[\w.:-]{1,128}$/.test(e.viewer_id)) return null;
  const count = integer(e.count), coins = integer(e.coins);
  const occurred = Date.parse(e.occurred_at);
  if (!count || count > 1e6 || coins === null || coins > 1e12 || !Number.isFinite(occurred)
    || occurred < now - 86400_000 || occurred > now + 300_000) return null;
  return {
    event_id: e.event_id, kind: e.kind, viewer_id: e.viewer_id,
    nickname: String(e.nickname || e.username || 'Viewer').slice(0,100),
    username: String(e.username || '').replace(/^@/,'').slice(0,80), avatar_url: safeImage(e.avatar_url),
    count, coins: e.kind === 'gift' ? coins : 0,
    total_likes: Math.min(integer(e.total_likes) ?? 0, 1e12), occurred_at: new Date(occurred).toISOString(),
  };
}

export function videoIdFromUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 1000) throw new Error('Paste a TikTok video link.');
  const url = new URL(value);
  const match = url.pathname.match(/^\/@clawiwawi\/video\/(\d{15,25})\/?$/i);
  if (url.protocol !== 'https:' || !['www.tiktok.com','tiktok.com'].includes(url.hostname) || url.port || url.username || url.password || !match) {
    throw new Error('Use the full tiktok.com/@clawiwawi/video/... link.');
  }
  return match[1];
}

export async function resolveVideoId(value: unknown, fetcher: typeof fetch = fetch) {
  try { return videoIdFromUrl(value); } catch {}
  let url = new URL(String(value));
  for (let hop=0;hop<3;hop++) {
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !['vt.tiktok.com','vm.tiktok.com','www.tiktok.com','tiktok.com'].includes(url.hostname)) break;
    try { return videoIdFromUrl(url.href); } catch {}
    if (!['vt.tiktok.com','vm.tiktok.com'].includes(url.hostname) && !url.pathname.startsWith('/t/')) break;
    const response=await fetcher(url.href,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(5000)});
    const location=response.headers.get('Location');
    await response.body?.cancel();
    if (![301,302,303,307,308].includes(response.status) || !location) break;
    url=new URL(location,url);
  }
  throw new Error('Use the full tiktok.com/@clawiwawi/video/... link.');
}

export async function sha256(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}

export function createCommunityHandler({ env, fetcher = fetch, now = Date.now }: {
  env: (name: string) => string | undefined; fetcher?: typeof fetch; now?: () => number;
}) {
  const base = env('SUPABASE_URL') || '';
  let serverKey = env('SUPABASE_SERVICE_ROLE_KEY') || '';
  try { serverKey = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}').default || serverKey; } catch {}

  const db = async (path: string, init: RequestInit = {}) => {
    const response = await fetcher(`${base}/rest/v1/${path}`, {
      ...init, headers: {
        apikey: serverKey, ...(serverKey.startsWith('eyJ') ? { Authorization: `Bearer ${serverKey}` } : {}),
        'Content-Type':'application/json', Prefer:'return=representation', ...(init.headers || {}),
      }, signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error('The community service is temporarily unavailable.');
    return response.status === 204 ? null : response.json();
  };
  const rpc = (name: string, args: Obj = {}) => db(`rpc/${name}`, { method:'POST', body:JSON.stringify(args) });

  const admin = async (req: Request) => {
    const auth = req.headers.get('Authorization') || '';
    if (!/^Bearer eyJ/.test(auth)) throw new Error('Sign in to Claui Admin first.');
    const userResponse = await fetcher(`${base}/auth/v1/user`, {
      headers:{apikey:PUBLIC_KEY, Authorization:auth}, signal:AbortSignal.timeout(6000),
    });
    if (!userResponse.ok) throw new Error('Your session expired. Sign in again.');
    const user = await userResponse.json();
    const check = await fetcher(`${base}/rest/v1/rpc/is_admin`, {
      method:'POST',headers:{apikey:PUBLIC_KEY,Authorization:auth,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(6000),
    });
    if (!check.ok || await check.json() !== true || typeof user.id !== 'string') throw new Error('Admin access required.');
    return user.id;
  };

  const oembed = async (id: string) => {
    const response = await fetcher(`https://www.tiktok.com/oembed?url=${encodeURIComponent(`${PROFILE}/video/${id}`)}`, {
      headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json'},signal:AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error('TikTok preview unavailable.');
    const data = object(await response.json());
    const author = new URL(data.author_url || 'https://invalid.example');
    if (!['www.tiktok.com','tiktok.com'].includes(author.hostname) || author.pathname.replace(/\/$/,'').toLowerCase() !== '/@clawiwawi') {
      throw new Error('TikTok preview could not confirm this post.');
    }
    return { title:String(data.title || '').slice(0,500),thumbnail_url:safeImage(data.thumbnail_url) };
  };

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const action = url.pathname.split('/').filter(Boolean).at(-1);
    const origin = req.headers.get('Origin');
    const local = origin !== null && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const headers = {
      'Access-Control-Allow-Origin':local ? origin! : SITE,
      'Access-Control-Allow-Headers':'apikey, authorization, content-type',
      'Access-Control-Allow-Methods':'GET, POST, OPTIONS', Vary:'Origin', 'Cache-Control':'no-store',
    };
    const json = (data: unknown, status = 200) => Response.json(data,{status,headers});
    if (origin && origin !== SITE && !local) return json({error:'Origin not allowed.'},403);
    if (req.method === 'OPTIONS') return new Response(null,{status:204,headers});
    if (!['GET','POST'].includes(req.method)) return json({error:'Method not allowed.'},405);
    try {
      if (req.method === 'GET' && action === 'image') {
        const id = url.searchParams.get('id') || '';
        if (!VIDEO.test(id)) return json({error:'Unknown video.'},404);
        const [row] = await db(`community_videos?video_id=eq.${id}&hidden=eq.false&select=thumbnail_url,thumbnail_data,metadata_checked_at&limit=1`);
        if (!row) return json({error:'Unknown video.'},404);
        if (row.thumbnail_data) {
          const cover = decodeCover(row.thumbnail_data);
          return new Response(cover.bytes,{headers:{...headers,'Content-Type':cover.type,'Cache-Control':'public,max-age=3600'}});
        }
        let thumbnail = safeImage(row.thumbnail_url);
        if (!thumbnail || Date.parse(row.metadata_checked_at) < now() - 12*3600_000) {
          try {
            const metadata = await oembed(id);
            thumbnail = metadata.thumbnail_url;
            await db(`community_videos?video_id=eq.${id}`,{method:'PATCH',body:JSON.stringify({thumbnail_url:thumbnail,metadata_checked_at:new Date(now()).toISOString()})});
          } catch { /* Keep a previously verified cover when TikTok is unavailable. */ }
        }
        if (thumbnail) {
          try {
            const image = await fetcher(thumbnail,{headers:{'User-Agent':'Mozilla/5.0',Referer:'https://www.tiktok.com/'},redirect:'error',signal:AbortSignal.timeout(7000)});
            const type = image.headers.get('Content-Type')?.split(';')[0] || '';
            if (image.ok && ['image/jpeg','image/png','image/webp','image/gif'].includes(type)) {
              const bytes = await image.arrayBuffer();
              if (bytes.byteLength <= 4_000_000) return new Response(bytes,{headers:{...headers,'Content-Type':type,'Cache-Control':'public,max-age=900'}});
            }
          } catch {}
        }
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="540" height="720" viewBox="0 0 540 720"><rect width="540" height="720" fill="#141419"/><path d="M90 500L450 140M90 580L450 220" stroke="#28282f" stroke-width="2"/><text x="270" y="355" fill="#f3f1ec" text-anchor="middle" font-family="sans-serif" font-size="52" font-weight="700">CLAUI</text><text x="270" y="399" fill="#8f8f99" text-anchor="middle" font-family="sans-serif" font-size="18">Watch on TikTok</text></svg>';
        return new Response(svg,{headers:{...headers,'Content-Type':'image/svg+xml','Cache-Control':'public,max-age=60'}});
      }
      if (req.method === 'GET' && action === 'community-updates') {
        const [recap,videos] = await Promise.all([
          rpc('get_community_live_recap'),
          db('community_videos?hidden=eq.false&select=video_id,title,created_at&order=created_at.desc&limit=4'),
        ]);
        return json({recap,videos});
      }
      if (req.method === 'GET' && action === 'admin') {
        await admin(req);
        const [keys,videos] = await Promise.all([
          db('community_bridge_keys?disabled_at=is.null&select=last_seen_at,source_connected,expires_at&order=created_at.desc&limit=1'),
          db('community_videos?select=video_id,title,hidden&order=created_at.desc&limit=30'),
        ]);
        return json({connection:keys[0] || null,videos});
      }
      if (req.method !== 'POST') return json({error:'Not found.'},404);
      const adminUser = ['pair','videos'].includes(action || '') ? await admin(req) : null;
      const maxBody = action === 'videos' ? 700000 : 262144;
      if (Number(req.headers.get('Content-Length') || 0) > maxBody) return json({error:'Request too large.'},413);
      const text = await req.text();
      if (text.length > maxBody) return json({error:'Request too large.'},413);
      const body = object(JSON.parse(text || '{}'));
      if (action === 'pair') {
        const userId = adminUser;
        const token = [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
        await rpc('rotate_community_bridge_key',{p_hash:await sha256(token),p_user_id:userId});
        return json({url:`${SITE}/claui-community/bridge.html#token=${token}`});
      }
      if (action === 'videos') {
        if (body.action === 'hide' || body.action === 'restore') {
          if (!VIDEO.test(body.video_id || '')) return json({error:'Invalid video.'},400);
          if (body.action === 'restore') {
            const current=await db('community_videos?hidden=eq.false&select=video_id&limit=4');
            if (current.length>=4 && !current.some((row:Obj)=>row.video_id===body.video_id)) return json({error:'Hide an older card first. The homepage holds four clips.'},400);
          }
          await db(`community_videos?video_id=eq.${body.video_id}`,{method:'PATCH',body:JSON.stringify({hidden:body.action==='hide'})});
          return json({ok:true});
        }
        const id = await resolveVideoId(body.url,fetcher);
        const [existing,active] = await Promise.all([
          db(`community_videos?video_id=eq.${id}&select=video_id,thumbnail_data,thumbnail_url`),
          db('community_videos?hidden=eq.false&select=video_id&limit=4'),
        ]);
        if (active.length >= 4 && !active.some((row:Obj)=>row.video_id===id)) return json({error:'Hide an older card first. The homepage holds four clips.'},400);
        let metadata: Obj = {};
        try { metadata = await oembed(id); } catch {}
        const title = String(body.title || metadata.title || '').trim().slice(0,500);
        if (!title) return json({error:'TikTok preview is unavailable. Add a short title and try again.'},400);
        if (body.thumbnail_data) decodeCover(body.thumbnail_data);
        await db('community_videos?on_conflict=video_id',{
          method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},
          body:JSON.stringify({video_id:id,title,thumbnail_url:metadata.thumbnail_url || existing[0]?.thumbnail_url || null,
            thumbnail_data:body.thumbnail_data || existing[0]?.thumbnail_data || null,
            metadata_checked_at:new Date(now()).toISOString(),created_at:new Date(now()).toISOString(),hidden:false}),
        });
        return json({ok:true,preview_available:Boolean(body.thumbnail_data || existing[0]?.thumbnail_data || metadata.thumbnail_url)});
      }
      if (action === 'bridge') {
        if (typeof body.token !== 'string' || !/^[0-9a-f]{64}$/.test(body.token)) return json({error:'Connection link required.'},401);
        const hash = await sha256(body.token);
        const [key] = await db(`community_bridge_keys?token_hash=eq.${hash}&disabled_at=is.null&expires_at=gt.${encodeURIComponent(new Date(now()).toISOString())}&select=id&limit=1`);
        if (!key) return json({error:'Connection link expired. Create a new one in Claui Admin.'},401);
        await db(`community_bridge_keys?id=eq.${key.id}`,{method:'PATCH',body:JSON.stringify({last_seen_at:new Date(now()).toISOString(),source_connected:body.source_connected===true})});
        const response = await fetcher(`${base}/functions/v1/tiktok-live-status`,{headers:{apikey:PUBLIC_KEY},signal:AbortSignal.timeout(20000)});
        const broadcast = response.ok ? object(await response.json()) : {};
        const live = broadcast.status === 'live' && ROOM.test(broadcast.room_id || '');
        const roomId = live ? broadcast.room_id : null;
        if (roomId) await rpc('record_community_live_events',{p_room_id:roomId,p_started_at:broadcast.started_at || new Date(now()).toISOString(),p_events:[]});
        const events = Array.isArray(body.events) ? body.events : [];
        if (events.length > 100) return json({error:'Send at most 100 events at a time.'},400);
        let accepted = 0;
        if (events.length && ROOM.test(body.room_id || '')) {
          const cleaned = events.map((e:unknown)=>validateEvent(e,now())).filter(Boolean);
          // A room must first be verified and created by a live status response.
          // Buffered retries may finish after the stream ends, for up to one day.
          const [session] = await db(`community_live_sessions?room_id=eq.${body.room_id}&started_at=gt.${encodeURIComponent(new Date(now()-86400_000).toISOString())}&select=room_id&limit=1`);
          if (!session) return json({error:'This stream has not been verified.',retry:true,status:broadcast.status || 'unknown',room_id:roomId},409);
          if (cleaned.length) accepted = await rpc('record_community_live_events',{p_room_id:body.room_id,p_started_at:null,p_events:cleaned});
        }
        if (broadcast.status === 'offline') await db('community_live_sessions?ended_at=is.null',{method:'PATCH',body:JSON.stringify({ended_at:new Date(now()).toISOString()})});
        return json({ok:true,accepted,status:broadcast.status || 'unknown',room_id:roomId,started_at:live ? broadcast.started_at : null});
      }
      return json({error:'Not found.'},404);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Community update failed.';
      const authError = /sign in|session expired|admin access/i.test(message);
      return json({error:message},authError ? 401 : 400);
    }
  };
}
