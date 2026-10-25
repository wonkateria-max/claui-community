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
    const text = await response.text();
    if (!response.ok) throw new Error(text || `Request failed (${response.status})`);
    if (!text) return null;
    try { return JSON.parse(text); } catch (_) { return text; }
  };

  const rest = (path, init = {}) => authFetch(`/rest/v1/${path}`, init);

  const refreshSession = async () => {
    if (!session?.refresh_token) return false;
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    if (!response.ok) return false;
    saveSession(await response.json());
    return true;
  };

  const verifySession = async () => {
    if (!session?.access_token) return false;
    try {
      await authFetch('/auth/v1/user');
    } catch (_) {
      if (!(await refreshSession())) return false;
      await authFetch('/auth/v1/user');
    }
    const result = await rest('rpc/is_admin', { method: 'POST', body: '{}' });
    return result === true;
  };

  const showLogin = () => {
    if (dashboardView) dashboardView.hidden = true;
    if (loginView) loginView.hidden = false;
  };

  const showDashboard = async () => {
    if (loginView) loginView.hidden = true;
    if (dashboardView) dashboardView.hidden = false;
    await loadDashboard();
  };

  const makeButton = (label, attrs = {}) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'disabled') button.disabled = Boolean(value);
      else button.dataset[key] = value;
    });
    return button;
  };

  const renderPoll = () => {
    const titleEl = $('poll-title');
    if (titleEl) titleEl.textContent = activeRound?.title || 'No active poll';
    if (!pollOptionsEl) return;
    pollOptionsEl.replaceChildren();

    if (!Array.isArray(options) || !options.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No picks yet.';
      pollOptionsEl.appendChild(empty);
      return;
    }

    options.forEach((option, index) => {
      const card = document.createElement('article');
      card.className = `option-card${option.status === 'played' ? ' is-played' : ''}`;
      card.dataset.id = option.id;

      const order = document.createElement('span');
      order.className = 'option-order';
      order.textContent = String(index + 1);

      const main = document.createElement('div');
      main.className = 'option-main';
      const strong = document.createElement('strong');
      strong.textContent = option.title || 'Untitled';
      const small = document.createElement('small');
      const votes = Number(voteCounts[option.id] || 0);
      small.textContent = `${votes} ${votes === 1 ? 'vote' : 'votes'} · ${option.status || 'active'}`;
      main.append(strong, small);

      const actions = document.createElement('div');
      actions.className = 'option-actions';
      actions.append(
        makeButton('↑', { action: 'up', disabled: index === 0 }),
        makeButton('↓', { action: 'down', disabled: index === options.length - 1 })
      );
      if (option.status !== 'active') {
        actions.append(makeButton('Restore', { action: 'active' }));
      } else {
        actions.append(makeButton('Played', { action: 'played' }), makeButton('Hide', { action: 'hidden' }));
      }

      card.append(order, main, actions);
      pollOptionsEl.appendChild(card);
    });
  };

  const renderSubmissions = () => {
    if (!submissionsList) return;
    submissionsList.replaceChildren();
    const filterEl = $('submission-filter');
    const filter = filterEl?.value || 'all';
    const rows = filter === 'all' ? submissions : submissions.filter(item => item.status === filter);

    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No submissions here yet.';
      submissionsList.appendChild(empty);
      return;
    }

    rows.forEach(item => {
      const card = document.createElement('article');
      card.className = 'submission-card';
      card.dataset.id = item.id;

      const meta = document.createElement('div');
      meta.className = 'submission-meta';
      const type = document.createElement('span');
      type.className = 'submission-type';
      type.textContent = item.type || '';
      const status = document.createElement('span');
      status.className = 'submission-status';
      status.textContent = item.status || '';
      meta.append(type, status);

      const h3 = document.createElement('h3');
      h3.textContent = item.title || 'Untitled';
      card.append(meta, h3);

      if (item.message) {
        const p = document.createElement('p');
        p.textContent = item.message;
        card.appendChild(p);
      }

      const person = document.createElement('p');
      person.className = 'submission-person';
      const who = [item.display_name, item.tiktok_username].filter(Boolean).join(' · ') || 'Anonymous';
      person.textContent = `${who} · ${new Date(item.created_at).toLocaleString()}`;
      card.appendChild(person);

      const actions = document.createElement('div');
      actions.className = 'submission-actions';
      [['Reviewed','reviewed'],['Approve','approved'],['Used','used'],['Archive','archived']].forEach(([label, value]) => {
        actions.appendChild(makeButton(label, { status: value }));
      });
      card.appendChild(actions);
      submissionsList.appendChild(card);
    });
  };

  const updateStats = () => {
    const active = Array.isArray(options) ? options.filter(o => o.status === 'active').length : 0;
    const totalVotes = Object.values(voteCounts || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    const newSubmissions = Array.isArray(submissions) ? submissions.filter(item => item.status === 'new').length : 0;
    if ($('stat-poll')) $('stat-poll').textContent = activeRound ? `${active} active picks` : 'None';
    if ($('stat-votes')) $('stat-votes').textContent = String(totalVotes);
    if ($('stat-submissions')) $('stat-submissions').textContent = String(newSubmissions);
  };

  const loadDashboard = async () => {
    setStatus(pollStatus, 'Loading…');
    setStatus(submissionStatus, '');

    try {
      const rounds = await rest('poll_rounds?status=eq.active&select=id,title,status&limit=1');
      activeRound = Array.isArray(rounds) ? (rounds[0] || null) : null;

      if (activeRound) {
        const optionRows = await rest(`poll_options?round_id=eq.${activeRound.id}&select=id,title,status,sort_order,created_at&order=sort_order.asc,created_at.asc`);
        options = Array.isArray(optionRows) ? optionRows : [];
        const resultRows = await rest('rpc/get_poll_results', {
          method: 'POST',
          body: JSON.stringify({ p_round_id: activeRound.id })
        });
        voteCounts = Object.fromEntries((Array.isArray(resultRows) ? resultRows : []).map(row => [row.option_id, Number(row.votes || 0)]));
      } else {
        options = [];
        voteCounts = {};
      }

      renderPoll();
      updateStats();
      setStatus(pollStatus, '');
    } catch (error) {
      console.error('Poll admin load failed', error);
      setStatus(pollStatus, `Poll load failed: ${error.message || error}`, 'error');
    }

    try {
      const rows = await rest('community_submissions?select=id,type,title,message,display_name,tiktok_username,status,created_at&order=created_at.desc&limit=100');
      submissions = Array.isArray(rows) ? rows : [];
      renderSubmissions();
      updateStats();
    } catch (error) {
      console.error('Submission admin load failed', error);
      setStatus(submissionStatus, `Inbox load failed: ${error.message || error}`, 'error');
    }
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
    try { if (session?.access_token) await authFetch('/auth/v1/logout', { method: 'POST' }); } catch (_) {}
    clearSession();
    showLogin();
  });

  pollOptionsEl?.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    const card = event.target.closest('.option-card');
    if (!button || !card || !activeRound) return;
    const index = options.findIndex(item => item.id === card.dataset.id);
    if (index < 0) return;
    const action = button.dataset.action;
    try {
      if (action === 'up' || action === 'down') {
        const otherIndex = action === 'up' ? index - 1 : index + 1;
        if (!options[otherIndex]) return;
        const current = options[index];
        const other = options[otherIndex];
        await rest(`poll_options?id=eq.${current.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ sort_order: other.sort_order }) });
        await rest(`poll_options?id=eq.${other.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ sort_order: current.sort_order }) });
      } else if (['active','played','hidden'].includes(action)) {
        await rest(`poll_options?id=eq.${card.dataset.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: action }) });
      }
      await loadDashboard();
    } catch (error) {
      setStatus(pollStatus, `Update failed: ${error.message || error}`, 'error');
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
      await loadDashboard();
      setStatus(pollStatus, 'Pick added.', 'success');
    } catch (error) {
      setStatus(pollStatus, `Could not add pick: ${error.message || error}`, 'error');
    }
  });

  $('reset-votes-btn')?.addEventListener('click', async () => {
    if (!activeRound) return;
    if (!confirm('Reset ALL votes for the current poll? This cannot be undone.')) return;
    try {
      await rest(`poll_votes?round_id=eq.${activeRound.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      await loadDashboard();
      setStatus(pollStatus, 'Votes reset.', 'success');
    } catch (error) {
      setStatus(pollStatus, `Could not reset votes: ${error.message || error}`, 'error');
    }
  });

  $('refresh-btn')?.addEventListener('click', loadDashboard);
  $('submission-filter')?.addEventListener('change', renderSubmissions);

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
      await loadDashboard();
      setStatus(submissionStatus, 'Submission updated.', 'success');
    } catch (error) {
      setStatus(submissionStatus, `Could not update submission: ${error.message || error}`, 'error');
    }
  });

  (async () => {
    try {
      const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (stored?.access_token) {
        session = stored;
        if (await verifySession()) {
          await showDashboard();
          return;
        }
      }
    } catch (error) {
      console.warn('Stored admin session could not be restored', error);
    }
    clearSession();
    showLogin();
  })();
})();
