(() => {
  const aboutStyles = document.createElement('link');
  aboutStyles.rel = 'stylesheet';
  aboutStyles.href = 'about-clean.css';
  document.head.appendChild(aboutStyles);

  const pollStyles = document.createElement('link');
  pollStyles.rel = 'stylesheet';
  pollStyles.href = 'poll.css?v=20261106-confetti1';
  document.head.appendChild(pollStyles);
})();

(() => {
  const supportQr = document.querySelector('.support-desktop-qr img');
  if (!supportQr) return;

  supportQr.style.opacity = '0';
  supportQr.alt = 'Loading InstaPay QR…';

  const version = '20261025-original-final';
  const requests = [1,2,3,4,5,6,7].map(i =>
    fetch(`assets/qr-part-${i}.txt?v=${version}`, { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error(`QR part ${i} failed to load`);
      return response.text();
    })
  );

  Promise.all(requests).then(parts => {
    supportQr.onload = () => {
      supportQr.style.opacity = '1';
      supportQr.alt = 'InstaPay QR uploaded by Claui';
    };
    supportQr.src = 'data:image/webp;base64,' + parts.join('').replace(/\s+/g, '');
  }).catch(error => {
    console.error('Could not load the InstaPay QR image.', error);
    supportQr.style.opacity = '1';
    supportQr.alt = 'InstaPay QR could not be loaded';
  });
})();

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('supportDesktopModal');
    if (modal) {
      modal.classList.remove('is-open');
      document.body.style.overflow = '';
    }
  }
});

