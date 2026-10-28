(() => {
  const aboutStyles = document.createElement('link');
  aboutStyles.rel = 'stylesheet';
  aboutStyles.href = 'about-clean.css';
  document.head.appendChild(aboutStyles);

  const pollStyles = document.createElement('link');
  pollStyles.rel = 'stylesheet';
  pollStyles.href = 'poll.css';
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
    const messageLimits = { game: 5000, content: 5000, story: 30000 };
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

  const summary = document.createElement('div');
  summary.className = 'poll-summary';
  summary.innerHTML = '<span>LIVE COMMUNITY POLL</span><strong id="poll-leader">Loading picks…</strong>';
  list.before(summary);

  const existingNote = list.parentElement?.querySelector('.poll-note');
  if (existingNote) existingNote.remove();
  const note = document.createElement('p');
  note.className = 'poll-note';
  note.textContent = 'Shared community totals. One vote per browser — you can change your pick anytime.';
  list.after(note);

  let activeRound = null;
  let options = [];
  let counts = {};
  let selectedOptionId = '';

  const getVoterToken = () => {
    const key = 'claui-voter-token-v1';
    let token = localStorage.getItem(key);
    if (!token) {
      token = crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(key, token);
    }
    return token;
  };

  const selectedKey = () => activeRound ? `claui-vote-${activeRound.id}` : 'claui-vote';

  const renderPoll = () => {
    const total = options.reduce((sum, option) => sum + (counts[option.id] || 0), 0);
    const max = Math.max(0, ...options.map(option => counts[option.id] || 0));
    const leaders = max > 0 ? options.filter(option => (counts[option.id] || 0) === max) : [];
    const leaderText = document.getElementById('poll-leader');
    if (leaderText) {
      leaderText.textContent = !leaders.length
        ? 'No votes yet'
        : leaders.length === 1
          ? `Leading: ${leaders[0].title}`
          : `Tie: ${leaders.map(option => option.title).join(' · ')}`;
    }

    list.innerHTML = '';
    options.forEach((option, index) => {
      const count = counts[option.id] || 0;
      const percent = total ? Math.round((count / total) * 100) : 0;
      const li = document.createElement('li');
      li.dataset.optionId = option.id;
      if (max > 0 && count === max) li.classList.add('is-leading');
      li.innerHTML = `
        <div class="poll-row">
          <div class="poll-name"><b>${index + 1}</b><span></span><em class="leader-badge">Leading</em></div>
          <div class="poll-actions"><small class="vote-count">${count} ${count === 1 ? 'vote' : 'votes'}</small><button class="vote${selectedOptionId === option.id ? ' voted' : ''}" type="button">${selectedOptionId === option.id ? '✓ Voted' : '＋ Vote'}</button></div>
        </div>
        <div class="poll-track"><i class="poll-fill" style="width:${percent}%"></i></div>`;
      li.querySelector('.poll-name span').textContent = option.title;
      li.querySelector('.vote').addEventListener('click', () => castVote(option.id));
      list.appendChild(li);
    });
  };

  const loadResults = async () => {
    if (!activeRound) return;
    const results = await api('/rpc/get_poll_results', {
      method: 'POST',
      body: JSON.stringify({ p_round_id: activeRound.id })
    });
    counts = {};
    (results || []).forEach(row => { counts[row.option_id] = Number(row.votes) || 0; });
    renderPoll();
  };

  const castVote = async optionId => {
    if (!activeRound || selectedOptionId === optionId) return;
    const button = list.querySelector(`[data-option-id="${optionId}"] .vote`);
    if (button) {
      button.disabled = true;
      button.textContent = 'Voting…';
    }
    try {
      await api('/rpc/cast_vote', {
        method: 'POST',
        body: JSON.stringify({
          p_round_id: activeRound.id,
          p_option_id: optionId,
          p_voter_token: getVoterToken()
        })
      });
      selectedOptionId = optionId;
      localStorage.setItem(selectedKey(), selectedOptionId);
      await loadResults();
    } catch (error) {
      console.error('Vote failed.', error);
      if (button) {
        button.disabled = false;
        button.textContent = '＋ Vote';
      }
    }
  };

  const loadPoll = async () => {
    try {
      const rounds = await api('/poll_rounds?select=id,title&status=eq.active&limit=1');
      activeRound = rounds?.[0] || null;
      if (!activeRound) throw new Error('No active poll round');

      options = await api(`/poll_options?select=id,title,sort_order&round_id=eq.${encodeURIComponent(activeRound.id)}&status=eq.active&order=sort_order.asc,created_at.asc`) || [];
      selectedOptionId = localStorage.getItem(selectedKey()) || '';
      await loadResults();
    } catch (error) {
      console.error('Poll failed to load.', error);
      const leaderText = document.getElementById('poll-leader');
      if (leaderText) leaderText.textContent = 'Poll temporarily unavailable';
      note.textContent = 'The community poll could not load right now. Please refresh and try again.';
    }
  };

  loadPoll();
})();
