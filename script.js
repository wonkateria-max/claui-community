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

document.addEventListener('keydown',function(e){if(e.key==='Escape'){var m=document.getElementById('supportDesktopModal');if(m){m.classList.remove('is-open');document.body.style.overflow='';}}});

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

  document.querySelectorAll('.tiktok-shell').forEach(shell => {
    const reveal = () => {
      if (shell.querySelector('iframe')) shell.classList.add('embed-ready');
    };
    const observer = new MutationObserver(reveal);
    observer.observe(shell, {childList:true, subtree:true});
    reveal();
  });

  const tabs = [...document.querySelectorAll('.tab')];
  const communityTitle = document.getElementById('community-title');
  const communityDescription = document.getElementById('community-description');
  const primaryLabel = document.getElementById('primary-label');
  const primaryInput = document.getElementById('primary-input');
  const messageLabel = document.getElementById('message-label');
  const messageInput = document.getElementById('message-input');
  const form = document.getElementById('submission-form');
  const success = document.getElementById('success');
  let activeType = 'game';

  const configs = {
    game:{title:'What should Claui play next?',desc:'Send a game request. Switch tabs if you want to drop a content idea or podcast story instead.',label:'Game title',ph:'Game name, e.g. Resident Evil 7',ml:'Why this one? <em>optional</em>',mph:'Tell me why I should play it...'},
    content:{title:'What should Claui make next?',desc:'Drop a content idea for TikTok, live, or something weird enough to become a series.',label:'Idea title',ph:'e.g. Horror challenge night',ml:'Tell me more <em>optional</em>',mph:'What would make it fun to watch?'},
    story:{title:'Got a story for the live?',desc:'Send a story you are comfortable with possibly being read during the podcast segment.',label:'Story title',ph:'Give your story a short title',ml:'Your story',mph:'Write your story here...'}
  };

  function select(type){
    activeType = configs[type] ? type : 'game';
    const c=configs[activeType];
    tabs.forEach(t=>{const a=t.dataset.type===activeType;t.classList.toggle('active',a);t.setAttribute('aria-selected',String(a));});
    communityTitle.textContent=c.title;communityDescription.textContent=c.desc;primaryLabel.textContent=c.label;primaryInput.placeholder=c.ph;messageLabel.innerHTML=c.ml;messageInput.placeholder=c.mph;success.textContent='';
  }
  tabs.forEach(t=>t.addEventListener('click',()=>select(t.dataset.type)));

  if(form){
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const title = primaryInput.value.trim();
      if(!title) return;

      const submitButton = form.querySelector('button[type="submit"]');
      const nameInput = form.querySelector('input[name="name"]');
      const tiktokInput = form.querySelector('input[name="tiktok"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Sending…';
      success.textContent = '';

      try {
        await api('/community_submissions', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            type: activeType,
            title,
            message: messageInput.value.trim() || null,
            display_name: nameInput?.value.trim() || null,
            tiktok_username: tiktokInput?.value.trim() || null
          })
        });
        form.reset();
        select(activeType);
        success.textContent = 'Sent! Your submission is now in Claui’s inbox. ♡';
      } catch (error) {
        console.error('Submission failed.', error);
        success.textContent = 'Could not send right now. Please try again.';
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit';
      }
    });
  }

  const list = document.getElementById('pick-list');
  if(!list) return;

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
      token = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
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
    if (!activeRound) return;
    if (selectedOptionId === optionId) return;
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