(() => {
  const SUPABASE_URL = 'https://foficcmsmtfkzcdcmcsc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_53ofNWMueg05oCmHjUvvpg_rYLdMJq5';
  const API = `${SUPABASE_URL}/rest/v1`;
  const apiHeaders = {
    apikey: SUPABASE_KEY,
    'Content-Type': 'application/json'
  };

  const api = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { ...apiHeaders, ...(options.headers || {}) }
    });
    if (!response.ok) {
      let detail = '';
      try { detail = await response.text(); } catch (_) {}
      throw new Error(`Supabase request failed (${response.status}) ${detail}`);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };

  const form = document.getElementById('submission-form');
  const tabs = [...document.querySelectorAll('.submission-tabs .tab')];
  const panel = document.getElementById('submission-panel');
  const communityKicker = document.getElementById('community-kicker');
  const communityTitle = document.getElementById('community-title');
  const communityDescription = document.getElementById('community-description');
  const primaryLabel = document.getElementById('primary-label');
  const primaryInput = document.getElementById('primary-input');
  const messageLabel = document.getElementById('message-label');
  const messageInput = document.getElementById('message-input');
  const messageCount = document.getElementById('message-count');
  const submissionNote = document.getElementById('submission-note');
  const success = document.getElementById('success');

  if (form) {
    const nameInput = form.querySelector('input[name="name"]');
    const tiktokInput = form.querySelector('input[name="tiktok"]');
    const submitButton = form.querySelector('button[type="submit"]');
    const inputs = [primaryInput, messageInput, nameInput, tiktokInput];
    const drafts = new Map();
    let activeType = 'game';
    let sending = false;
    const configs = {
      game: {title:'What should Claui play next?',description:'Send a game request, suggest content, or share a story for the live. Choose a tab below.',label:'Game title',placeholder:'Game name, e.g. Resident Evil 7',messageLabel:'Why this one? (optional)',messagePlaceholder:'Tell me why I should play it...',button:'Send game request',note:'Requests go straight to Claui’s private community inbox.',sent:'Sent! Your game request is now in Claui’s private inbox. ♡'},
      content: {title:'What should Claui make next?',description:'Got an idea for a TikTok, a live challenge, or a new series? Drop it here.',label:'Idea title',placeholder:'e.g. Horror challenge night',messageLabel:'Tell me more (optional)',messagePlaceholder:'What would make it fun to watch?',button:'Send content idea',note:'Ideas go straight to Claui’s private community inbox.',sent:'Sent! Your content idea is now in Claui’s private inbox. ♡'},
      story: {title:'Got a story for the live?',description:'Send a story you’re comfortable with possibly being read during the live podcast segment. Name and TikTok username are optional.',label:'Story title',placeholder:'Give your story a short title',messageLabel:'Your story',messagePlaceholder:'Write your story here...',button:'Send story',note:'Stories go straight to Claui’s private community inbox.',sent:'Sent! Your story is now in Claui’s private inbox. ♡'}
    };
    const messageLimits = { game: 5000, content: 5000, story: 50000 };
    const updateMessageCount = () => {
      if (messageCount) {
        messageCount.textContent = `${messageInput.value.length.toLocaleString('en-US')} / ${messageLimits[activeType].toLocaleString('en-US')} characters`;
      }
    };
    messageInput.addEventListener('input', updateMessageCount);
    const selectType = (type, saveDraft = true) => {
      if (sending || !Object.hasOwn(configs, type)) return;
      // Keep each draft in memory, so changing tabs cannot relabel a story as a game.
      if (saveDraft) drafts.set(activeType, inputs.map(input => input.value));
      activeType = type;
      const config = configs[type];
      inputs.forEach((input, index) => { input.value = drafts.get(type)?.[index] || ''; });
      tabs.forEach(tab => {
        const selected = tab.dataset.type === type;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
      panel.setAttribute('aria-labelledby', `submission-tab-${type}`);
      communityKicker.textContent = type === 'story' ? 'CLAUIPALADESISYON DROPBOX' : 'COMMUNITY DROPBOX';
      communityTitle.textContent = config.title;
      communityDescription.textContent = config.description;
      primaryLabel.textContent = config.label;
      primaryInput.placeholder = config.placeholder;
      messageLabel.textContent = config.messageLabel;
      messageInput.placeholder = config.messagePlaceholder;
      messageInput.required = type === 'story';
      messageInput.rows = type === 'story' ? 6 : 3;
      messageInput.maxLength = messageLimits[type];
      updateMessageCount();
      submitButton.textContent = config.button;
      submissionNote.textContent = config.note;
      success.textContent = '';
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => selectType(tab.dataset.type));
      tab.addEventListener('keydown', event => {
        const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length
          : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (target === null || sending) return;
        event.preventDefault();
        selectType(tabs[target].dataset.type);
        tabs[target].focus();
      });
    });
    selectType('game', false);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (sending) return;
      const title = primaryInput?.value.trim();
      const message = messageInput?.value.trim();
      if (!title || (activeType === 'story' && !message)) return;
      if (messageInput.value.length > messageLimits[activeType]) {
        success.textContent = `Please keep your ${activeType === 'story' ? 'story' : 'message'} within ${messageLimits[activeType].toLocaleString('en-US')} characters. Your draft is still here.`;
        return;
      }

      const type = activeType;
      const payload = {
        type, title, message: message || null,
        display_name: nameInput?.value.trim() || null,
        tiktok_username: tiktokInput?.value.trim() || null
      };
      sending = true;
      [...inputs, ...tabs, submitButton].forEach(input => { input.disabled = true; });
      form.setAttribute('aria-busy', 'true');
      submitButton.textContent = 'Sending…';
      success.textContent = '';

      try {
        await api('/community_submissions', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify(payload)
        });
        form.reset();
        updateMessageCount();
        drafts.delete(type);
        success.textContent = configs[type].sent;
      } catch (error) {
        console.error('Submission failed.', error);
        success.textContent = 'Could not send right now. Please try again.';
      } finally {
        sending = false;
        [...inputs, ...tabs, submitButton].forEach(input => { input.disabled = false; });
        form.setAttribute('aria-busy', 'false');
        submitButton.textContent = configs[type].button;
      }
    });
  }

  const list = document.getElementById('pick-list');
  if (!list) return;
  list.classList.add('poll-list');

  const summary = document.createElement('div');
  summary.className = 'poll-summary';
  summary.innerHTML = '<div><span>COMMUNITY VOTES</span><strong id="poll-total">Loading totals…</strong></div><p id="poll-leader">Every pick counts.</p>';
  list.before(summary);
  const status = document.createElement('p');
  status.className = 'poll-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  list.after(status);
  const note = document.createElement('p');
  note.className = 'poll-note';
  note.textContent = 'One vote per browser. Choose another pick to move your vote. Totals update automatically.';
  status.after(note);

  let activeRound = null;
  let options = [];
  let counts = {};
  let selectedOptionId = '';
  let pendingOptionId = '';
  let resultRequest = 0;
  let refreshing = false;
  let totalsStale = false;
  let memoryVoterToken = '';
  const rows = new Map();
  const celebrationTimers = new Map();
  const number = value => value.toLocaleString('en-US');
  const selectedKey = () => `claui-vote-${activeRound.id}`;
  const readStored = key => {
    try { return localStorage.getItem(key) || ''; } catch (_) { return ''; }
  };
  const saveStored = (key, value) => {
    try { localStorage.setItem(key, value); } catch (_) { /* Voting still works for this visit. */ }
  };
  const setStatus = (message = '', isError = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  };
  const getVoterToken = () => {
    const key = 'claui-voter-token-v1';
    let token = readStored(key) || memoryVoterToken;
    if (!token) {
      token = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      saveStored(key, token);
    }
    memoryVoterToken = token;
    return token;
  };

  const createRow = option => {
    const row = document.createElement('li');
    row.dataset.optionId = option.id;
    row.innerHTML = `
      <div class="poll-row">
        <div class="poll-name"><b class="poll-order" aria-hidden="true"></b><div class="poll-copy">
          <span class="poll-title"></span>
          <div class="poll-meta"><span class="vote-count"><strong>0</strong> <span class="vote-unit">votes</span></span><span class="poll-percent"></span><em class="leader-badge">Leading</em></div>
        </div></div>
        <button class="vote" type="button" aria-pressed="false"><svg class="vote-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path/></svg><span class="vote-label">Vote</span><span class="vote-gain" aria-hidden="true">+1</span></button>
      </div>
      <div class="poll-track" aria-hidden="true"><i class="poll-fill"></i></div>`;
    row.querySelector('.vote').addEventListener('click', () => castVote(option.id));
    return row;
  };

  const renderPoll = () => {
    const total = options.reduce((sum, option) => sum + (counts[option.id] || 0), 0);
    const max = Math.max(0, ...options.map(option => counts[option.id] || 0));
    const leaders = max > 0 ? options.filter(option => (counts[option.id] || 0) === max) : [];
    summary.querySelector('#poll-total').textContent = `${number(total)} ${total === 1 ? 'vote' : 'votes'} cast`;
    summary.querySelector('#poll-leader').textContent = !leaders.length
      ? 'Be the first to choose.'
      : leaders.length === 1 ? `Leading: ${leaders[0].title}` : `${leaders.length} picks tied for first`;
    list.setAttribute('aria-busy', String(Boolean(pendingOptionId)));
    if (!rows.size) list.replaceChildren();
    for (const [id, row] of rows) {
      if (!options.some(option => option.id === id)) {
        row.remove();
        rows.delete(id);
      }
    }
    options.forEach((option, index) => {
      const count = counts[option.id] || 0;
      const percent = total ? Math.round((count / total) * 100) : 0;
      const row = rows.get(option.id) || createRow(option);
      rows.set(option.id, row);
      const selected = selectedOptionId === option.id;
      const pending = pendingOptionId === option.id;
      row.classList.toggle('is-leading', max > 0 && count === max);
      row.classList.toggle('is-selected', selected);
      row.querySelector('.poll-order').textContent = String(index + 1).padStart(2, '0');
      row.querySelector('.poll-title').textContent = option.title;
      row.querySelector('.vote-count strong').textContent = number(count);
      row.querySelector('.vote-unit').textContent = count === 1 ? 'vote' : 'votes';
      row.querySelector('.poll-percent').textContent = `${percent}%`;
      row.querySelector('.poll-fill').style.width = `${percent}%`;
      const button = row.querySelector('.vote');
      button.disabled = Boolean(pendingOptionId);
      button.classList.toggle('voted', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-busy', String(pending));
      button.setAttribute('aria-label', selected ? `Voted for ${option.title}` : `Vote for ${option.title}`);
      row.querySelector('.vote-label').textContent = selected ? 'Voted' : 'Vote';
      row.querySelector('.vote-icon path').setAttribute('d', selected ? 'M5 12l4 4L19 6' : 'M12 5v14M5 12h14');
      // Preserve focus and bar transitions when shared totals refresh.
      if (list.children[index] !== row) list.insertBefore(row, list.children[index] || null);
    });
    if (!options.length) {
      const empty = document.createElement('li');
      empty.className = 'poll-empty';
      empty.textContent = 'No picks open yet. Check back soon.';
      list.appendChild(empty);
    }
  };

  const burstConfetti = button => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = button.getBoundingClientRect();
    const burst = document.createElement('div');
    burst.className = 'vote-confetti';
    burst.setAttribute('aria-hidden', 'true');
    const colors = ['#ef5367', '#ffc857', '#b69bff', '#6ed3be', 'var(--theme-text, #f3f1ec)'];
    for (let index = 0; index < 24; index++) {
      const angle = Math.PI + (index / 23) * Math.PI;
      const distance = 45 + Math.random() * 65;
      const drift = Math.cos(angle) * distance;
      const piece = document.createElement('i');
      piece.className = 'vote-confetti-piece';
      piece.style.left = `${bounds.left + bounds.width / 2}px`;
      piece.style.top = `${bounds.top + bounds.height / 2}px`;
      piece.style.setProperty('--confetti-color', colors[index % colors.length]);
      piece.style.setProperty('--confetti-mid-x', `${drift * .65}px`);
      piece.style.setProperty('--confetti-x', `${drift}px`);
      piece.style.setProperty('--confetti-lift', `${Math.sin(angle) * (45 + Math.random() * 55) - 24}px`);
      piece.style.setProperty('--confetti-drop', `${30 + Math.random() * 55}px`);
      piece.style.setProperty('--confetti-turn', `${(Math.random() - .5) * 720}deg`);
      piece.style.animationDuration = `${800 + Math.random() * 250}ms`;
      piece.style.animationDelay = `${Math.random() * 70}ms`;
      burst.appendChild(piece);
    }
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 1200);
  };

  const celebrateVote = optionId => {
    const row = rows.get(optionId);
    if (!row) return;
    clearTimeout(celebrationTimers.get(optionId));
    row.classList.remove('vote-confirmed');
    void row.offsetWidth; // Restart confirmation when a viewer moves their vote back.
    row.classList.add('vote-confirmed');
    burstConfetti(row.querySelector('.vote'));
    celebrationTimers.set(optionId, setTimeout(() => {
      row.classList.remove('vote-confirmed');
      celebrationTimers.delete(optionId);
    }, 900));
  };

  const loadResults = async () => {
    if (!activeRound) return;
    const request = ++resultRequest;
    const roundId = activeRound.id;
    let results;
    try {
      results = await api('/rpc/get_poll_results', {
        method: 'POST', body: JSON.stringify({ p_round_id: roundId })
      });
    } catch (error) {
      if (request !== resultRequest || activeRound?.id !== roundId) return false;
      throw error;
    }
    if (request !== resultRequest || activeRound?.id !== roundId) return false;
    counts = {};
    (results || []).forEach(row => { counts[row.option_id] = Math.max(0, Number(row.votes) || 0); });
    renderPoll();
    return true;
  };

  const castVote = async optionId => {
    if (!activeRound || pendingOptionId || selectedOptionId === optionId) return;
    const option = options.find(item => item.id === optionId);
    if (!option) return;
    const button = rows.get(optionId)?.querySelector('.vote');
    const restoreFocus = document.activeElement === button;
    const row = rows.get(optionId);
    row.classList.add('vote-pressed');
    setTimeout(() => row.classList.remove('vote-pressed'), 220);
    pendingOptionId = optionId;
    ++resultRequest; // Ignore an older refresh arriving while this vote is saving.
    setStatus();
    renderPoll();
    let saved = false;
    try {
      await api('/rpc/cast_vote', {
        method: 'POST',
        body: JSON.stringify({ p_round_id: activeRound.id, p_option_id: optionId, p_voter_token: getVoterToken() })
      });
      selectedOptionId = optionId;
      saveStored(selectedKey(), selectedOptionId);
      saved = true;
      setStatus(`Vote saved for ${option.title}.`);
    } catch (error) {
      console.error('Vote failed.', error);
      setStatus('Could not save your vote. Please try again.', true);
    } finally {
      pendingOptionId = '';
      renderPoll();
      if (restoreFocus && document.hasFocus() && (document.activeElement === document.body || document.activeElement === button)) button.focus({ preventScroll: true });
    }
    if (!saved) return;
    celebrateVote(optionId);
    // Celebrate as soon as the vote saves; fetching totals never holds up the button.
    try {
      if (await loadResults()) totalsStale = false;
    } catch (_) {
      totalsStale = true;
      setStatus('Your vote is saved. Totals will refresh when the connection returns.');
    }
  };

  const loadPoll = async () => {
    list.setAttribute('aria-busy', 'true');
    setStatus();
    try {
      const rounds = await api('/poll_rounds?select=id,title&status=eq.active&limit=1');
      activeRound = rounds?.[0] || null;
      if (!activeRound) throw new Error('No active poll round');
      options = await api(`/poll_options?select=id,title,sort_order&round_id=eq.${encodeURIComponent(activeRound.id)}&status=eq.active&order=sort_order.asc,created_at.asc`) || [];
      selectedOptionId = readStored(selectedKey());
      const title = document.getElementById('poll-title');
      if (title) title.textContent = activeRound.title;
      await loadResults();
    } catch (error) {
      console.error('Poll failed to load.', error);
      activeRound = null;
      summary.querySelector('#poll-total').textContent = 'Voting unavailable';
      summary.querySelector('#poll-leader').textContent = 'Please try again shortly.';
      list.replaceChildren();
      rows.clear();
      const retry = document.createElement('button');
      retry.className = 'poll-retry';
      retry.type = 'button';
      retry.textContent = 'Try loading the poll again';
      retry.addEventListener('click', () => { retry.disabled = true; loadPoll(); });
      setStatus('The community poll could not load right now.', true);
      status.appendChild(retry);
    } finally {
      list.setAttribute('aria-busy', 'false');
    }
  };

  const refreshResults = async () => {
    if (!activeRound || pendingOptionId || refreshing || document.hidden) return;
    refreshing = true;
    try {
      if (!await loadResults()) return;
      if (totalsStale) setStatus('Vote totals are up to date.');
      totalsStale = false;
    } catch (_) {
      if (!pendingOptionId) {
        totalsStale = true;
        setStatus('Showing the last available totals. Reconnecting…');
      }
    } finally { refreshing = false; }
  };
  setInterval(refreshResults, 15000);
  document.addEventListener('visibilitychange', refreshResults);
  window.addEventListener('focus', refreshResults);
  window.addEventListener('storage', event => {
    if (!activeRound || pendingOptionId) return;
    if (event.key === selectedKey() || event.key === null) {
      selectedOptionId = readStored(selectedKey());
      renderPoll();
      refreshResults();
    }
  });
  loadPoll();
})();
