export type LiveState = 'live' | 'offline' | 'unknown';
export const USERNAME = 'clawiwawi';
export const CHECK_INTERVAL_MS = 30_000;
const ERROR_INTERVAL_MS = 60_000;
const LEASE_MS = 25_000;
const PUBLIC_KEY = 'sb_publishable_53ofNWMueg05oCmHjUvvpg_rYLdMJq5';
const SITE_ORIGIN = 'https://claui-community.pages.dev';
const SITE_ORIGINS = new Set([SITE_ORIGIN, 'https://wonkateria-max.github.io']);

type JsonObject = Record<string, unknown>;
type Fetcher = typeof fetch;
type CacheRow = {
  username: string;
  status: LiveState;
  checked_at: string | null;
  expires_at: string;
  next_check_at: string;
  lease_token: string | null;
  room_id?: string | null;
  started_at?: string | null;
};

function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject : {};
}

// A room ID survives the end of a broadcast. Only an explicit, recognized
// liveRoom.status is evidence of being live; a changed/blocked response is unknown.
export function parseTikTokBroadcast(payload: unknown) {
  const root = object(payload);
  if (root.statusCode !== undefined && root.statusCode !== 0) {
    throw new Error('TikTok returned an error');
  }
  const data = object(root.data ?? root);
  const user = object(data.user);
  if (typeof user.uniqueId !== 'string' || user.uniqueId.toLowerCase() !== USERNAME) {
    throw new Error('TikTok account could not be verified');
  }
  const room = object(data.liveRoom);
  const status = room.status;
  if (status === 4) return { status: 'offline' as const, room_id: null, started_at: null };
  if (status === 2 && typeof user.roomId === 'string' && /^[1-9]\d*$/.test(user.roomId)) {
    const start = Number(room.startTime);
    return { status: 'live' as const, room_id: user.roomId,
      started_at: Number.isFinite(start) && start > 0 && start < Date.now() / 1000 + 300
        ? new Date(start * 1000).toISOString() : null };
  }
  throw new Error('TikTok broadcast status could not be confirmed');
}

export function parseTikTokStatus(payload: unknown): Exclude<LiveState, 'unknown'> {
  return parseTikTokBroadcast(payload).status;
}

export function parseTikTokHtml(html: string): Exclude<LiveState, 'unknown'> {
  return parseTikTokHtmlBroadcast(html).status;
}

