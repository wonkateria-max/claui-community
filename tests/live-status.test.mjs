import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTikTokStatus, parseTikTokHtml, detectTikTokStatus, publicStatus, createHandler } from '../supabase/functions/tiktok-live-status/status.ts';

const KEY = 'sb_publishable_53ofNWMueg05oCmHjUvvpg_rYLdMJq5';
const NOW = Date.parse('2026-10-26T10:00:00Z');
const iso = offset => new Date(NOW + offset).toISOString();
const fixture = (status = 4, uniqueId = 'clawiwawi') => ({
  statusCode: 0,
  data: { user: { uniqueId, roomId: '7700633793627605780' }, liveRoom: { status } },
});
const html = payload => `<html><script type="application/json" id="SIGI_STATE">${JSON.stringify({ LiveRoom: { liveRoomUserInfo: payload.data } })}</script></html>`;

test('a retained room ID does not make an ended stream live', () => {
  assert.equal(parseTikTokStatus(fixture(4)), 'offline');
  assert.equal(parseTikTokStatus(fixture(2)), 'live');
});

test('unrecognized statuses, missing data and the wrong account are never live', () => {
  for (const value of [{}, { statusCode: 1 }, fixture(0), fixture(3), fixture('2'), fixture(2, 'another-user')]) {
    assert.throws(() => parseTikTokStatus(value));
  }
  const noRoom = fixture(2);
  noRoom.data.user.roomId = '0';
  assert.throws(() => parseTikTokStatus(noRoom));
});

test('HTML fallback uses structured account data, not a LIVE word on the page', () => {
  assert.equal(parseTikTokHtml(html(fixture(4))), 'offline');
  assert.equal(parseTikTokHtml(html(fixture(2))), 'live');
  assert.throws(() => parseTikTokHtml('<html>LIVE! Sign in to continue</html>'));
});

test('API failure falls back to TikTok page; two blocked sources reject', async () => {
  let calls = 0;
  const result = await detectTikTokStatus(async () => ++calls === 1
    ? new Response('blocked', { status: 403 }) : new Response(html(fixture(4))));
  assert.equal(result, 'offline');
  assert.equal(calls, 2);
  await assert.rejects(detectTikTokStatus(async () => new Response('captcha')));
});

function harness({ cachedState = 'unknown', fresh = false, upstream = fixture(4), fail = false, databaseFail = false } = {}) {
  let row = {
    username: 'clawiwawi', status: cachedState,
    checked_at: iso(fresh ? -1000 : -60_000), expires_at: iso(fresh ? 29_000 : -30_000),
    next_check_at: iso(-30_000), lease_token: null,
  };
  let upstreamCalls = 0;
  let databaseCalls = 0;
  const fetcher = async (input, init = {}) => {
    const url = new URL(input);
    if (url.hostname === 'db.example') {
      databaseCalls++;
      if (databaseFail) return new Response('unavailable', { status: 503 });
      if (init.method === 'PATCH') {
        const condition = url.searchParams.get('next_check_at');
        const lease = url.searchParams.get('lease_token');
        if (condition && Date.parse(row.next_check_at) > Date.parse(condition.slice(4))) return Response.json([]);
        if (lease && row.lease_token !== lease.slice(3)) return Response.json([]);
        row = { ...row, ...JSON.parse(init.body) };
      }
      return Response.json([{ ...row }]);
    }
    upstreamCalls++;
    if (fail) return new Response('unavailable', { status: 503 });
    return Response.json(upstream);
  };
  const handler = createHandler({
    env: name => ({ SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-server-key' })[name],
    fetcher, now: () => NOW, uuid: () => '00000000-0000-4000-8000-000000000001',
  });
  return { handler, row: () => row, upstreamCalls: () => upstreamCalls, databaseCalls: () => databaseCalls };
}
const request = (headers = { apikey: KEY }, method = 'GET') => new Request('https://function.example', { method, headers });

test('fresh results are shared without another upstream call', async () => {
  const h = harness({ cachedState: 'offline', fresh: true });
  const response = await h.handler(request());
  assert.equal((await response.json()).status, 'offline');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(h.upstreamCalls(), 0);
});

test('simultaneous visitors share one atomic refresh lease', async () => {
  const h = harness();
  const results = await Promise.all(Array.from({ length: 12 }, async () => (await h.handler(request())).json()));
  assert.equal(h.upstreamCalls(), 1);
  assert.ok(results.some(result => result.status === 'offline'));
  assert.equal((await (await h.handler(request())).json()).status, 'offline');
  assert.equal(h.upstreamCalls(), 1);
});

test('a verified live response is saved with a short expiry', async () => {
  const h = harness({ upstream: fixture(2) });
  const data = await (await h.handler(request())).json();
  assert.equal(data.status, 'live');
  assert.equal(Date.parse(data.expires_at) - NOW, 30_000);
  assert.equal(h.row().lease_token, null);
});

test('an upstream failure clears an expired live result and backs off', async () => {
  const h = harness({ cachedState: 'live', fail: true });
  assert.equal((await (await h.handler(request())).json()).status, 'unknown');
  assert.equal(h.row().status, 'unknown');
  assert.equal(Date.parse(h.row().expires_at) - NOW, 60_000);
  assert.equal((await (await h.handler(request())).json()).status, 'unknown');
  assert.equal(h.upstreamCalls(), 2); // API + HTML, not another check per visitor.
});

test('an expired or future-dated cached live result is never public', () => {
  assert.equal(publicStatus({ status: 'live', checked_at: iso(-60_000), expires_at: iso(-30_000) }, NOW).status, 'unknown');
  assert.equal(publicStatus({ status: 'live', checked_at: iso(60_000), expires_at: iso(90_000) }, NOW).status, 'unknown');
});

test('cache failure cannot bypass throttling or manufacture a status', async () => {
  const h = harness({ databaseFail: true });
  assert.equal((await (await h.handler(request())).json()).status, 'unknown');
  assert.equal(h.upstreamCalls(), 0);
});

test('requests enforce method, origin and publishable key before data access', async () => {
  const h = harness();
  assert.equal((await h.handler(request({}))).status, 401);
  assert.equal((await h.handler(request({ apikey: KEY }, 'POST'))).status, 405);
  assert.equal((await h.handler(request({ apikey: KEY, Origin: 'https://other.example' }))).status, 403);
  const preflight = await h.handler(request({ Origin: 'https://wonkateria-max.github.io' }, 'OPTIONS'));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://wonkateria-max.github.io');
  assert.equal(h.databaseCalls(), 0);
});
