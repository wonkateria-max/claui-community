import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
function mount({fail=false,delay=false}={}) {
  let focused=null,release;
  const calls=[];
  class Element {
    constructor(){this.value='';this.textContent='';this.disabled=false;this.listeners=new Map();this.attrs={};this.classes=new Set();this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};}
    setAttribute(name,value){this.attrs[name]=value;}
    addEventListener(name,fn){this.listeners.set(name,fn);}
    fire(name,event={}){return this.listeners.get(name)?.({preventDefault(){},...event});}
    focus(){focused=this;}
  }
  const ids=new Map(['submission-form','submission-panel','community-kicker','community-title','community-description','primary-label','primary-input','message-label','message-input','message-count','submission-note','success'].map(id=>[id,new Element()]));
  const name=new Element(),tiktok=new Element(),button=new Element();
  const form=ids.get('submission-form');
  const inputs=[ids.get('primary-input'),ids.get('message-input'),name,tiktok];
  form.querySelector=selector=>selector==='input[name="name"]'?name:selector==='input[name="tiktok"]'?tiktok:button;
  form.reset=()=>inputs.forEach(input=>input.value='');
  const tabs=['game','content','story'].map(type=>Object.assign(new Element(),{dataset:{type}}));
  vm.runInNewContext(source,{
    document:{head:{appendChild(){}},createElement:()=>new Element(),querySelector:()=>null,
      querySelectorAll:()=>tabs,getElementById:id=>ids.get(id)||null,addEventListener(){}},
    console:{error(){}},
    fetch:async(url,init)=>{
      calls.push({url,body:JSON.parse(init.body),headers:init.headers});
      if(delay)await new Promise(resolve=>{release=resolve;});
      return {ok:!fail,status:fail?503:201,text:async()=>fail?'Unavailable':''};
    },
  });
  return {ids,tabs,inputs,button,calls,click:type=>tabs.find(t=>t.dataset.type===type).fire('click'),submit:()=>form.fire('submit'),release:()=>release?.(),focused:()=>focused};
}
test('game requests submit as games with optional message, name and TikTok handle',async()=>{
  const page=mount();page.inputs[0].value='  Resident Evil 7  ';
  await page.submit();
  assert.equal(page.calls.length,1);
  assert.ok(page.calls[0].url.endsWith('/rest/v1/community_submissions'));
  assert.deepEqual(page.calls[0].body,{type:'game',title:'Resident Evil 7',message:null,display_name:null,tiktok_username:null});
  assert.match(page.ids.get('success').textContent,/game request/);
  assert.equal(page.button.textContent,'Send game request');
});
test('content and story entries retain their own type, labels and validation',async()=>{
  const page=mount();page.click('content');page.inputs[0].value='Horror challenge night';await page.submit();
  assert.equal(page.calls[0].body.type,'content');
  page.click('story');assert.equal(page.ids.get('message-input').required,true);
  page.inputs[0].value='My story';page.inputs[1].value='   ';await page.submit();assert.equal(page.calls.length,1);
  page.inputs[1].value='  A true late-night story.  ';page.inputs[2].value='  Viewer  ';page.inputs[3].value='  @viewer  ';await page.submit();
  assert.deepEqual(page.calls[1].body,{type:'story',title:'My story',message:'A true late-night story.',display_name:'Viewer',tiktok_username:'@viewer'});
  assert.match(page.ids.get('success').textContent,/story/);
});
test('switching tabs keeps drafts separate and does not clear an unsent story',async()=>{
  const page=mount();page.click('story');page.inputs[0].value='Story draft';page.inputs[1].value='Private draft text';
  page.click('game');assert.equal(page.inputs[0].value,'');assert.equal(page.inputs[1].value,'');
  page.inputs[0].value='Game pick';await page.submit();
  assert.equal(page.calls[0].body.message,null);
  page.click('story');assert.equal(page.inputs[0].value,'Story draft');assert.equal(page.inputs[1].value,'Private draft text');
  page.click('game');assert.equal(page.inputs[0].value,'');
});
test('failed submissions keep the draft and re-enable the form for retry',async()=>{
  const page=mount({fail:true});page.inputs[0].value='Game pick';await page.submit();
  assert.equal(page.inputs[0].value,'Game pick');assert.match(page.ids.get('success').textContent,/Could not send/);
  assert.equal(page.button.disabled,false);assert.equal(page.tabs.every(tab=>!tab.disabled),true);
});
test('in-flight submissions prevent duplicate sends or switching the entry type',async()=>{
  const page=mount({delay:true});page.inputs[0].value='Game pick';const pending=page.submit();
  assert.equal(page.button.disabled,true);assert.equal(page.tabs.every(tab=>tab.disabled),true);
  page.click('story');await page.submit();assert.equal(page.calls.length,1);
  assert.equal(page.ids.get('primary-label').textContent,'Game title');
  page.release();await pending;assert.equal(page.button.disabled,false);
});
test('keyboard tab navigation updates selection, focus and the associated form',()=>{
  const page=mount();page.tabs[0].fire('keydown',{key:'End'});
  assert.equal(page.tabs[2].attrs['aria-selected'],'true');assert.equal(page.tabs[2].tabIndex,0);assert.equal(page.tabs[0].tabIndex,-1);
  assert.equal(page.focused(),page.tabs[2]);assert.equal(page.ids.get('submission-panel').attrs['aria-labelledby'],'submission-tab-story');
  page.tabs[2].fire('keydown',{key:'ArrowRight'});assert.equal(page.tabs[0].attrs['aria-selected'],'true');
});
test('a 30,000-character story is sent intact and its counter resets after success',async()=>{
  const page=mount();page.click('story');
  const story='A long story.\n'.repeat(2308).slice(0,30000);
  page.inputs[0].value='A longer story';page.inputs[1].value=story;
  page.inputs[1].fire('input');
  assert.equal(page.inputs[1].maxLength,30000);
  assert.equal(page.ids.get('message-count').textContent,'30,000 / 30,000 characters');
  await page.submit();
  assert.equal(page.calls.length,1);
  assert.equal(page.calls[0].body.message,story);
  assert.equal(page.ids.get('message-count').textContent,'0 / 30,000 characters');
});
test('long story drafts and their counts survive changing tabs and a failed send',async()=>{
  const page=mount({fail:true});page.click('story');
  const story='Story with a full reaction 😱.\n'.repeat(600);
  page.inputs[0].value='Story draft';page.inputs[1].value=story;
  page.click('game');assert.equal(page.inputs[1].maxLength,5000);
  assert.equal(page.ids.get('message-count').textContent,'0 / 5,000 characters');
  page.click('story');assert.equal(page.inputs[1].value,story);
  assert.equal(page.ids.get('message-count').textContent,`${story.length.toLocaleString('en-US')} / 30,000 characters`);
  await page.submit();
  assert.equal(page.calls[0].body.message,story.trim());
  assert.equal(page.inputs[1].value,story);
});
test('over-limit text is rejected without clearing the draft or sending a request',async()=>{
  for(const [type,limit] of [['story',30000],['game',5000],['content',5000]]){
    const page=mount();page.click(type);page.inputs[0].value='Draft';
    page.inputs[1].value='x'.repeat(limit+1);
    await page.submit();
    assert.equal(page.calls.length,0);
    assert.equal(page.inputs[1].value.length,limit+1);
    assert.match(page.ids.get('success').textContent,/Your draft is still here/);
  }
});