function parseTikTokHtmlBroadcast(html: string) {
  const match = html.match(/<script\b(?=[^>]*\bid=["']SIGI_STATE["'])[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('TikTok page has no broadcast data');
  const state = object(JSON.parse(match[1]));
  return parseTikTokBroadcast(object(state.LiveRoom).liveRoomUserInfo);
}

export async function detectTikTokStatus(fetcher: Fetcher = fetch) {
  return (await detectTikTokBroadcast(fetcher)).status;
}

export async function detectTikTokBroadcast(fetcher: Fetcher = fetch) {
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: `https://www.tiktok.com/@${USERNAME}/live`,
  };
  try {
    const response = await fetcher(
      `https://www.tiktok.com/api-live/user/room/?aid=1988&uniqueId=${USERNAME}&sourceType=54`,
      { headers: { ...headers, Accept: 'application/json' }, signal: AbortSignal.timeout(6500) },
    );
    if (!response.ok) throw new Error('TikTok API request failed');
    return parseTikTokBroadcast(await response.json());
  } catch {
    // The public live page is an independent fallback if the API is unavailable.
    const response = await fetcher(`https://www.tiktok.com/@${USERNAME}/live`, {
      headers, signal: AbortSignal.timeout(6500),
    });
    if (!response.ok) throw new Error('TikTok live page request failed');
    const html = await response.text();
    if (html.length > 3_000_000) throw new Error('TikTok page was unexpectedly large');
    return parseTikTokHtmlBroadcast(html);
  }
}

export function publicStatus(row: CacheRow | null, now: number) {
  const checked = Date.parse(row?.checked_at ?? '');
  const expires = Date.parse(row?.expires_at ?? '');
  const fresh = Number.isFinite(checked) && checked <= now + 5000
    && checked > now - 90_000 && expires > now;
  return {
    username: USERNAME,
    status: fresh && ['live', 'offline'].includes(row?.status ?? '') ? row!.status : 'unknown',
    checked_at: fresh ? row!.checked_at : null,
    expires_at: fresh ? row!.expires_at : null,
    retry_after: CHECK_INTERVAL_MS / 1000,
    room_id: fresh && row?.status === 'live' ? row.room_id ?? null : null,
    started_at: fresh && row?.status === 'live' ? row.started_at ?? row.checked_at : null,
  };
}

type Dependencies = {
  env: (name: string) => string | undefined;
  fetcher?: Fetcher;
  now?: () => number;
  uuid?: () => string;
};

export function createHandler({ env, fetcher = fetch, now = Date.now, uuid = () => crypto.randomUUID() }: Dependencies) {
  const url = env('SUPABASE_URL');
  let secretKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const publicKeys = new Set([PUBLIC_KEY]);
  try {
    const keys = object(JSON.parse(env('SUPABASE_SECRET_KEYS') ?? '{}'));
    if (typeof keys.default === 'string') secretKey = keys.default;
    for (const key of Object.values(object(JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') ?? '{}')))) {
      if (typeof key === 'string') publicKeys.add(key);
    }
  } catch { /* Legacy environment variables remain supported. */ }

  const cacheRequest = async (query: string, init: RequestInit = {}): Promise<CacheRow[]> => {
    if (!url || !secretKey) throw new Error('Backend configuration unavailable');
    const response = await fetcher(`${url}/rest/v1/tiktok_live_status_cache?${query}`, {
      ...init,
      headers: {
        apikey: secretKey,
        ...(secretKey.startsWith('eyJ') ? { Authorization: `Bearer ${secretKey}` } : {}),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error('Status cache request failed');
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Status cache response invalid');
    return rows;
  };

  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('Origin');
    const localOrigin = origin !== null && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const allowedOrigin = origin !== null && (SITE_ORIGINS.has(origin) || localOrigin);
    const headers = {
      'Access-Control-Allow-Origin': allowedOrigin ? origin! : SITE_ORIGIN,
      'Access-Control-Allow-Headers': 'apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    };
    const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
    if (origin && !allowedOrigin) return json({ error: 'Origin not allowed' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    // New publishable keys are not JWTs. Validate the API key here, with gateway
    // verify_jwt disabled. No user token or TikTok credentials are needed.
    if (!publicKeys.has(req.headers.get('apikey') ?? '')) return json({ error: 'API key required' }, 401);

    try {
      const filter = `username=eq.${USERNAME}`;
      const [cached] = await cacheRequest(`${filter}&select=*`);
      if (!cached) throw new Error('Status cache row missing');
      if (Date.parse(cached.expires_at) > now()) return json(publicStatus(cached, now()));

      // An atomic conditional update gives one visitor the refresh lease.
      // Other visitors reuse the same cache rather than each querying TikTok.
      const token = uuid();
      const [claimed] = await cacheRequest(
        `${filter}&next_check_at=lte.${encodeURIComponent(new Date(now()).toISOString())}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ lease_token: token, next_check_at: new Date(now() + LEASE_MS).toISOString() }),
        },
      );
      if (!claimed) return json({ ...publicStatus(cached, now()), retry_after: 5 });

      let status: LiveState = 'unknown';
      let broadcast: Awaited<ReturnType<typeof detectTikTokBroadcast>> | null = null;
      try { broadcast = await detectTikTokBroadcast(fetcher); status = broadcast.status; }
      catch { console.warn('TikTok live status could not be confirmed.'); }

      const checkedAt = now();
      const expiry = new Date(checkedAt + (status === 'unknown' ? ERROR_INTERVAL_MS : CHECK_INTERVAL_MS)).toISOString();
      const [updated] = await cacheRequest(`${filter}&lease_token=eq.${token}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          checked_at: new Date(checkedAt).toISOString(),
          expires_at: expiry,
          next_check_at: expiry,
          lease_token: null,
          room_id: broadcast?.status === 'live' ? broadcast.room_id : cached.room_id ?? null,
          started_at: broadcast?.status === 'live'
            ? broadcast.started_at ?? (cached.room_id === broadcast.room_id ? cached.started_at : null) ?? new Date(checkedAt).toISOString()
            : cached.started_at ?? null,
        }),
      });
      if (!updated) throw new Error('Status cache lease expired');
      return json(publicStatus(updated, now()));
    } catch {
      // Never turn a failed request into LIVE or reuse an expired live result.
      console.warn('Live status is temporarily unavailable.');
      return json(publicStatus(null, now()));
    }
  };
}
