const $ = (s)=>document.querySelector(s);
const $$ = (s)=>document.querySelectorAll(s);
const LS_ENTRY = 'entry_csv_url';
const entryCsv = localStorage.getItem(LS_ENTRY);
const LSC_PREFIX = 'readonly_cache_'; // localStorage cache prefix

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
    fastRenderFromLS();
    refreshCurrent('library'); // 抓最新覆蓋
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

function fastRenderFromLS(){
  ['library','work','board'].forEach(tab=>{
    try {
      const raw = localStorage.getItem(LSC_PREFIX+tab);
      cache[tab] = raw ? JSON.parse(raw) : null;
    } catch(_) { cache[tab]=null; }
  });
  switchTab('library', true);
}

async function refreshCurrent(tab){
  await switchTab(tab);
  ['library','work','board'].forEach(t=>{ if(t!==tab) refreshTab(t); });
}

async function refreshTab(tab){
  if(!['library','work','board'].includes(tab)) return;
  try {
    const rows = await fetchCsv((routes[tab]||'') + bust());
    const items = rows.map((r,i)=> normalizeRow(r,i)).filter(x=> (x.標題||x.內容));
    cache[tab] = items;
    localStorage.setItem(LSC_PREFIX+tab, JSON.stringify(items));
    if(tab===currentTab) renderList();
  } catch(e){ console.warn('refreshTab fail', tab, e); }
}

async function switchTab(tab, fast=false){
  if(!['library','work','board'].includes(tab)) return;
  scrollPos[currentTab] = window.scrollY || 0;
  currentTab = tab;
  $$('.tab').forEach(b=> b.classList.toggle('active', b.dataset.tab===tab));
  $('#reader').classList.add('hidden');
  $('#list').classList.remove('hidden');

  if(!cache[tab]) {
    if(fast) renderSkeleton();
    await refreshTab(tab);
  } else {
    renderList();
  }
  setTimeout(()=> window.scrollTo(0, scrollPos[tab]||0), 0);
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

function renderSkeleton(){
  const listEl = $('#list');
  listEl.innerHTML = '';
  for(let i=0;i<6;i++) {
    const d = document.createElement('div');
    d.className = 'skel card';
    listEl.appendChild(d);
  }
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
      <div class="preview">${escapeHtml((it.內容||'').slice(0, 120))}${(it.內容||'').length>120?'…':''}</div>
    `;
    div.addEventListener('click', ()=> openReader(it));
    listEl.appendChild(div);
  }
}

function openReader(it){
  const listEl = $('#list'); const reader = $('#reader');
  listEl.classList.add('hidden');
  reader.classList.remove('hidden');
  const safe = escapeHtml(it.內容||'').replace(/\n/g,'<br>');
  reader.innerHTML = `
    <div class="backbar"><button class="btn secondary" id="backBtn">返回列表</button></div>
    <h1>${escapeHtml(it.標題||'(無標題)')}</h1>
    <div class="meta">${escapeHtml(it.日期||'')}${it.分類? ' · '+escapeHtml(it.分類):''}</div>
    <hr/>
    <div class="content">${safe}</div>
  `;
  $('#backBtn').addEventListener('click', ()=> {
    reader.classList.add('hidden');
    listEl.classList.remove('hidden');
    setTimeout(()=> window.scrollTo(0, scrollPos[currentTab]||0), 0);
  });
}

async function fetchCsv(url){
  const res = await fetch(url, { cache: 'no-store' });
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
    rows.push(obj);
  }
  return rows;
}

function splitCsvLine(line){
  const out = [];
  let cur = '';
  let inq = false;
  for (let i=0; i<line.length; i++){
    const ch = line[i];
    if (ch === '"'){ inq = !inq; cur += ch; continue; }
    if (ch === ',' && !inq){ out.push(cur); cur=''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(s=>{
    s = s.trim();
    if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1,-1).replace(/""/g,'"');
    return s;
  });
}

function escapeHtml(s){
  return (s||'').replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
}

function registerSW(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
}
