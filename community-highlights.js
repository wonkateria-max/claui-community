(() => {
  const API = 'https://foficcmsmtfkzcdcmcsc.supabase.co/functions/v1/community-updates';
  const KEY = 'sb_publishable_53ofNWMueg05oCmHjUvvpg_rYLdMJq5';
  const PROFILE = 'https://www.tiktok.com/@clawiwawi';
  const $ = id => document.getElementById(id);
  const number = value => new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(Number(value)||0);
  const make = (tag,className,text) => {const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
  let recap = null;
  let timer;
  let lastResponse = '';
  let detailsTrigger;

  const ranks = (container, rows, field, unit, limit=3) => {
    container.replaceChildren();
    if (!rows?.length) {container.append(make('li','rank-empty',`No ${unit==='coins'?'gifts':'likes'} recorded yet.`));return;}
    rows.slice(0,limit).forEach((person,index)=>{
      const li=make('li','supporter-row');
      const avatar=make('span','supporter-avatar',Array.from(person.nickname||person.username||'?').slice(0,1).join('').toUpperCase());
      if (person.avatar_url) {
        const img=make('img');img.src=person.avatar_url;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';
        img.addEventListener('error',()=>img.remove(),{once:true});avatar.append(img);
      }
      const identity=make('span','supporter-identity');
      const amount=Number(person[field])||0;
      identity.append(make('strong','',person.nickname||person.username||'Viewer'),make('small','',`${number(amount)} ${amount===1?(unit==='coins'?'coin':'like'):unit}`));
      li.append(make('span','supporter-place',String(index+1)),avatar,identity);container.append(li);
    });
  };

  function renderRecap(data) {
    recap=data;
    const hasStream=Boolean(data?.stream);
    $('supporter-empty').hidden=hasStream;
    $('supporter-board').hidden=false;
    $('supporter-foot').hidden=!hasStream;
    $('supporter-totals').hidden=!hasStream;
    $('supporter-details-open').hidden=!hasStream;
    $('supporter-date').textContent=hasStream
      ? `Latest recorded LIVE · ${new Date(data.stream.started_at).toLocaleDateString('en-PH',{month:'short',day:'numeric',timeZone:'Asia/Manila'})}`
      : 'Next LIVE';
    ranks($('top-gifters'),data?.gifters || [],'coins','coins');
    ranks($('top-likers'),data?.likers || [],'likes','likes');
    if (!hasStream) return;
    $('supporter-totals').textContent=`${number(data.total_likes)} ${Number(data.total_likes)===1?'like':'likes'} · ${number(data.total_gifts)} ${Number(data.total_gifts)===1?'gift':'gifts'}`;
    if ($('supporter-dialog').open) renderDetails();
  }
  function renderDetails() {
    if (!recap) return;
    ranks($('details-gifters'),recap.gifters,'coins','coins',20);
    ranks($('details-likers'),recap.likers,'likes','likes',20);
  }
  function renderVideos(rows) {
    const grid=$('latest-content-grid');grid.replaceChildren();
    if (!rows?.length) {
      const empty=make('div','content-empty');
      empty.append(make('span','clip-mark','↗'),make('h3','','More chaos on TikTok'),make('p','','Clips from the late-night games, reactions, and everything in between.'));
      const link=make('a','highlights-link','Watch @clawiwawi ↗');link.href=PROFILE;link.target='_blank';link.rel='noreferrer';empty.append(link);grid.append(empty);return;
    }
    rows.slice(0,4).forEach(video=>{
      const card=make('a','content-clip');card.href=`${PROFILE}/video/${video.video_id}`;card.target='_blank';card.rel='noreferrer';
      const poster=make('div','content-clip-poster');
      const img=make('img');img.src=`${API}/image?id=${encodeURIComponent(video.video_id)}&v=${encodeURIComponent(video.created_at||'1')}`;img.alt='';img.loading='lazy';
      const play=make('span','content-play','▶');play.setAttribute('aria-hidden','true');poster.append(img,play);
      card.append(poster,make('h3','',video.title),make('span','content-clip-label','Watch on TikTok ↗'));grid.append(card);
    });
  }
  async function load() {
    clearTimeout(timer);if(document.hidden)return;
    try {
      const response=await fetch(API,{headers:{apikey:KEY},cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Unavailable');
      const data=await response.json();
      const signature=JSON.stringify(data);
      if(signature!==lastResponse) {renderRecap(data.recap);renderVideos(data.videos);lastResponse=signature;}
    } catch {
      if(!lastResponse) {$('supporter-empty-title').textContent='The community makes the stream.';$('supporter-empty-copy').textContent='Supporter highlights will be back soon.';renderVideos([]);}
    } finally {if(!document.hidden)timer=setTimeout(load,30000);}
  }
  const dialog=$('supporter-dialog');
  $('supporter-details-open').addEventListener('click',e=>{detailsTrigger=e.currentTarget;renderDetails();dialog.showModal();});
  $('supporter-details-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>detailsTrigger?.focus());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else load();});
  load();
})();
