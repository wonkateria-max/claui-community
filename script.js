(() => {
  const aboutStyles = document.createElement('link');
  aboutStyles.rel = 'stylesheet';
  aboutStyles.href = 'about-clean.css';
  document.head.appendChild(aboutStyles);
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

  document.querySelectorAll('.vote').forEach(btn=>btn.addEventListener('click',()=>{
    btn.classList.toggle('voted'); btn.textContent=btn.classList.contains('voted')?'✓ Voted':'＋ Vote';
  }));
})();