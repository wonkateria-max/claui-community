const KEY='sb_publishable_53ofNWMueg05oCmHjUvvpg_rYLdMJq5';
const SITE='https://claui-community.pages.dev';
const ORIGINS=new Set([SITE,'https://wonkateria-max.github.io']);
export function findPairingChat(updates: any[], code: string) {
  return updates.find(u=>u.message?.chat?.type==='private' && u.message?.from?.is_bot===false
    && u.message.text===`/start ${code}` && String(u.message.chat.id)===String(u.message.from.id))?.message.chat.id;
}
export function createTelegramHandler({env,fetcher=fetch,randomCode=()=>crypto.randomUUID().replaceAll('-','')}:{
  env:(name:string)=>string|undefined;fetcher?:typeof fetch;randomCode?:()=>string;
}) {
  const base=env('SUPABASE_URL')||'';
  let serverKey=env('SUPABASE_SERVICE_ROLE_KEY')||'';
  try{serverKey=JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}').default||serverKey;}catch{}
  const rpc=async(action:string,data:Record<string,unknown>={})=>{
    const res=await fetcher(`${base}/rest/v1/rpc/telegram_service`,{method:'POST',
      headers:{apikey:serverKey,...(serverKey.startsWith('eyJ')?{Authorization:`Bearer ${serverKey}`} : {}),'Content-Type':'application/json'},
      body:JSON.stringify({p_action:action,p_data:data}),signal:AbortSignal.timeout(10000)});
    if(!res.ok)throw new Error('Could not save Telegram settings. Try again.');
    return res.json();
  };
  const telegram=async(token:string,method:string,body:Record<string,unknown>={})=>{
    // Never relay Telegram error descriptions: they may contain user content.
    let res;
    try{res=await fetcher(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});}
    catch{throw new Error('Telegram is not responding. Try again shortly.');}
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!data.ok)throw new Error(res.status===401||res.status===404?'Bot token is invalid. Copy it again from BotFather.':'Telegram could not complete this step. Check that the bot is started and try again.');
    return data.result;
  };
  return async(req:Request)=>{
    const origin=req.headers.get('Origin');
    const allowed=origin!==null&&(ORIGINS.has(origin)||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
    const headers={'Access-Control-Allow-Origin':allowed?origin!:SITE,'Access-Control-Allow-Headers':'apikey,authorization,content-type',
      'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store',Vary:'Origin'};
    const json=(data:unknown,status=200)=>Response.json(data,{status,headers});
    if(origin&&!allowed)return json({error:'Origin not allowed.'},403);
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(!['GET','POST'].includes(req.method))return json({error:'Method not allowed.'},405);
    const auth=req.headers.get('Authorization')||'';
    if(!/^Bearer eyJ/.test(auth))return json({error:'Sign in to Claui Admin first.'},401);
    try{
      const user=await fetcher(`${base}/auth/v1/user`,{headers:{apikey:KEY,Authorization:auth},signal:AbortSignal.timeout(6000)});
      if(!user.ok)return json({error:'Your session expired. Sign in again.'},401);
      const check=await fetcher(`${base}/rest/v1/rpc/is_admin`,{method:'POST',headers:{apikey:KEY,Authorization:auth,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(6000)});
      if(!check.ok||await check.json()!==true)return json({error:'Admin access required.'},403);
      if(req.method==='GET')return json(await rpc('status'));
      if(Number(req.headers.get('Content-Length')||0)>2048)return json({error:'Request too large.'},413);
      const raw=await req.text();if(raw.length>2048)return json({error:'Request too large.'},413);
      let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid request.'},400);}
      if(body.action==='prepare'){
        const token=typeof body.token==='string'?body.token.trim():'';
        if(!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token))return json({error:'Paste the bot token from BotFather.'},400);
        const bot=await telegram(token,'getMe');
        const webhook=await telegram(token,'getWebhookInfo');
        if(webhook.url)return json({error:'This bot is already connected to another service. Create a dedicated bot in BotFather.'},409);
        const code=randomCode();await rpc('prepare',{token,username:bot.username,code});
        return json({url:`https://t.me/${bot.username}?start=${code}`,bot_username:bot.username});
      }
      if(body.action==='confirm'){
        const pending=await rpc('pending');
        if(!pending?.token||!pending.code)return json({error:'Setup expired. Paste your bot token again.'},409);
        const updates=await telegram(pending.token,'getUpdates',{offset:-100,limit:100,timeout:0,allowed_updates:['message']});
        const chat=findPairingChat(updates,pending.code);
        if(!chat)return json({error:'Open the Telegram connection link and press Start, then try this button again.'},409);
        // Prove delivery to the exact private chat before enabling notifications.
        await telegram(pending.token,'sendMessage',{chat_id:chat,text:'🖤 Claui Community connected! Votes, game requests, content suggestions and stories will appear here.\nhttps://claui-community.pages.dev/admin',link_preview_options:{is_disabled:true}});
        await rpc('activate',{code:pending.code,chat_id:String(chat)});
        return json(await rpc('status'));
      }
      if(body.action==='test'){
        const config=await rpc('active');
        if(!config?.token||!config.chat_id)return json({error:'Connect Telegram first.'},409);
        await telegram(config.token,'sendMessage',{chat_id:config.chat_id,text:'🖤 Test alert from Claui Community. Your Telegram connection works.'});
        return json({sent:true});
      }
      if(['disable','enable'].includes(body.action)){await rpc(body.action);return json(await rpc('status'));}
      return json({error:'Unknown action.'},400);
    }catch(error){
      // Only return our known messages; no raw fetch/URL errors or credentials.
      const message=error instanceof Error?error.message:'';
      const safe=/^(Could not save Telegram|Telegram |Bot token)/.test(message)?message:'Could not connect right now. Try again.';
      return json({error:safe},502);
    }
  };
}
