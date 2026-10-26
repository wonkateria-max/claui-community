(() => {
  const API = 'https://foficcmsmtfkzcdcmcsc.supabase.co/functions/v1/community-updates';
  const KEY = 'sb_publishable_53ofNWMueg05oCmHjUvvpg_rYLdMJq5';
  const PROFILE = 'https://www.tiktok.com/@clawiwawi';
  const LOCAL_CLIPS = Object.freeze({
    '7698410001156623636':'assets/videos/7698410001156623636.mp4',
    '7681729305855921429':'assets/videos/7681729305855921429.mp4',
    '7676937964533943573':'assets/videos/7676937964533943573.mp4',
  });
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
  const videoDialog=make('dialog','clip-dialog');
  videoDialog.setAttribute('aria-labelledby','clip-dialog-title');
  const videoHeader=make('div','clip-dialog-head');
  const videoTitle=make('h2');videoTitle.id='clip-dialog-title';
  const videoClose=make('button','clip-dialog-close','×');videoClose.type='button';videoClose.setAttribute('aria-label','Close video');
  const videoStage=make('div','clip-dialog-stage');
  const videoNote=make('p','clip-dialog-note','');videoNote.setAttribute('role','status');videoNote.hidden=true;
  const videoLink=make('a','highlights-link','Open on TikTok ↗');videoLink.target='_blank';videoLink.rel='noopener noreferrer';
  videoHeader.append(videoTitle,videoClose);videoDialog.append(videoHeader,videoStage,videoNote,videoLink);document.body.append(videoDialog);
  let videoFrame=null;
  let localVideo=null;
  let videoTrigger=null;
  let previousOverflow='';
  function openVideo(video,trigger) {
    if(!/^\d{15,22}$/.test(String(video.video_id)))return;
    videoTrigger=trigger;videoTitle.textContent=video.title;videoLink.href=PROFILE+'/video/'+video.video_id;
    videoNote.hidden=true;videoStage.replaceChildren();
    if(LOCAL_CLIPS[video.video_id]) {
      localVideo=make('video');localVideo.src=LOCAL_CLIPS[video.video_id];localVideo.controls=true;localVideo.playsInline=true;localVideo.preload='metadata';
      localVideo.poster=API+'/image?id='+encodeURIComponent(video.video_id)+'&v='+encodeURIComponent(video.created_at||'1');
      localVideo.setAttribute('aria-label',video.title);
      localVideo.addEventListener('error',event=>{if(event.currentTarget!==localVideo||!videoDialog.open)return;videoNote.textContent='This clip could not load. Use the TikTok link below.';videoNote.hidden=false;});
      videoStage.append(localVideo);
    } else {
      videoFrame=make('iframe');videoFrame.title=video.title+' — TikTok video';
      videoFrame.src='https://www.tiktok.com/player/v1/'+video.video_id+'?autoplay=1&controls=1&music_info=0&description=0&rel=0';
      videoFrame.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';videoFrame.allowFullscreen=true;
      videoFrame.referrerPolicy='strict-origin-when-cross-origin';videoStage.append(videoFrame);
    }
    previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';videoDialog.showModal();
    const currentVideo=localVideo;
    currentVideo?.play().catch(error=>{
      if(localVideo!==currentVideo||!videoDialog.open)return;
      videoNote.textContent=error.name==='NotAllowedError'?'Tap the play button to start the video.':'This clip could not load. Use the TikTok link below.';
      videoNote.hidden=false;
    });
  }
  videoClose.addEventListener('click',()=>videoDialog.close());
  videoDialog.addEventListener('click',event=>{if(event.target===videoDialog)videoDialog.close();});
  videoDialog.addEventListener('close',()=>{
    if(localVideo){localVideo.pause();localVideo.removeAttribute('src');localVideo.load();localVideo=null;}
    videoStage.replaceChildren();videoFrame=null;document.body.style.overflow=previousOverflow;
    if(videoTrigger?.isConnected)videoTrigger.focus();else $('latest-content-grid').querySelector('button')?.focus();
  });
  window.addEventListener('message',event=>{
    if(event.origin!=='https://www.tiktok.com'||!videoFrame||event.source!==videoFrame.contentWindow||event.data?.['x-tiktok-player']!==true)return;
    const {type,value}=event.data;
    if(type==='onPlayerReady'||type==='onStateChange'&&value===1)videoNote.hidden=true;
    if(type==='onPlayerError'||type==='onError') {
      const code=Number(typeof value==='object'?value?.errorCode:value);
      videoNote.textContent=code===3002?'Tap the play button to start the video.':'Having trouble playing? Use the TikTok link below.';
      videoNote.hidden=false;
    }
  });
  function renderVideos(rows) {
    const grid=$('latest-content-grid');grid.replaceChildren();
    if (!rows?.length) {
      const empty=make('div','content-empty');
      empty.append(make('span','clip-mark','↗'),make('h3','','More chaos on TikTok'),make('p','','Clips from the late-night games, reactions, and everything in between.'));
      const link=make('a','highlights-link','Watch @clawiwawi ↗');link.href=PROFILE;link.target='_blank';link.rel='noreferrer';empty.append(link);grid.append(empty);return;
    }
    rows.filter(video=>/^\d{15,22}$/.test(String(video.video_id))).slice(0,4).forEach(video=>{
      const card=make('article','content-clip');
      const open=make('button','content-clip-open');open.type='button';open.setAttribute('aria-label','Play '+video.title);
      const poster=make('div','content-clip-poster');
      const img=make('img');img.src=`${API}/image?id=${encodeURIComponent(video.video_id)}&v=${encodeURIComponent(video.created_at||'1')}`;img.alt='';img.loading='lazy';
      const play=make('span','content-play','▶');play.setAttribute('aria-hidden','true');poster.append(img,play);
      open.append(poster);open.addEventListener('click',()=>openVideo(video,open));
      const link=make('a','content-clip-label','Open on TikTok ↗');link.href=PROFILE+'/video/'+video.video_id;link.target='_blank';link.rel='noopener noreferrer';
      card.append(open,make('h3','',video.title),link);grid.append(card);
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
