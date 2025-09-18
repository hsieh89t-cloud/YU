
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>document.querySelectorAll(s);
const LS_ENTRY = 'entry_csv_url';
const entryCsv = localStorage.getItem(LS_ENTRY) || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQYpmaztvrq3vdo8VeDhyP1yUYtEWjHeZyN9cN-0rg2PvqjdLfLnCQffKWUhja6aXo3OXcSmNoffPxR/pub?gid=0&single=true&output=csv';
let routes = {};
let cache = {};
let currentTab = 'library';
let query = '';
let scrollPos = { library: 0, work: 0, board: 0 };

const bust = ()=>'&_v='+Date.now();

window.addEventListener('load', async () => {
  registerSW();
  bindUI();
  try {
    await loadRoutes();
    await switchTab('library');
  } catch (e) {
    renderError('入口表讀取失敗，請檢查總入口.csv 是否公開。');
    console.error(e);
  }
});

function bindUI(){
  $$('.tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  $('#q').addEventListener('input', e=> { query = (e.target.value||'').trim().toLowerCase(); renderList(); });
}

async function loadRoutes(){
  const rows = await fetchCsv(entryCsv + bust());
  routes = {}
  rows.forEach(r=>{
    const k = (r.key||'').trim(); const url = (r.csvUrl||'').trim();
    if(k && url) routes[k]=url;
  });
  ['library','work','board'].forEach(k=>{ if(!routes[k]) routes[k]=''; });
}

async function switchTab(tab){
  if(!['library','work','board'].includes(tab)) return;
  scrollPos[currentTab] = window.scrollY || 0;
  currentTab = tab;
  $$('.tab').forEach(b=> b.classList.toggle('active', b.dataset.tab===tab));
  $('#reader').classList.add('hidden');
  $('#list').classList.remove('hidden');

  if(!cache[tab]) {
    try {
      cache[tab] = await loadItems(tab);
    } catch(e) {
      cache[tab] = [];
      console.error(e);
    }
  }
  renderList();
  setTimeout(()=> window.scrollTo(0, scrollPos[tab]||0), 0);
}

async function loadItems(tab){
  const url = routes[tab];
  if(!url) return [];
  const rows = await fetchCsv(url + bust());
  return rows.map((r,i)=> normalizeRow(r,i)).filter(x=> (x.標題||x.內容));
}

function normalizeRow(r, i){
  const item = {
    日期: (r['日期']||'').trim(),
    分類: (r['分類']||'').trim(),
    標題: (r['標題']||'').trim(),
    內容: (r['內容']||'').trim(),
  };
  if(!item.分類) {
    const m = item.內容.match(/#([\p{L}\p{N}_]+)/u);
    if(m) item.分類 = m[1];
  }
  if(!item.標題) {
    const first = item.內容.split(/\r?\n/).find(x=>x.trim());
    if(first) item.標題 = first.replace(/^([主題標題]\s*[:：]\s*)/,'').slice(0,60);
  }
  item.id = (item.日期||'') + '-' + i;
  return item;
}

function renderError(msg){
  $('#list').innerHTML = `<div class="item"><div class="meta">🚫 ${msg}</div></div>`;
}

function renderList(){
  const listEl = $('#list');
  const reader = $('#reader');
  reader.classList.add('hidden');
  listEl.classList.remove('hidden');
  const all = (cache[currentTab]||[]);
  const items = !query ? all : all.filter(it => {
    const t = (it.標題||'').toLowerCase();
    const c = (it.內容||'').toLowerCase();
    const g = (it.分類||'').toLowerCase();
    return t.includes(query) || c.includes(query) || g.includes(query);
  });

  if(items.length===0){
    listEl.innerHTML = `<div class="item"><div class="meta">目前沒有內容或搜尋不到。</div></div>`;
    return;
  }

  const MAX = 300;
  const view = items.slice(0, MAX);
  listEl.innerHTML = '';
  for(const it of view){
    const div = document.createElement('div'); div.className='item';
    div.innerHTML = `
      <h3>${escapeHtml(it.標題||'(無標題)')}</h3>
      <div class="meta">${escapeHtml(it.日期||'')}${it.分類? ' · '+escapeHtml(it.分類):''}</div>
      <div class="preview">${escapeHtml((it.內容||'').slice(0, 120))}{(it.內容||'').length>120?'…':''}</div>
    `;
    div.addEventListener('click', ()=> openReader(it));
    listEl.appendChild(div);
  }
}

function openReader(it){
  const listEl = $('#list'); const reader = $('#reader');
  listEl.classList.add('hidden');
  reader.classList.remove('hidden');
  reader.innerHTML = `
    <div class="backbar"><button class="btn secondary" id="backBtn">返回列表</button></div>
    <h1>${escapeHtml(it.標題||'(無標題)')}</h1>
    <div class="meta">${escapeHtml(it.日期||'')}${it.分類? ' · '+escapeHtml(it.分類):''}</div>
    <div class="content">${escapeHtml(it.內容||'').replace(/\n/g,'<br>')}</div>
  `;
  $('#backBtn').addEventListener('click', ()=> {
    reader.classList.add('hidden');
    listEl.classList.remove('hidden');
    setTimeout(()=> window.scrollTo(0, scrollPos[currentTab]||0), 0);
  });
}

async function fetchCsv(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error('CSV 無法讀取：'+res.status);
  const txt = await res.text();
  const lines = txt.replace(/\r/g,'').split('\n');
  if(lines.length===0) return [];
  const headers = splitCsvLine(lines.shift());
  const rows = [];
  for(const line of lines){
    if(!line.trim()) continue;
    const cells = splitCsvLine(line);
    const obj={};
    headers.forEach((h,i)=> obj[h]=cells[i]||'');
    rows.append = null
    rows.push(obj);
  }
  return rows;
}

function splitCsvLine(line){
  const re = /(\"[^\"]*(?:\"\"[^\"]*)\"|[^,]*)(?:,|$)/g;
  const out = [];
  let m;
  let i = 0;
  // Fallback simpler parser if regex breaks
  const parts = [];
  let cur = ''; let inq = false;
  for(let ch of line){
    if(ch === '"'){ inq = !inq; cur += ch; continue; }
    if(ch === ',' && !inq){ parts.append = null; parts.push(cur); cur=''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts.map(s=>{
    s = s.trim();
    if(s.startsWith('"') && s.endsWith('"')) s = s.slice(1,-1).replace(/""/g,'"');
    return s;
  });
}

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'})[m]);
}

function registerSW(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
}
