import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../live-status.js', import.meta.url), 'utf8');

// A controlled clock and small DOM exercise the real frontend script, including
// asynchronous polling and expiry, without a browser dependency or live traffic.
async function mount({ state = 'offline', age = 0 } = {}) {
  let time = Date.parse('2026-10-26T10:00:00Z');
  let nextId = 0;
  let calls = 0;
  const tasks = new Map();
  const events = new Map();
  const elements = Object.fromEntries(['kicker', 'status', 'ticker', 'time', 'watch', 'profile', 'checked'].map(name => [
    `[data-live-${name}]`, [{ textContent: '', href: '', setAttribute(key, value) { this[key] = value; } }],
  ]));
  const document = {
    hidden: false, documentElement: { dataset: {} },
    querySelectorAll: selector => elements[selector] || [],
    addEventListener: (name, fn) => events.set(name, fn),
  };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [time])); }
    static now() { return time; }
  }
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  const options = { state, age };
  const context = {
    document,
    window: { addEventListener: (name, fn) => events.set(name, fn) },
    Date: ClockDate, AbortController,
    setTimeout: (fn, delay) => { const id = ++nextId; tasks.set(id, { at: time + delay, fn }); return id; },
    clearTimeout: id => tasks.delete(id),
    fetch: async (_, init) => {
      calls++;
      if (options.state === 'hang') return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('Aborted')));
      });
      return {
        ok: options.state !== 'error',
        json: async () => ({
          username: 'clawiwawi', status: options.state,
          checked_at: new Date(time - options.age).toISOString(),
          expires_at: new Date(time - options.age + 30_000).toISOString(), retry_after: 30,
        }),
      };
    },
  };
  vm.runInNewContext(source, context);
  await flush();
  const advance = async milliseconds => {
    const target = time + milliseconds;
    for (;;) {
      const next = [...tasks].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      time = next[1].at;
      tasks.delete(next[0]);
      next[1].fn();
      await flush();
    }
    time = target;
    await flush();
  };
  return {
    document, options, advance, flush,
    state: () => document.documentElement.dataset.liveState,
    calls: () => calls,
    element: name => elements[`[data-live-${name}]`][0],
    event: async (name, value = {}) => { events.get(name)?.(value); await flush(); },
  };
}

test('the page detects a stream starting and ending without refresh or a switch', async () => {
  const page = await mount();
  assert.equal(page.state(), 'offline');
  assert.equal(page.element('watch').href, 'https://www.tiktok.com/@clawiwawi');
  page.options.state = 'live';
  await page.advance(30_100);
  assert.equal(page.state(), 'live');
  assert.equal(page.element('status').textContent, 'ON AIR');
  assert.equal(page.element('watch').href, 'https://www.tiktok.com/@clawiwawi/live');
  page.options.state = 'offline';
  await page.advance(30_100);
  assert.equal(page.state(), 'offline');
  assert.equal(page.element('status').textContent, 'OFF AIR');
  assert.equal(page.calls(), 3);
});

test('failure removes live state, uses a neutral link, then recovers automatically', async () => {
  const page = await mount({ state: 'live' });
  page.options.state = 'error';
  await page.advance(30_100);
  assert.equal(page.state(), 'unknown');
  assert.equal(page.element('watch').href, 'https://www.tiktok.com/@clawiwawi');
  page.options.state = 'offline';
  await page.advance(30_100);
  assert.equal(page.state(), 'offline');
});

test('stale live responses are ignored and nearly expired results are rechecked promptly', async () => {
  const stale = await mount({ state: 'live', age: 60_000 });
  assert.equal(stale.state(), 'unknown');
  const cached = await mount({ age: 29_000 });
  assert.equal(cached.state(), 'offline');
  cached.options.state = 'live';
  cached.options.age = 0;
  await cached.advance(1200);
  assert.equal(cached.state(), 'live');
  assert.equal(cached.calls(), 2);
});

test('an unresponsive checker cannot leave an expired live badge displayed', async () => {
  const page = await mount({ state: 'live' });
  page.options.state = 'hang';
  await page.advance(31_000);
  assert.equal(page.state(), 'unknown');
  await page.advance(24_000);
  assert.equal(page.state(), 'unknown');
});

test('hidden tabs stop polling and recheck on return instead of restoring old live state', async () => {
  const page = await mount({ state: 'live' });
  page.document.hidden = true;
  await page.event('visibilitychange');
  await page.advance(90_000);
  assert.equal(page.calls(), 1);
  assert.equal(page.state(), 'unknown');
  page.document.hidden = false;
  page.options.state = 'offline';
  await page.event('visibilitychange');
  assert.equal(page.state(), 'offline');
  assert.equal(page.calls(), 2);
});

test('bfcache restoration and losing network access clear the previous live display', async () => {
  const page = await mount({ state: 'live' });
  await page.event('offline');
  assert.equal(page.state(), 'unknown');
  page.options.state = 'offline';
  await page.event('pageshow', { persisted: true });
  assert.equal(page.state(), 'offline');
});
