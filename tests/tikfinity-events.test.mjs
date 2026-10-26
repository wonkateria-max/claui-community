import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTikFinityPacket, safeImage } from '../tikfinity-events.js';
import { validateEvent,videoIdFromUrl,resolveVideoId,decodeCover,sha256,createCommunityHandler } from '../supabase/functions/community-updates/handler.ts';

const NOW=Date.now();
const user={msgId:'770000000000000001',userId:'7160963417347916802',uniqueId:'viewer',nickname:'Viewer',profilePictureUrl:'https://p16.tiktokcdn.com/avatar.jpg',createTime:Math.floor(NOW/1000)};
const gift=(overrides={})=>({event:'gift',data:{...user,giftType:1,giftId:5655,groupId:'770000000000000005',diamondCount:1,repeatCount:5,repeatEnd:true,...overrides}});

test('streak counters only include the final cumulative gift amount',()=>{
  assert.equal(normalizeTikFinityPacket(gift({repeatEnd:false}),NOW),null);
  const event=normalizeTikFinityPacket(gift(),NOW);
  assert.equal(event.count,5);assert.equal(event.coins,5);
  assert.equal(event.event_id,normalizeTikFinityPacket(gift({msgId:'different-final-message'}),NOW).event_id);
  assert.equal(normalizeTikFinityPacket(gift({giftType:0,repeatCount:1,repeatEnd:false,diamondCount:99}),NOW).coins,99);
});
test('likes use the event increment instead of the running stream total',()=>{
  const event=normalizeTikFinityPacket({event:'like',data:{...user,likeCount:24,totalLikeCount:50000}},NOW);
  assert.equal(event.count,24);assert.equal(event.total_likes,50000);assert.equal(event.coins,0);
});
test('64-bit user/message IDs survive without floating-point rounding',()=>{
  const n=7160963417347916802n;
  const long={low:Number(n&0xffffffffn)|0,high:Number(n>>32n),unsigned:true};
  const event=normalizeTikFinityPacket({event:'like',data:{...user,userId:long,msgId:long,likeCount:1}},NOW);
  assert.equal(event.viewer_id,n.toString());assert.equal(event.event_id,`like:${n}`);
});
test('chat, demo events, missing identifiers, stale messages and invalid costs are ignored',()=>{
  for(const packet of [
    {event:'chat',data:{...user,comment:'Private conversation'}},gift({isTest:true}),gift({msgId:undefined}),gift({diamondCount:undefined}),
    gift({createTime:Math.floor((NOW-2*86400_000)/1000)}),gift({repeatCount:-1}),gift({giftType:undefined,repeatEnd:false}),
  ])assert.equal(normalizeTikFinityPacket(packet,NOW),null);
  const event=normalizeTikFinityPacket(gift({email:'private@example.com',comment:'Ignore this',sessionid:'secret'}),NOW);
  assert.equal('email' in event,false);assert.equal('comment' in event,false);assert.equal('sessionid' in event,false);
});
test('image URLs reject scripts, arbitrary tracking hosts and credentialed URLs',()=>{
  assert.ok(safeImage('https://p16.tiktokcdn.com/photo.webp'));
  for(const url of ['javascript:alert(1)','https://evil.example/a.jpg','https://tiktokcdn.com.evil.example/a','https://user:password@p16.tiktokcdn.com/a'])assert.equal(safeImage(url),null);
});
test('the backend independently validates untrusted counters and timestamps',()=>{
  const event=normalizeTikFinityPacket(gift(),NOW);
  assert.ok(validateEvent(event,NOW));
  for(const change of [{count:0},{coins:-1},{viewer_id:'<script>'},{kind:'chat'},{occurred_at:'bad date'},{event_id:'like:123'}])assert.equal(validateEvent({...event,...change},NOW),null);
});
test('canonical links accept only this creator and safe TikTok hosts',()=>{
  assert.equal(videoIdFromUrl('https://www.tiktok.com/@clawiwawi/video/7698410001156623636?lang=en'),'7698410001156623636');
  for(const url of ['https://www.tiktok.com/@someone/video/7698410001156623636','https://www.tiktok.com.evil.example/@clawiwawi/video/7698410001156623636','http://localhost/video/7698410001156623636','https://user:password@www.tiktok.com/@clawiwawi/video/7698410001156623636'])assert.throws(()=>videoIdFromUrl(url));
});
test('short links never follow a redirect to an unrelated or private host',async()=>{
  let calls=0;
  assert.equal(await resolveVideoId('https://vt.tiktok.com/abc/',async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://www.tiktok.com/@clawiwawi/video/7698410001156623636'}});}), '7698410001156623636');
  assert.equal(calls,1);
  calls=0;
  await assert.rejects(resolveVideoId('https://vt.tiktok.com/abc/',async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://127.0.0.1/admin'}});}));
  assert.equal(calls,1);
});
test('covers verify file signatures and never accept SVG or arbitrary base64',()=>{
  assert.equal(decodeCover('data:image/png;base64,iVBORw0KGgo=').type,'image/png');
  for(const data of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,aGVsbG8=','https://example.com/a.png'])assert.throws(()=>decodeCover(data));
});

function backend({validAdmin=false,bridgeToken='a'.repeat(64),broadcast={status:'offline',room_id:null},recap={stream:null,gifters:[],likers:[]}}={}) {
  const calls=[];
  let hash;
  const ready=sha256(bridgeToken).then(value=>hash=value);
  const handler=createCommunityHandler({env:name=>({SUPABASE_URL:'https://db.example',SUPABASE_SERVICE_ROLE_KEY:'test-service-key'})[name],now:()=>NOW,fetcher:async(url,init={})=>{
    await ready;calls.push({url:String(url),init});
    const parsed=new URL(url);
    if(parsed.pathname==='/auth/v1/user')return Response.json(validAdmin?{id:'admin-uuid'}:{},{status:validAdmin?200:401});
    if(parsed.pathname.endsWith('/is_admin'))return Response.json(validAdmin);
    if(parsed.pathname.endsWith('/get_community_live_recap'))return Response.json(recap);
    if(parsed.pathname.endsWith('/tiktok-live-status'))return Response.json(broadcast);
    if(parsed.pathname.endsWith('/community_bridge_keys')) {
      if(init.method==='PATCH')return Response.json([]);
      return Response.json(parsed.searchParams.get('token_hash')===`eq.${hash}`?[{id:'key-uuid'}]:[]);
    }
    if(parsed.pathname.endsWith('/record_community_live_events'))return Response.json((JSON.parse(init.body).p_events||[]).length);
    if(parsed.pathname.endsWith('/community_live_sessions'))return Response.json([{room_id:'770000000000000001'}]);
    return Response.json([]);
  }});
  const request=(action='',body,headers={})=>handler(new Request(`https://db.example/functions/v1/community-updates${action?'/'+action:''}`,{
    method:body?'POST':'GET',headers:{Origin:'https://wonkateria-max.github.io',...headers},...(body?{body:JSON.stringify(body)}:{}),
  }));
  return{calls,request,bridgeToken};
}
test('public summaries do not expose source keys or require admin sign-in',async()=>{
  const h=backend();const response=await h.request();assert.equal(response.status,200);
  assert.deepEqual((await response.json()).recap,{stream:null,gifters:[],likers:[]});
  assert.equal(h.calls.some(x=>x.url.includes('community_bridge_keys')),false);
});
test('admin and key creation reject anonymous and forged admin requests',async()=>{
  const h=backend();
  assert.equal((await h.request('admin')).status,401);
  assert.equal((await h.request('pair',{admin:true})).status,401);
  assert.equal((await h.request('pair',{}, {Authorization:'Bearer eyJforged'})).status,401);
  assert.equal(h.calls.some(x=>x.url.includes('rotate_community_bridge_key')),false);
});
test('ingestion rejects absent/invalid source keys and cannot mint admin credentials',async()=>{
  const h=backend();
  assert.equal((await h.request('bridge',{events:[]})).status,401);
  assert.equal((await h.request('bridge',{token:'b'.repeat(64),events:[]})).status,401);
  assert.equal((await h.request('pair',{token:h.bridgeToken})).status,401);
});
test('valid offline heartbeats keep the source connected without inventing a LIVE session',async()=>{
  const h=backend();const response=await h.request('bridge',{token:h.bridgeToken,source_connected:true,events:[]});
  assert.equal(response.status,200);assert.equal((await response.json()).room_id,null);
  assert.equal(h.calls.some(x=>x.url.includes('record_community_live_events')),false);
});
test('a verified LIVE starts its room and buffered retries use the same session',async()=>{
  const room='770000000000000001';const h=backend({broadcast:{status:'live',room_id:room,started_at:new Date(NOW-10000).toISOString()}});
  const event=normalizeTikFinityPacket(gift(),NOW);
  const response=await h.request('bridge',{token:h.bridgeToken,source_connected:true,room_id:room,events:[event]});
  assert.equal(response.status,200);assert.equal((await response.json()).accepted,1);
  const records=h.calls.filter(x=>x.url.includes('record_community_live_events')).map(x=>JSON.parse(x.init.body));
  assert.equal(records.length,2);assert.equal(records[0].p_events.length,0);assert.equal(records[1].p_events[0].coins,5);
});
