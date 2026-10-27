(() => {
  const API='https://foficcmsmtfkzcdcmcsc.supabase.co/functions/v1/telegram-notifications';
  const KEY='sb_publishable_53ofNWMueg05oCmHjUvvpg_rYLdMJq5';
  const $=id=>document.getElementById(id);
  let enabled=false;
  let busy=false;
  const status=(message,error=false)=>{$('telegram-status').textContent=message;$('telegram-status').className=`status${error?' error':''}`;};
  async function request(body) {
    const session=JSON.parse(localStorage.getItem('claui-admin-session-v1')||'null');
    if(!session?.access_token)throw new Error('Sign in to Claui Admin first.');
    const res=await fetch(API,{method:body?'POST':'GET',headers:{apikey:KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(45000)});
    const data=await res.json();if(!res.ok)throw new Error(data.error||'Could not update Telegram.');return data;
  }
  function pairing(username,code) {
    const link=$('telegram-connect-link');
    link.href=`https://t.me/${username}?start=${code}`;
    $('telegram-pairing').hidden=false;
    $('telegram-setup').open=true;
  }
  function render(data) {
    enabled=!!data.enabled;
    $('telegram-health').textContent=data.connected?`${enabled?'Alerts on':'Alerts paused'} · @${data.bot_username}${data.pending?` · ${data.pending} awaiting delivery`:''}${data.failed?` · ${data.failed} failed alerts`:''}`:'Not connected yet';
    $('telegram-controls').hidden=!data.connected;
    $('telegram-toggle').textContent=enabled?'Pause alerts':'Resume alerts';
    $('telegram-setup').open=!data.connected;
    $('telegram-pairing').hidden=true;
    $('telegram-connect-link').removeAttribute('href');
    if(data.pending_username&&data.pairing_code)pairing(data.pending_username,data.pairing_code);
  }
  async function run(task) {
    if(busy)return;busy=true;
    const buttons=[...$('telegram-alerts').querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
    try{await task();}catch(e){status(e.message,true);}finally{busy=false;buttons.forEach(b=>b.disabled=false);}
  }
  async function load(){if(!$('dashboard-view').hidden)await run(async()=>{render(await request());status('');});}
  $('telegram-token-form').addEventListener('submit',event=>{
    event.preventDefault();
    run(async()=>{
      status('Checking bot…');
      const token=$('telegram-token').value.trim();$('telegram-token').value='';
      const data=await request({action:'prepare',token});
      const url=new URL(data.url);pairing(data.bot_username,url.searchParams.get('start'));
      status('Open your bot using the link above and press Start. Then confirm here.');
    });
  });
  $('telegram-confirm').addEventListener('click',()=>run(async()=>{
    status('Connecting your private chat…');render(await request({action:'confirm'}));
    status('Connected! Check Telegram for the welcome alert. New entries will be sent automatically.');
  }));
  $('telegram-test').addEventListener('click',()=>run(async()=>{status('Sending test…');await request({action:'test'});status('Test sent. Check your Telegram chat.');}));
  $('telegram-toggle').addEventListener('click',()=>run(async()=>{render(await request({action:enabled?'disable':'enable'}));status(enabled?'Alerts resumed.':'Alerts paused.');}));
  window.addEventListener('claui-admin-ready',load);
  window.addEventListener('claui-admin-logout',()=>{
    $('telegram-token').value='';$('telegram-connect-link').removeAttribute('href');$('telegram-pairing').hidden=true;
    $('telegram-controls').hidden=true;$('telegram-health').textContent='Sign in to manage Telegram alerts.';status('');
  });
  if(!$('dashboard-view').hidden)load();
})();
