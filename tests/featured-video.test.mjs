import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../community-highlights.js',import.meta.url),'utf8');
async function mount() {
  const created=[];
  const events=new Map();
  let focused=null;
  class Element {
    constructor(tag='div') {this.tag=tag;this.children=[];this.listeners=new Map();this.style={overflow:''};this.hidden=false;this.isConnected=true;this.contentWindow={};created.push(this);}
    append(...nodes) {this.children.push(...nodes);}
    replaceChildren(...nodes) {this.children=nodes;}
    setAttribute(key,value) {this[key]=value;}
    addEventListener(name,fn) {this.listeners.set(name,fn);}
    fire(name,event={}) {this.listeners.get(name)?.({target:this,currentTarget:this,...event});}
    showModal() {this.open=true;}
    close() {this.open=false;this.fire('close');}
    focus() {focused=this;}
    querySelector(tag) {for(const child of this.children){if(child.tag===tag)return child;const match=child.querySelector?.(tag);if(match)return match;}return null;}
  }
  const ids=new Map();
  const document={body:new Element('body'),hidden:false,createElement:tag=>new Element(tag),getElementById:id=>{if(!ids.has(id))ids.set(id,new Element());return ids.get(id);},addEventListener:(name,fn)=>events.set('document:'+name,fn)};
  vm.runInNewContext(source,{
    document,window:{addEventListener:(name,fn)=>events.set(name,fn)},Intl,Date,AbortSignal,
    setTimeout:()=>1,clearTimeout:()=>{},
    fetch:async()=>({ok:true,json:async()=>({recap:null,videos:[
      {video_id:'7698410001156623636',title:'Saved clip'},
      {video_id:'7681729305855921429',title:'Another clip'},
      {video_id:'https://untrusted.example/video',title:'Invalid source'},
    ]})}),
  });
  for(let i=0;i<20;i++)await Promise.resolve();
  const dialog=created.find(el=>el.className==='clip-dialog');
  const stage=created.find(el=>el.className==='clip-dialog-stage');
  const note=created.find(el=>el.className==='clip-dialog-note');
  const buttons=()=>ids.get('latest-content-grid').children.map(card=>card.children[0]);
  return {document,dialog,stage,note,buttons,focused:()=>focused,message:value=>events.get('message')(value)};
}

test('no TikTok player loads until a visitor selects a valid clip; closing unloads it',async()=>{
  const page=await mount();
  assert.equal(page.buttons().length,2);
  assert.equal(page.stage.children.length,0);
  page.buttons()[0].fire('click');
  assert.equal(page.dialog.open,true);
  assert.equal(page.stage.children.length,1);
  assert.match(page.stage.children[0].src,/^https:\/\/www\.tiktok\.com\/player\/v1\/7698410001156623636\?/);
  page.dialog.close();
  assert.equal(page.stage.children.length,0);
  page.buttons()[1].fire('click');
  assert.equal(page.stage.children.length,1);
  assert.match(page.stage.children[0].src,/7681729305855921429/);
});

test('player messages only affect the dialog when both the origin and frame match',async()=>{
  const page=await mount();page.buttons()[0].fire('click');
  const source=page.stage.children[0].contentWindow;
  const data={'x-tiktok-player':true,type:'onPlayerError',value:{errorCode:3001}};
  page.message({origin:'https://untrusted.example',source,data});
  page.message({origin:'https://www.tiktok.com',source:{},data});
  assert.equal(page.note.hidden,true);
  page.message({origin:'https://www.tiktok.com',source,data});
  assert.equal(page.note.hidden,false);
  assert.match(page.note.textContent,/TikTok link/);
  page.message({origin:'https://www.tiktok.com',source,data:{'x-tiktok-player':true,type:'onPlayerReady'}});
  assert.equal(page.note.hidden,true);
});

test('closing restores page scrolling and keyboard focus, and ignores late player events',async()=>{
  const page=await mount();page.document.body.style.overflow='auto';
  const trigger=page.buttons()[0];trigger.fire('click');
  const source=page.stage.children[0].contentWindow;
  assert.equal(page.document.body.style.overflow,'hidden');
  page.dialog.close();
  assert.equal(page.document.body.style.overflow,'auto');
  assert.equal(page.focused(),trigger);
  page.message({origin:'https://www.tiktok.com',source,data:{'x-tiktok-player':true,type:'onPlayerError',value:3001}});
  assert.equal(page.note.hidden,true);
});
