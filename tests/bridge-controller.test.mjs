import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {normalizeTikFinityPacket} from '../tikfinity-events.js';
const source=(await readFile(new URL('../bridge.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'');

async function mount({validToken=true}={}){
  let time=Date.now(),id=0,mode='ok';const tasks=new Map(),storage=new Map(),calls=[],sockets=[],received=new Set();
  const elements=Object.fromEntries(['bridge-state','bridge-detail','bridge-pending','bridge-overlay'].map(x=>[x,{textContent:'',addEventListener(){}}]));
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}}
  class Socket{constructor(url){this.url=url;sockets.push(this);}close(){this.onclose?.();}}
  const context={
    URLSearchParams,AbortSignal,WebSocket:Socket,Date:ClockDate,
    location:{hash:validToken?'#token='+'a'.repeat(64):''},
    document:{body:{classList:{add(){}}},getElementById:id=>elements[id]},
    window:{addEventListener(){}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    normalizeTikFinityPacket:packet=>normalizeTikFinityPacket(packet,time),
    setTimeout:(fn,delay)=>{const next=++id;tasks.set(next,{at:time+delay,fn});return next;},clearTimeout:id=>tasks.delete(id),
    fetch:async(_,init)=>{
      const body=JSON.parse(init.body);calls.push(body);
      for(const event of body.events)received.add(event.event_id);
      if(mode==='lost-response'){mode='ok';throw new Error('Response lost after commit');}
      if(mode==='unauthorized')return{ok:false,status:401,json:async()=>({error:'Expired'})};
      return{ok:true,status:200,json:async()=>({ok:true,status:'live',room_id:'7700000000000000001',started_at:new Date(time-3600_000).toISOString()})};
    },
  };
  const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
  vm.runInNewContext(source,context);await flush();
  if(sockets[0]){sockets[0].onopen();await flush();}
  const advance=async milliseconds=>{
    const target=time+milliseconds;
    for(;;){const next=[...tasks].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;tasks.delete(next[0]);next[1].fn();await flush();}
    time=target;await flush();
  };
  const send=(msgId,extra={})=>sockets.at(-1).onmessage({data:JSON.stringify({event:'like',data:{msgId:String(msgId),userId:'7160963417347916802',uniqueId:'viewer',likeCount:1,createTime:Math.floor(time/1000),...extra}})});
  return{calls,sockets,storage,elements,received,send,advance,flush,mode:value=>mode=value};
}
test('public bridge visits never probe localhost without a private key',async()=>{
  const app=await mount({validToken:false});assert.equal(app.sockets.length,0);assert.equal(app.calls.length,0);
});
test('continuous like traffic flushes in batches instead of postponing sync forever',async()=>{
  const app=await mount();const before=app.calls.length;
  for(let i=1;i<=60;i++){app.send(i);await app.advance(100);}
  assert.ok(app.calls.length>=before+2);assert.ok(app.received.size>=39);
  assert.ok(app.calls.filter(x=>x.events.length).every(x=>x.events.length<=100));
  assert.equal(app.calls[0].token,'a'.repeat(64));
  assert.equal(app.sockets[0].url,'ws://localhost:21213/');
});
test('a lost response keeps the outbox and retries the same IDs without extra totals',async()=>{
  const app=await mount();app.mode('lost-response');app.send('one');await app.advance(2100);
  assert.equal(JSON.parse(app.storage.get('claui-tikfinity-outbox-v1')).length,1);
  await app.advance(2100);
  assert.equal(JSON.parse(app.storage.get('claui-tikfinity-outbox-v1')).length,0);
  assert.equal(app.received.size,1);
});
test('expired credentials stop recording and reconnect attempts',async()=>{
  const app=await mount();app.mode('unauthorized');app.send('two');await app.advance(2100);
  assert.match(app.elements['bridge-state'].textContent,/needs updating/);
  const calls=app.calls.length,sockets=app.sockets.length;await app.advance(60000);
  assert.equal(app.calls.length,calls);assert.equal(app.sockets.length,sockets);
});
