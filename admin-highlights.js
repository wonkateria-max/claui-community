(() => {
  const API='https://foficcmsmtfkzcdcmcsc.supabase.co/functions/v1/community-updates';
  const KEY='sb_publishable_53ofNWMueg05oCmHjUvvpg_rYLdMJq5';
  const $=id=>document.getElementById(id);
  let connection=null;
  let loading=false;
  let healthTimer;
  let thumbnail=null;
  let videos=[];
  const setStatus=(id,text,error=false)=>{const el=$(id);el.textContent=text;el.className=`status${error?' error':''}`;};
  async function request(action,body) {
    const session=JSON.parse(localStorage.getItem('claui-admin-session-v1')||'null');
    if(!session?.access_token)throw new Error('Sign in to Claui Admin first.');
    const response=await fetch(`${API}/${action}`,{
      method:body?'POST':'GET',headers:{apikey:KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(30000),
    });
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'Could not update right now.');
    return data;
  }
  function renderHealth() {
    const seen=Date.parse(connection?.last_seen_at||'');
    const online=Number.isFinite(seen)&&Date.now()-seen<60000;
    $('bridge-health').classList.toggle('is-connected',online&&connection?.source_connected);
    $('bridge-health-text').textContent=online
      ? connection.source_connected?'TikFinity source connected':'Source online · waiting for TikFinity'
      : connection?'Source not connected':'Not set up yet';
    $('bridge-create').textContent=connection?'Replace connection link':'Create private connection link';
  }
  function renderVideos() {
    const list=$('admin-video-list');list.replaceChildren();
    if(!videos.length){const p=document.createElement('p');p.className='muted';p.textContent='Add a TikTok link to create your first card.';list.append(p);return;}
    videos.forEach(video=>{
      const row=document.createElement('article');row.className=`admin-video-row${video.hidden?' is-hidden':''}`;
      const copy=document.createElement('div');const title=document.createElement('strong');title.textContent=video.title;
      const note=document.createElement('small');note.textContent=video.hidden?'Hidden from the website':'Shown on the website';copy.append(title,note);
      const actions=document.createElement('div');actions.className='admin-video-actions';
      const edit=document.createElement('button');edit.type='button';edit.className='ghost';edit.textContent='Edit';
      edit.addEventListener('click',()=>{$('clip-url').value=`https://www.tiktok.com/@clawiwawi/video/${video.video_id}`;$('clip-title').value=video.title;$('clip-title').focus();});
      const hide=document.createElement('button');hide.type='button';hide.className='ghost';hide.textContent=video.hidden?'Restore':'Hide';
      hide.addEventListener('click',async()=>{
        hide.disabled=true;
        try{await request('videos',{action:video.hidden?'restore':'hide',video_id:video.video_id});await load();}
        catch(error){setStatus('clip-status',error.message,true);hide.disabled=false;}
      });
      actions.append(edit,hide);row.append(copy,actions);list.append(row);
    });
  }
  async function load() {
    clearTimeout(healthTimer);
    if($('dashboard-view').hidden||loading)return;
    loading=true;
    try{const data=await request('admin');connection=data.connection;videos=data.videos||[];renderHealth();renderVideos();}
    catch(error){setStatus('bridge-status',error.message,true);}
    finally{loading=false;if(!$('dashboard-view').hidden)healthTimer=setTimeout(load,30000);}
  }
  $('bridge-create').addEventListener('click',async()=>{
    if(connection&&!confirm('Replace the private connection link? Your current LIVE Studio source will need the new link.'))return;
    const button=$('bridge-create');button.disabled=true;setStatus('bridge-status','Creating private link…');
    try{
      const data=await request('pair',{});
      $('bridge-url').value=`${data.url}&overlay=1`;
      $('bridge-test').href=data.url;
      $('bridge-key-box').hidden=false;
      setStatus('bridge-status','Link ready. Add it to LIVE Studio once, then keep the source enabled while streaming.');
      await load();
    }catch(error){setStatus('bridge-status',error.message,true);}
    finally{button.disabled=false;}
  });
  $('bridge-copy').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText($('bridge-url').value);setStatus('bridge-status','Copied. LIVE Studio → Sources → + → Link.');}
    catch{$('bridge-url').select();setStatus('bridge-status','Select the link and press Ctrl+C to copy it.');}
  });
  $('clip-cover').addEventListener('change',async event=>{
    thumbnail=null;$('clip-cover-preview').hidden=true;
    const file=event.target.files?.[0];if(!file)return;
    try{
      if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPG, PNG or WebP image.');
      const image=await createImageBitmap(file);
      const scale=Math.min(1,960/Math.max(image.width,image.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();
      thumbnail=canvas.toDataURL('image/webp',.82);
      if(thumbnail.length>600000)throw new Error('Choose a smaller cover image.');
      $('clip-cover-preview').src=thumbnail;$('clip-cover-preview').hidden=false;setStatus('clip-status','');
    }catch(error){thumbnail=null;event.target.value='';setStatus('clip-status',error.message,true);}
  });
  $('clip-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=$('clip-save');button.disabled=true;setStatus('clip-status','Saving card…');
    try{
      const data=await request('videos',{url:$('clip-url').value.trim(),title:$('clip-title').value.trim(),...(thumbnail?{thumbnail_data:thumbnail}:{})});
      $('clip-form').reset();thumbnail=null;$('clip-cover-preview').hidden=true;
      setStatus('clip-status',data.preview_available?'Card saved. It will appear on the website shortly.':'Card saved. TikTok did not return a thumbnail; add a cover image here for a photo preview.');
      await load();
    }catch(error){setStatus('clip-status',error.message,true);}
    finally{button.disabled=false;}
  });
  window.addEventListener('claui-admin-ready',load);
  window.addEventListener('claui-admin-logout',()=>{clearTimeout(healthTimer);$('bridge-url').value='';$('bridge-test').removeAttribute('href');$('bridge-key-box').hidden=true;});
  if(!$('dashboard-view').hidden)load();
})();
