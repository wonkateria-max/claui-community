import { normalizeTikFinityPacket } from './tikfinity-events.js';

const API = 'https://foficcmsmtfkzcdcmcsc.supabase.co/functions/v1/community-updates/bridge';
const API_KEY = 'sb_publishable_53ofNWMueg05oCmHjUvvpg_rYLdMJq5';
const params = new URLSearchParams(location.hash.slice(1));
const token = params.get('token') || '';
if (params.get('overlay') === '1') document.body.classList.add('overlay');
const stateEl = document.getElementById('bridge-state');
const detailEl = document.getElementById('bridge-detail');
const pendingEl = document.getElementById('bridge-pending');
const storageKey = 'claui-tikfinity-outbox-v1';
let outbox = [];
try {
  const rows = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(rows)) outbox = rows.filter(row => row.event?.event_id && Date.parse(row.event.occurred_at) > Date.now()-86400_000).slice(-4000);
} catch {}
let socket;
let connected = false;
let activeRoom = null;
let lastVerifiedLive = 0;
let busy = false;
let stopped = false;
let reconnectDelay = 1000;
let syncTimer;
let storageWarning = false;

const status = (message, detail) => {
  stateEl.textContent = message;
  if (detail) detailEl.textContent = detail;
  pendingEl.textContent = `${outbox.length} ${outbox.length === 1 ? 'event' : 'events'} waiting to sync${storageWarning ? ' · Keep this page open until synced.' : ''}`;
};
const save = () => {
  try { localStorage.setItem(storageKey, JSON.stringify(outbox)); storageWarning = false; }
  catch { storageWarning = true; }
};

async function sync() {
  clearTimeout(syncTimer);
  if (busy || stopped) return;
  busy = true;
  const room = outbox.find(row=>row.room_id)?.room_id || null;
  const batch = room ? outbox.filter(row=>row.room_id===room).slice(0,100) : [];
  try {
    const response = await fetch(API,{
      method:'POST',headers:{apikey:API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({token,source_connected:connected,room_id:room,events:batch.map(row=>row.event)}),
      signal:AbortSignal.timeout(25000),cache:'no-store',
    });
    const result = await response.json();
    if (response.status === 401) {
      stopped = true; socket?.close();
      status('Private link needs updating','Create a new TikFinity connection link in Claui Admin.');
      return;
    }
    if (!response.ok) {
      if (response.status === 409 && room) {
        // This room was never verified, or its retry window is over. Do not
        // attach those events to a later broadcast or keep retrying forever.
        outbox = outbox.filter(row=>row.room_id!==room); save();
      }
      throw new Error(result.error || 'Sync unavailable');
    }
    if (batch.length) {
      const sent = new Set(batch.map(row=>`${row.room_id}:${row.event.event_id}`));
      outbox = outbox.filter(row=>!sent.has(`${row.room_id}:${row.event.event_id}`));
    }
    if (result.status === 'live' && result.room_id) {activeRoom=result.room_id;lastVerifiedLive=Date.now();}
    else if (result.status === 'offline' || Date.now()-lastVerifiedLive>120000) activeRoom=null;
    const cutoff = result.started_at ? Date.parse(result.started_at)-120_000 : Date.now()-120_000;
    if (activeRoom) {
      outbox.forEach(row=>{if(!row.room_id && Date.parse(row.event.occurred_at)>=cutoff) row.room_id=activeRoom;});
    }
    outbox = outbox.filter(row=>Date.parse(row.event.occurred_at)>Date.now()-86400_000 && (row.room_id || Date.parse(row.event.occurred_at)>Date.now()-120_000));
    save();
    status(connected ? (activeRoom ? 'Recording gifts and likes' : 'Connected · waiting for LIVE') : 'Waiting for TikFinity Desktop',
      connected ? 'Counters sync automatically. Keep this source enabled throughout the stream.' : 'Open TikFinity Desktop on this same computer and connect it to @clawiwawi.');
  } catch {
    status('Waiting to sync','Captured events stay queued and will retry automatically. Keep this source running.');
  } finally {
    busy = false;
    if (!stopped) syncTimer = setTimeout(sync,outbox.some(row=>row.room_id) ? 2000 : 15000);
  }
}

function connect() {
  if (stopped) return;
  try { socket = new WebSocket('ws://localhost:21213/'); }
  catch {
    status('Cannot connect to TikFinity','Open TikFinity Desktop on this computer. If the browser asks for local connection access, allow it for this page.');
    setTimeout(connect,10000); return;
  }
  socket.onopen = () => { connected=true; reconnectDelay=1000; sync(); };
  socket.onmessage = message => {
    try {
      const packet = JSON.parse(message.data);
      const event = normalizeTikFinityPacket(packet);
      if (!event || outbox.some(row=>row.event.event_id===event.event_id && (!row.room_id || row.room_id===activeRoom))) return;
      if (outbox.length>=4000) {
        status('Connection needs attention','The offline queue is full. Restore the internet connection before continuing.');
        return;
      }
      outbox.push({room_id:activeRoom,event}); save();
      pendingEl.textContent = `${outbox.length} events waiting to sync`;
      // Batch bursts rather than sending one network request for every tap.
      if (!busy && outbox.length===1) { clearTimeout(syncTimer); syncTimer=setTimeout(sync,2000); }
    } catch { /* Ignore malformed or unsupported messages, including chat. */ }
  };
  socket.onerror = () => status('Waiting for TikFinity Desktop','Check that TikFinity Desktop is open on this computer and that this source can access the local connection.');
  socket.onclose = () => {
    connected=false;
    if (!stopped) { setTimeout(connect,reconnectDelay); reconnectDelay=Math.min(reconnectDelay*2,10000); }
  };
}

document.getElementById('bridge-overlay').addEventListener('click',()=>document.body.classList.add('overlay'));
window.addEventListener('online',sync);
if (!/^[0-9a-f]{64}$/.test(token)) status('Open your private connection link','Sign in to Claui Admin and create a TikFinity connection link first.');
else { connect(); sync(); }
