(() => {
  const URL = 'https://foficcmsmtfkzcdcmcsc.supabase.co/functions/v1/tiktok-live-status';
  const KEY = 'sb_publishable_53ofNWMueg05oCmHjUvvpg_rYLdMJq5';
  const PROFILE = 'https://www.tiktok.com/@clawiwawi';
  const INTERVAL = 30_000;
  let pollTimer;
  let expiryTimer;
  let controller;
  let running = false;

  const copy = {
    checking: { kicker: 'CHECKING LIVE STATUS', status: 'CHECKING…', ticker: 'AFTER MIDNIGHT', button: 'Visit TikTok ↗' },
    live: { kicker: 'LIVE TRANSMISSION', status: 'ON AIR', ticker: 'NOW PLAYING', button: '▶ Enter live' },
    offline: { kicker: 'CURRENTLY OFFLINE', status: 'OFF AIR', ticker: 'BETWEEN STREAMS', button: 'Visit TikTok ↗' },
    unknown: { kicker: 'CLAUI ON TIKTOK', status: 'CHECK TIKTOK', ticker: 'AFTER MIDNIGHT', button: 'Visit TikTok ↗' },
  };

  const render = (state, checkedAt = null) => {
    document.documentElement.dataset.liveState = state;
    const values = copy[state];
    document.querySelectorAll('[data-live-kicker]').forEach(el => { el.textContent = values.kicker; });
    document.querySelectorAll('[data-live-status]').forEach(el => { el.textContent = values.status; });
    document.querySelectorAll('[data-live-ticker]').forEach(el => { el.textContent = values.ticker; });
    document.querySelectorAll('[data-live-time]').forEach(el => {
      el.textContent = state === 'live' ? 'Live now · TikTok' : 'Usually 12 AM · PHT';
    });
    document.querySelectorAll('[data-live-watch]').forEach(el => {
      el.textContent = values.button;
      el.href = state === 'live' ? `${PROFILE}/live` : PROFILE;
    });
    document.querySelectorAll('[data-live-profile]').forEach(el => {
      el.href = state === 'live' ? `${PROFILE}/live` : PROFILE;
      el.setAttribute('aria-label', state === 'live' ? 'Claui is live on TikTok' : 'Visit Claui on TikTok');
      el.title = state === 'live' ? 'Live now' : state === 'offline' ? 'Currently offline' : 'Check TikTok';
    });
    document.querySelectorAll('[data-live-checked]').forEach(el => {
      el.textContent = checkedAt && state !== 'unknown'
        ? `Last checked ${new Date(checkedAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Manila' })} PHT`
        : state === 'checking' ? 'Checking TikTok…' : 'Status could not be confirmed. Check TikTok directly.';
    });
  };

  const check = async () => {
    clearTimeout(pollTimer);
    if (document.hidden || running) return;
    running = true;
    controller = new AbortController();
    const requestTimeout = setTimeout(() => controller.abort(), 24_000);
    let retry = INTERVAL;
    try {
      const response = await fetch(URL, { headers: { apikey: KEY }, cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Status request failed');
      const result = await response.json();
      const checked = Date.parse(result.checked_at);
      const expires = Date.parse(result.expires_at);
      const now = Date.now();
      const fresh = result.username === 'clawiwawi' && Number.isFinite(checked) && checked <= now + 5000
        && checked > now - 90_000 && Number.isFinite(expires) && expires > now && expires <= now + 90_000;
      const state = fresh && ['live', 'offline'].includes(result.status) ? result.status : 'unknown';
      clearTimeout(expiryTimer);
      render(state, result.checked_at);
      if (state !== 'unknown') expiryTimer = setTimeout(() => render('unknown'), expires - Date.now());
      // A visitor can receive a cache entry near its expiry. Check again when
      // that entry expires instead of leaving the page unknown for 30 seconds.
      retry = result.retry_after === 5 ? 5000
        : fresh ? Math.min(INTERVAL, Math.max(1000, expires - now + 50)) : INTERVAL;
    } catch {
      clearTimeout(expiryTimer);
      render('unknown');
    } finally {
      clearTimeout(requestTimeout);
      running = false;
      if (!document.hidden) pollTimer = setTimeout(check, retry);
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(pollTimer);
      controller?.abort();
    } else {
      // A restored/suspended tab must not revive an old LIVE result.
      clearTimeout(expiryTimer);
      render('checking');
      if (running) pollTimer = setTimeout(check, 500);
      else check();
    }
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { clearTimeout(expiryTimer); render('checking'); check(); }
  });
  window.addEventListener('online', check);
  window.addEventListener('offline', () => {
    clearTimeout(expiryTimer);
    controller?.abort();
    render('unknown');
  });

  render('checking');
  check();
})();
