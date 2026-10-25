(() => {
  const SUPABASE_URL = 'https://foficcmsmtfkzcdcmcsc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_53ofNWMueg05oCmHjUvvpg_rYLdMJq5';
  const SESSION_KEY = 'claui-admin-session-v1';

  const $ = id => document.getElementById(id);
  const loginView = $('login-view');
  const dashboardView = $('dashboard-view');
  const loginForm = $('login-form');
  const loginStatus = $('login-status');
  const pollStatus = $('poll-status');
  const submissionStatus = $('submission-status');
  const pollOptionsEl = $('poll-options');
  const submissionsList = $('submissions-list');
  let session = null;
  let activeRound = null;
  let options = [];
  let submissions = [];
  let voteCounts = {};

  const setStatus = (el, text = '', type = '') => {
    if (!el) return;
    el.textContent = text;
    el.className = `status${type ? ` ${type}` : ''}`;
  };

  const saveSession = data => {
    session = data;
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  };

  const clearSession = () => {
    session = null;
    localStorage.removeItem(SESSION_KEY);
  };

  const authFetch = async (path, init = {}) => {
    const response = await fetch(`${SUPABASE_URL}${path}`, {
      ...init,
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...(init.headers || {})
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed (${response.status})`);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };

  const rest = (path, init = {}) => authFetch(`/rest/v1/${path}`, init);

  const refreshSession = async () => {
    if (!session?.refresh_token) return false;
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      if (!response.ok) return false;
      saveSession(await response.json());
      return true;
    } catch (_) {
      return false;
    }
  };

  const verifySession = async () => {
    if (!session?.access_token) return false;
    try {
      await authFetch('/auth/v1/user');
    } catch (_) {
      if (!(await refreshSession())) return false;
      await authFetch('/auth/v1/user');
    }
    const isAdmin = await rest('rpc/is_admin', { method: 'POST', body: '{}' });
    return isAdmin === true;
  };

  const showDashboard = async () => {
    loginView.hidden = true;
    dashboardView.hidden = false;
    await loadDashboard();
  };

  const showLogin = () => {
    dashboardView.hidden = true;
    loginView.hidden = false;
  };

  loginForm?.addEventListener('submit', async event => {
    event.preventDefault();
    setStatus(loginStatus, 'Signing in…');
    const email = $('admin-email').value.trim();
    const password = $('admin-password').value;
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.msg || data?.error_description || 'Could not sign in.');
      saveSession(data);
      if (!(await verifySession())) {
        clearSession();
        throw new Error('This account is not authorized for Claui Admin.');
      }
      $('admin-password').value = '';
      setStatus(loginStatus, '');
      await showDashboard();
    } catch (error) {
      setStatus(loginStatus, error.message || 'Login failed.', 'error');
    }
  });

  $('logout-btn')?.addEventListener('click', async () => {
    try {
      if (session?.access_token) await authFetch('/auth/v1/logout', { method: 'POST' });
    } catch (_) {}
    clearSession();
    showLogin();
  });

  const loadDashboard = async () => {
    try {
      setStatus(pollStatus, 'Loading…');
      const rounds = await rest('poll_rounds?status=eq.active&select=id,title,status&limit=1');
      activeRound = rounds?.[0] || null;
      if (!activeRound) {
        options = [];
        voteCounts = {};
        renderPoll();
      } else {
        const [optionRows, resultRows] = await Promise.all([
          rest(`poll_options?round_id=eq.${activeRound.id}&select=id,title,status,sort_order,created_at&order=sort_order.asc,created_at.asc`),
          rest('rpc/get_poll_results', { method: 'POST', body: JSON.stringify({ p_round_id: activeRound.id }) })
        ]);
        options = optionRows || [];
        voteCounts = Object.fromEntries((resultRows || []).map(row => [row.option_id, Number(row.votes || 0)]));
        renderPoll();
      }
      submissions = await rest('community_submissions?select=id,type,title,message,display_name,tiktok_username,status,created_at&order=created_at.desc&limit=100') || [];
      renderSubmissions();
      updateStats();
      setStatus(pollStatus, '');
    } catch (error) {
      setStatus(pollStatus, 'Could not load admin data. Try signing in again.', 'error');
      console.error(error);
    }
  };

  const renderPoll = () => {
    $('poll-title').textContent = activeRound?.title || 'No active poll';
    if (!options.length) {
      pollOptionsEl.innerHTML = '<div class="empty">No picks yet.</div>';
      return;
    }
    pollOptionsEl.innerHTML = options.map((option, index) => {
      const votes = voteCounts[option.id] || 0;
      const status = option.status;
      return `<article class="option-card ${status === 'played' ? 'is-played' : ''}" data-id="${option.id}">
        <span class="option-order">${index + 1}</span>
        <div class="option-main"><strong>${escapeHtml(option.title)}</strong><small>${votes} ${votes === 1 ? 'vote' : 'votes'} · ${status}</small></div>
        <div class="option-actions">
          <button type="button" data-action="up" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" data-action="down" ${index === options.length - 1 ? 'disabled' : ''}>↓</button>
          ${status !== 'active' ? '<button type="button" data-action="active">Restore</button>' : '<button type="button" data-action="played">Played</button><button type="button" data-action="hidden">Hide</button>'}
        </div>
      </article>`;
    }).join('');
  };

  pollOptionsEl?.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    const card = event.target.closest('.option-card');
    if (!button || !card || !activeRound) return;
    const id = card.dataset.id;
    const action = button.dataset.action;
    const index = options.findIndex(item => item.id === id);
    if (index < 0) return;
    try {
      if (action === 'up' || action === 'down') {
        const otherIndex = action === 'up' ? index - 1 : index + 1;
        if (!options[otherIndex]) return;
        const a = options[index];
        const b = options[otherIndex];
        const aOrder = a.sort_order;
        const bOrder = b.sort_order;
        await rest(`poll_options?id=eq.${a.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ sort_order: bOrder }) });
        await rest(`poll_options?id=eq.${b.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ sort_order: aOrder }) });
      } else if (['active','played','hidden'].includes(action)) {
        await rest(`poll_options?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: action }) });
      }
      await loadDashboard();
    } catch (error) {
      setStatus(pollStatus, 'Could not update this pick.', 'error');
      console.error(error);
    }
  });

  $('add-pick-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!activeRound) return setStatus(pollStatus, 'No active poll found.', 'error');
    const input = $('new-pick-title');
    const title = input.value.trim();
    if (!title) return;
    const nextOrder = options.reduce((max, item) => Math.max(max, Number(item.sort_order) || 0), 0) + 1;
    try {
      await rest('poll_options', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ round_id: activeRound.id, title, status: 'active', sort_order: nextOrder })
      });
      input.value = '';
      setStatus(pollStatus, 'Pick added.', 'success');
      await loadDashboard();
    } catch (error) {
      setStatus(pollStatus, 'Could not add pick.', 'error');
      console.error(error);
    }
  });

  $('reset-votes-btn')?.addEventListener('click', async () => {
    if (!activeRound) return;
    if (!confirm('Reset ALL votes for the current poll? This cannot be undone.')) return;
    try {
      await rest(`poll_votes?round_id=eq.${activeRound.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      setStatus(pollStatus, 'Votes reset.', 'success');
      await loadDashboard();
    } catch (error) {
      setStatus(pollStatus, 'Could not reset votes.', 'error');
      console.error(error);
    }
  });

  $('refresh-btn')?.addEventListener('click', loadDashboard);
  $('submission-filter')?.addEventListener('change', renderSubmissions);

  const renderSubmissions = () => {
    const filter = $('submission-filter').value;
    const rows = filter === 'all' ? submissions : submissions.filter(item => item.status === filter);
    if (!rows.length) {
      submissionsList.innerHTML = '<div class="empty">No submissions here yet.</div>';
      return;
    }
    submissionsList.innerHTML = rows.map(item => {
      const person = [item.display_name, item.tiktok_username].filter(Boolean).join(' · ') || 'Anonymous';
      return `<article class="submission-card" data-id="${item.id}">
        <div class="submission-meta"><span class="submission-type">${escapeHtml(item.type)}</span><span class="submission-status">${escapeHtml(item.status)}</span></div>
        <h3>${escapeHtml(item.title)}</h3>
        ${item.message ? `<p>${escapeHtml(item.message)}</p>` : ''}
        <p class="submission-person">${escapeHtml(person)} · ${new Date(item.created_at).toLocaleString()}</p>
        <div class="submission-actions">
          <button type="button" data-status="reviewed">Reviewed</button>
          <button type="button" data-status="approved">Approve</button>
          <button type="button" data-status="used">Used</button>
          <button type="button" data-status="archived">Archive</button>
        </div>
      </article>`;
    }).join('');
  };

  submissionsList?.addEventListener('click', async event => {
    const button = event.target.closest('button[data-status]');
    const card = event.target.closest('.submission-card');
    if (!button || !card) return;
    try {
      await rest(`community_submissions?id=eq.${card.dataset.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: button.dataset.status })
      });
      setStatus(submissionStatus, 'Submission updated.', 'success');
      await loadDashboard();
    } catch (error) {
      setStatus(submissionStatus, 'Could not update submission.', 'error');
      console.error(error);
    }
  });

  const updateStats = () => {
    $('stat-poll').textContent = activeRound ? `${options.filter(o => o.status === 'active').length} active picks` : 'None';
    $('stat-votes').textContent = String(Object.values(voteCounts).reduce((sum, count) => sum + Number(count || 0), 0));
    $('stat-submissions').textContent = String(submissions.filter(item => item.status === 'new').length);
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));

  (async () => {
    try {
      const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (stored?.access_token) {
        session = stored;
        if (await verifySession()) return showDashboard();
      }
    } catch (_) {}
    clearSession();
    showLogin();
  })();
})();
