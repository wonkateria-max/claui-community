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
  if (supportQr) {
    supportQr.src = 'assets/instapay-uploaded.svg?v=20261025-1810';
    supportQr.alt = 'InstaPay QR uploaded by Claui';
  }
})();

document.addEventListener('keydown',function(e){if(e.key==='Escape'){var m=document.getElementById('supportDesktopModal');if(m){m.classList.remove('is-open');document.body.style.overflow='';}}});

(() => {
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

  const configs = {
    game:{title:'What should Claui play next?',desc:'Send a game request. Switch tabs if you want to drop a content idea or podcast story instead.',label:'Game title',ph:'Game name, e.g. Resident Evil 7',ml:'Why this one? <em>optional</em>',mph:'Tell me why I should play it...'},
    content:{title:'What should Claui make next?',desc:'Drop a content idea for TikTok, live, or something weird enough to become a series.',label:'Idea title',ph:'e.g. Horror challenge night',ml:'Tell me more <em>optional</em>',mph:'What would make it fun to watch?'},
    story:{title:'Got a story for the live?',desc:'Send a story you are comfortable with possibly being read during the podcast segment.',label:'Story title',ph:'Give your story a short title',ml:'Your story',mph:'Write your story here...'}
  };
  function select(type){
    const c=configs[type]||configs.game;
    tabs.forEach(t=>{const a=t.dataset.type===type;t.classList.toggle('active',a);t.setAttribute('aria-selected',String(a));});
    communityTitle.textContent=c.title;communityDescription.textContent=c.desc;primaryLabel.textContent=c.label;primaryInput.placeholder=c.ph;messageLabel.innerHTML=c.ml;messageInput.placeholder=c.mph;success.textContent='';
  }
  tabs.forEach(t=>t.addEventListener('click',()=>select(t.dataset.type)));
  if(form){form.addEventListener('submit',e=>{e.preventDefault();if(!primaryInput.value.trim())return;success.textContent='Prototype received — backend connection comes next.';});}

  const list = document.getElementById('pick-list');
  if(list){
    const extras = ['ClauiPaladesisyon Readings','Claui Unfiltered'];
    const currentNames = [...list.querySelectorAll('li')].map(li => li.querySelector('span')?.textContent.replace(/^\s*\d+\s*/, '').trim());
    extras.forEach(name => {
      if(currentNames.includes(name)) return;
      const li = document.createElement('li');
      li.innerHTML = `<span><b>${list.children.length+1}</b> ${name}</span><button class="vote" type="button">＋ Vote</button>`;
      list.appendChild(li);
      currentNames.push(name);
    });

    const items = [...list.querySelectorAll('li')];
    const names = items.map(li => li.querySelector('span').textContent.replace(/^\s*\d+\s*/, '').trim());
    let counts = {};
    try{ counts = JSON.parse(localStorage.getItem('claui-weekly-vote-counts') || '{}') || {}; }catch(_){ counts = {}; }
    names.forEach(name => { if(!Number.isFinite(counts[name])) counts[name] = 0; });
    let selected = localStorage.getItem('claui-weekly-vote') || '';

    const summary = document.createElement('div');
    summary.className = 'poll-summary';
    summary.innerHTML = '<span>LIVE COMMUNITY POLL</span><strong id="poll-leader">No votes yet</strong>';
    list.before(summary);

    items.forEach((li,index) => {
      const name = names[index];
      li.dataset.game = name;
      li.innerHTML = `
        <div class="poll-row">
          <div class="poll-name"><b>${index+1}</b><span>${name}</span><em class="leader-badge">Leading</em></div>
          <div class="poll-actions"><small class="vote-count">0 votes</small><button class="vote" type="button">＋ Vote</button></div>
        </div>
        <div class="poll-track"><i class="poll-fill"></i></div>`;
    });

    const note = document.createElement('p');
    note.className = 'poll-note';
    note.textContent = 'One vote per browser for now. Shared community totals will go live when the backend is connected.';
    list.after(note);

    const renderPoll = () => {
      const total = names.reduce((sum,name)=>sum+(counts[name]||0),0);
      const max = Math.max(0,...names.map(name=>counts[name]||0));
      const leaders = max > 0 ? names.filter(name=>(counts[name]||0)===max) : [];
      const leaderText = document.getElementById('poll-leader');
      if(leaderText){
        leaderText.textContent = !leaders.length ? 'No votes yet' : leaders.length === 1 ? `Leading: ${leaders[0]}` : `Tie: ${leaders.join(' · ')}`;
      }
      items.forEach(li => {
        const name = li.dataset.game;
        const count = counts[name] || 0;
        const percent = total ? Math.round((count/total)*100) : 0;
        li.classList.toggle('is-leading', max>0 && count===max);
        const countEl = li.querySelector('.vote-count');
        const fill = li.querySelector('.poll-fill');
        const btn = li.querySelector('.vote');
        if(countEl) countEl.textContent = `${count} ${count===1?'vote':'votes'}`;
        if(fill) fill.style.width = `${percent}%`;
        if(btn){
          const voted = selected===name;
          btn.classList.toggle('voted',voted);
          btn.textContent = voted ? '✓ Voted' : '＋ Vote';
        }
      });
    };

    items.forEach(li => {
      const btn = li.querySelector('.vote');
      btn.addEventListener('click',()=>{
        const name = li.dataset.game;
        if(selected===name){
          counts[name] = Math.max(0,(counts[name]||0)-1);
          selected = '';
          localStorage.removeItem('claui-weekly-vote');
        }else{
          if(selected && names.includes(selected)) counts[selected] = Math.max(0,(counts[selected]||0)-1);
          counts[name] = (counts[name]||0)+1;
          selected = name;
          localStorage.setItem('claui-weekly-vote',selected);
        }
        localStorage.setItem('claui-weekly-vote-counts',JSON.stringify(counts));
        renderPoll();
      });
    });

    renderPoll();
  }
})();