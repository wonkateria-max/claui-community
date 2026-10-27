import test from 'node:test';
import assert from 'node:assert/strict';
import {createTelegramHandler,findPairingChat} from '../supabase/functions/telegram-notifications/handler.ts';
const CODE='a'.repeat(32);
const TOKEN='123456789:abcdefghijklmnopqrstuvwxyz123456789';
const privateMessage=(text=`/start ${CODE}`,id=123)=>({message:{text,chat:{id,type:'private'},from:{id,is_bot:false}}});
test('pairing requires the exact secret Start payload in a private chat from its owner',()=>{
  assert.equal(findPairingChat([privateMessage()],CODE),123);
  for(const update of [privateMessage('/start'),privateMessage(`/start ${'b'.repeat(32)}`),
    {message:{...privateMessage().message,chat:{id:123,type:'group'}}},
    {message:{...privateMessage().message,from:{id:456,is_bot:false}}}])assert.equal(findPairingChat([update],CODE),undefined);
});
function harness({admin=true,expired=false,updates=[privateMessage()],webhook='',telegramFailure=false}={}){
  const calls=[];
  const fetcher=async(input,init={})=>{
    const url=new URL(input),body=init.body?JSON.parse(init.body):null;
    calls.push({url,body,headers:init.headers});
    if(url.pathname==='/auth/v1/user')return Response.json({id:'admin-user'},{status:expired?401:200});
    if(url.pathname==='/rest/v1/rpc/is_admin')return Response.json(admin);
    if(url.pathname==='/rest/v1/rpc/telegram_service'){
      const a=body.p_action;
      return Response.json(a==='pending'?{token:TOKEN,code:CODE}:a==='active'?{token:TOKEN,chat_id:'123'}:
        a==='status'?{enabled:true,connected:true,bot_username:'ClauiAlertsBot'}:{});
    }
    if(url.hostname==='api.telegram.org'){
      if(telegramFailure)throw new Error(`failed request ${input}`);
      return Response.json({ok:true,result:url.pathname.endsWith('/getMe')?{username:'ClauiAlertsBot'}:
        url.pathname.endsWith('/getWebhookInfo')?{url:webhook}:url.pathname.endsWith('/getUpdates')?updates:{message_id:1}});
    }
    throw new Error('Unexpected network request');
  };
  const handler=createTelegramHandler({env:n=>n==='SUPABASE_URL'?'https://db.example':n==='SUPABASE_SERVICE_ROLE_KEY'?'eyJ.server-secret':undefined,fetcher,randomCode:()=>CODE});
  const request=(body,extra={})=>handler(new Request('https://edge.example/telegram-notifications',{
    method:body?'POST':'GET',headers:{Origin:'https://claui-community.pages.dev',Authorization:'Bearer eyJ.admin',...extra},
    ...(body?{body:JSON.stringify(body)}:{})}));
  return {calls,handler,request};
}
test('disallowed origins and signed-out requests never reach credentials or Telegram',async()=>{
  const h=harness();
  assert.equal((await h.request(null,{Origin:'https://claui-community.pages.dev.evil.test'})).status,403);
  assert.equal((await h.request(null,{Authorization:''})).status,401);
  assert.equal(h.calls.length,0);
});
test('expired and non-admin sessions cannot configure or send alerts',async()=>{
  for(const options of [{expired:true},{admin:false}]){
    const h=harness(options);const res=await h.request({action:'prepare',token:TOKEN});
    assert.ok([401,403].includes(res.status));assert.equal(h.calls.some(c=>c.url.hostname==='api.telegram.org'||c.url.pathname.endsWith('/telegram_service')),false);
  }
});
test('prepare checks the dedicated bot and returns a pairing link without token',async()=>{
  const h=harness();const res=await h.request({action:'prepare',token:TOKEN});const data=await res.json();
  assert.equal(data.url,`https://t.me/ClauiAlertsBot?start=${CODE}`);
  assert.equal(JSON.stringify(data).includes(TOKEN),false);
  assert.equal(h.calls.find(c=>c.body?.p_action==='prepare').body.p_data.token,TOKEN);
});
test('bots with existing webhooks are not modified or adopted',async()=>{
  const h=harness({webhook:'https://other.example/hook'});
  assert.equal((await h.request({action:'prepare',token:TOKEN})).status,409);
  assert.equal(h.calls.some(c=>c.body?.p_action==='prepare'),false);
});
test('confirm cannot activate an unrelated Telegram chat',async()=>{
  const h=harness({updates:[privateMessage('/start')]});
  assert.equal((await h.request({action:'confirm'})).status,409);
  assert.equal(h.calls.some(c=>c.body?.p_action==='activate'||c.url.pathname.endsWith('/sendMessage')),false);
});
test('confirm proves message delivery before activating and never returns credentials',async()=>{
  const h=harness();const res=await h.request({action:'confirm'});const data=await res.json();
  assert.equal(res.status,200);assert.equal(data.enabled,true);assert.equal(JSON.stringify(data).includes(TOKEN),false);
  const sent=h.calls.findIndex(c=>c.url.pathname.endsWith('/sendMessage'));
  const active=h.calls.findIndex(c=>c.body?.p_action==='activate');assert.ok(sent>=0&&active>sent);
  assert.equal(h.calls[active].body.p_data.chat_id,'123');
});
test('network errors never reveal the bot token or raw Telegram URL',async()=>{
  const h=harness({telegramFailure:true});const res=await h.request({action:'prepare',token:TOKEN});const raw=await res.text();
  assert.equal(res.status,502);assert.equal(raw.includes(TOKEN),false);assert.equal(raw.includes('api.telegram.org'),false);
  assert.equal(h.calls.some(c=>c.body?.p_action==='prepare'),false);
});
