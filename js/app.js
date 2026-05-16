// Trip planner — load /content/trip-data.json via HTTP (use a static server, not file://).

let APP_VERSION;
let VERSIONS;
let DAYS_TAS1, DAYS_TAS2, DAYS_MELB;
let STAYS, CHECKLIST, CL_META, COSTS, TIPS;

const TRIP_DATA_URL = new URL('../content/trip-data.json', import.meta.url);
const PDF_CSS_URL = new URL('../styles/pdf-export.css', import.meta.url);

async function loadTripData() {
  const res = await fetch(TRIP_DATA_URL);
  if (!res.ok) throw new Error(`trip-data.json HTTP ${res.status}`);
  const d = await res.json();
  APP_VERSION = d.appVersion;
  VERSIONS = d.versions;
  DAYS_TAS1 = d.itinerary.tas1;
  DAYS_TAS2 = d.itinerary.tas2;
  DAYS_MELB = d.itinerary.melb;
  STAYS = d.stays;
  CHECKLIST = d.checklist;
  CL_META = d.clMeta;
  COSTS = d.costs;
  TIPS = d.tips;
}

// ═══════════════════════════════════════
// STATE
// ═══════════════════════════════════════
let isEditing = false;
let pendingRollbackIndex = -1;
let pieChart = null, barChart = null;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem('tripHistory') || '[]'); } catch { return []; }
}
function saveHistory(h) {
  localStorage.setItem('tripHistory', JSON.stringify(h));
}

// ═══════════════════════════════════════
// RENDER
// ═══════════════════════════════════════
function renderDays(days, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = days.map(d => `
    <div class="day-card" id="card-${d.id}" data-card-id="${d.id}">
      <button class="del-btn" onclick="deleteCard('card-${d.id}')">×</button>
      <div class="day-header" onclick="toggleDay('card-${d.id}')">
        <div class="day-num"><span class="day-weekday">${d.day}</span><span class="day-date">${d.date}</span><span class="day-sequence">Day ${parseInt(d.num, 10)}</span></div>
        <div class="day-info">
          <div>
            <div class="day-title-text" data-key="${d.id}-title" data-label="Day ${d.num} title">${d.title}</div>
            <div class="day-meta"><span data-key="${d.id}-meta" data-label="Day ${d.num} route/distance">${d.meta}</span></div>
          </div>
          <div class="day-toggle">⌄</div>
        </div>
      </div>
      <div class="day-content">
        <img class="day-img" src="${d.img}" alt="${d.imgAlt}" onerror="this.style.display='none'">
        ${d.timeline ? `<div class="day-timeline-wrap"><div class="day-timeline">${d.timeline.map(t=>`<div class="tl-stop"><div class="tl-stop-time">${t.time}</div><div class="tl-stop-dot"></div><div class="tl-stop-icon">${t.icon}</div><div class="tl-stop-label">${t.label}</div></div>`).join('')}</div></div>` : ''}
        <p style="font-size:14px;line-height:1.75;color:var(--text-sec);letter-spacing:0.01em;margin-top:14px" data-key="${d.id}-desc" data-label="Day ${d.num} description">${d.desc}</p>
        <ul class="act-list">
          ${d.activities.map((a,i) => `
          <li class="act-item">
            <div class="act-icon">${a.icon}</div>
            <div>
              <div class="act-name" data-key="${d.id}-act${i}-name" data-label="Day ${d.num} activity ${i+1} name">${a.name}</div>
              <div class="act-desc" data-key="${d.id}-act${i}-desc" data-label="Day ${d.num} activity ${i+1} description">${a.desc}</div>
              ${a.cost ? `<div class="act-cost" data-key="${d.id}-act${i}-cost" data-label="Day ${d.num} activity ${i+1} cost">💰 ${a.cost}</div>` : ''}
            </div>
          </li>`).join('')}
        </ul>
      </div>
    </div>`).join('');
}

function renderStays() {
  document.getElementById('stay-list').innerHTML = STAYS.map(s => `
    <div class="stay-card" id="card-stay-${s.id}" data-card-id="stay-${s.id}">
      <button class="del-btn" onclick="deleteCard('card-stay-${s.id}')">×</button>
      <img class="stay-img" src="${s.img}" alt="${s.name}" onerror="this.style.display='none'">
      <div class="stay-body">
        <div class="stay-name" data-key="stay-${s.id}-name" data-label="${s.name} stay name">${s.name}</div>
        <div class="stay-loc">📍 <span data-key="stay-${s.id}-loc" data-label="${s.name} location">${s.loc}</span></div>
        <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-sec);margin-bottom:8px">${s.nights}</div>
        <div style="font-size:13px;color:var(--text-sec);margin-bottom:12px">
          <strong>Best Airbnb areas:</strong> <span data-key="stay-${s.id}-areas" data-label="${s.name} recommended areas">${s.areas.join(' · ')}</span>
        </div>
        <div class="stay-pills">${s.pills.map(p=>`<div class="stay-pill">${p}</div>`).join('')}</div>
        <div class="stay-price-row">
          <div class="stay-price">$<span data-key="stay-${s.id}-min" data-label="${s.name} min nightly price" data-cost-id="stay-${s.id}-min">${s.minPrice}</span>–<span data-key="stay-${s.id}-max" data-label="${s.name} max nightly price" data-cost-id="stay-${s.id}-max">${s.maxPrice}</span></div>
          <div class="stay-price-note">/night (whole house)</div>
        </div>
        <p class="stay-tip" data-key="stay-${s.id}-tip" data-label="${s.name} tip">💡 ${s.tip}</p>
      </div>
    </div>`).join('');
}

function renderCostTable() {
  const tbody = document.getElementById('cost-table-body');
  let lastCat = '';
  tbody.innerHTML = COSTS.map((c,i) => {
    const catCell = c.cat !== lastCat ? `<td class="cost-cat" rowspan="${COSTS.filter(x=>x.cat===c.cat).length}">${c.cat}</td>` : '';
    if(c.cat !== lastCat) lastCat = c.cat;
    return `<tr>
      ${catCell}
      <td data-key="cost-${i}-item" data-label="${c.item} cost item">${c.item}</td>
      <td class="cost-amt">$<span data-key="cost-${i}-total" data-label="${c.item} total cost" data-chart-update="1">${c.total.toLocaleString()}</span></td>
      <td class="cost-amt" style="color:var(--blue)">$<span data-key="cost-${i}-pp" data-label="${c.item} per person" data-chart-update="1">${c.pp}</span></td>
      <td style="font-size:12px;color:var(--text-sec)" data-key="cost-${i}-note" data-label="${c.item} notes">${c.note}</td>
    </tr>`;
  }).join('');
}

function renderChecklist() {
  const state = loadChecklistState();
  const container = document.getElementById('checklist-container');
  if (!container) return;
  const groups = getChecklistGroups();
  container.innerHTML = groups.map(g => {
    const total = g.items.length;
    const done  = g.items.filter(it => state[it.id]).length;
    return `<div class="cl-group">
      <div class="cl-group-hdr" style="background:${g.color}">
        <div class="cl-group-hdr-text">
          <div class="cl-group-title">${g.label}</div>
          <div class="cl-group-sub">${g.sub}</div>
        </div>
        <div class="cl-group-badge">${done}/${total}</div>
      </div>
      <div class="cl-items">
        ${g.items.map(it => {
          const checked = !!state[it.id];
          return `<div class="cl-item${checked?' done':''}" id="clitem-${it.id}">
            <label class="cl-row">
              <div class="cl-checkbox-wrap"><input type="checkbox" class="cl-check" data-id="${it.id}" onchange="toggleChecklistItem(this)" ${checked?'checked':''}></div>
              <div class="cl-icon">${it.icon}</div>
              <div class="cl-content">
                <div class="cl-title">${it.title}</div>
                <div class="cl-dates">${it.dates}</div>
                <div class="cl-detail">${it.detail}</div>
                <div class="cl-meta">
                  <span class="cl-est">💰 ${it.est}</span>
                  <span class="cl-where">🔗 ${it.where}</span>
                </div>
              </div>
            </label>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
  updateChecklistProgress();
}

function toggleChecklistItem(cb) {
  const state = loadChecklistState();
  state[cb.dataset.id] = cb.checked;
  localStorage.setItem('checklistState', JSON.stringify(state));
  const scrollY = window.scrollY;
  renderChecklist();
  window.scrollTo(0, scrollY);
}

function updateChecklistProgress() {
  const state = loadChecklistState();
  const allItems = CHECKLIST.flatMap(g => g.items);
  const total = allItems.length;
  const done  = allItems.filter(it => state[it.id]).length;
  const pct   = total ? Math.round((done/total)*100) : 0;
  const fill  = document.getElementById('cl-progress-fill');
  const label = document.getElementById('cl-progress-label');
  if (fill)  fill.style.width = pct + '%';
  if (label) label.textContent = done + ' of ' + total + ' items booked (' + pct + '%)';
}

function loadChecklistState() {
  try { return JSON.parse(localStorage.getItem('checklistState') || '{}'); } catch { return {}; }
}

function resetChecklist() {
  document.getElementById('checklistResetModal').classList.add('open');
}
function doResetChecklist() {
  localStorage.removeItem('checklistState');
  renderChecklist();
}

function showAlert(msg, title) {
  document.getElementById('alertModalTitle').textContent = title || 'Notice';
  document.getElementById('alertModalMsg').textContent = msg;
  document.getElementById('alertModal').classList.add('open');
}

function renderTips() {
  document.getElementById('tips-grid').innerHTML = TIPS.map((t,ti) => `
    <div class="tip-card" id="card-tip-${ti}" data-card-id="tip-${ti}">
      <button class="del-btn" onclick="deleteCard('card-tip-${ti}')">×</button>
      <div class="tip-icon">${t.icon}</div>
      <div class="tip-title" data-key="tip-${ti}-title" data-label="${t.title} tip card title">${t.title}</div>
      <ul class="tip-list">${t.items.map((item,ii)=>`<li data-key="tip-${ti}-item${ii}" data-label="${t.title} tip ${ii+1}">${item}</li>`).join('')}</ul>
    </div>`).join('');
}

// ═══════════════════════════════════════
// CHARTS
// ═══════════════════════════════════════
function getCostsByCategory() {
  const cats = {};
  COSTS.forEach((c,i) => {
    const el = document.querySelector(`[data-key="cost-${i}-pp"]`);
    const val = el ? parseFloat(el.textContent.replace(/[^0-9.]/g,'')) || 0 : c.pp;
    cats[c.cat] = (cats[c.cat] || 0) + val;
  });
  return cats;
}

function getTotalPP() {
  const cats = getCostsByCategory();
  return Object.values(cats).reduce((a,b) => a+b, 0);
}

function initCharts() {
  const cats = getCostsByCategory();
  const labels = Object.keys(cats);
  const values = Object.values(cats);
  const colors = ['#0071e3','#34c759','#ff9500','#ff3b30','#bf5af2','#30d158','#ffd60a'];

  if(pieChart) pieChart.destroy();
  if(barChart) barChart.destroy();

  const pie = document.getElementById('pieChart');
  const bar = document.getElementById('barChart');
  if(!pie || !bar) return;

  pieChart = new Chart(pie, {
    type:'doughnut',
    data:{labels,datasets:[{data:values,backgroundColor:colors,borderWidth:0,hoverOffset:8}]},
    options:{responsive:true,cutout:'60%',plugins:{legend:{position:'right',labels:{font:{family:'-apple-system,BlinkMacSystemFont,sans-serif',size:12},padding:16}},tooltip:{callbacks:{label:ctx=>`${ctx.label}: $${ctx.parsed.toFixed(0)} pp`}}}}
  });

  barChart = new Chart(bar, {
    type:'bar',
    data:{labels,datasets:[{label:'Per person (AUD)',data:values,backgroundColor:colors,borderRadius:6,borderSkipped:false}]},
    options:{responsive:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`$${ctx.parsed.y.toFixed(0)} pp`}}},scales:{y:{beginAtZero:true,grid:{color:'rgba(0,0,0,0.05)'},ticks:{callback:v=>'$'+v}},x:{grid:{display:false}}}}
  });
}

function updateCharts() {
  const cats = getCostsByCategory();
  const labels = Object.keys(cats);
  const values = Object.values(cats);
  if(pieChart){pieChart.data.labels=labels;pieChart.data.datasets[0].data=values;pieChart.update();}
  if(barChart){barChart.data.labels=labels;barChart.data.datasets[0].data=values;barChart.update();}
  const total = getTotalPP();
  const totalEl = document.getElementById('total-pp');
  const groupEl = document.getElementById('total-group');
  if(totalEl) totalEl.textContent = '~$' + Math.round(total).toLocaleString();
  if(groupEl) groupEl.textContent = '~$' + Math.round(total*4).toLocaleString();
}

// ═══════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════
function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  if(page) page.classList.add('active');
  if(btn) btn.classList.add('active');
  else {
    const btns = document.querySelectorAll('.nav-item');
    btns.forEach(b => { if(b.getAttribute('onclick') && b.getAttribute('onclick').includes("'"+id+"'")) b.classList.add('active'); });
  }
  window.scrollTo(0,0);
  closeMobileMenu();
  if(id === 'budget') setTimeout(initCharts, 100);
  if(id === 'overview' && window._mapTas) setTimeout(() => window._mapTas.invalidateSize(), 50);
  if(id === 'melb' && window._mapMelb) setTimeout(() => window._mapMelb.invalidateSize(), 50);
}

function toggleMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  const isOpen = sidebar.classList.contains('drawer-open');
  if (isOpen) { closeMobileMenu(); } else {
    sidebar.classList.add('drawer-open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  if (sidebar) sidebar.classList.remove('drawer-open');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
}

function toggleDay(cardId) {
  if(isEditing) return;
  document.getElementById(cardId).classList.toggle('open');
}

// ═══════════════════════════════════════
// EDIT MODE
// ═══════════════════════════════════════
function captureSnapshot() {
  const s = { _deletedCards: [] };
  document.querySelectorAll('[data-key]').forEach(el => {
    s[el.dataset.key] = el.innerHTML;
  });
  document.querySelectorAll('.card-hidden').forEach(el => {
    s._deletedCards.push(el.dataset.cardId);
  });
  return s;
}

function applySnapshot(s) {
  document.querySelectorAll('[data-key]').forEach(el => {
    if(s[el.dataset.key] !== undefined) el.innerHTML = s[el.dataset.key];
  });
  // restore deleted cards
  document.querySelectorAll('[data-card-id]').forEach(el => {
    el.classList.remove('card-hidden');
  });
  if(s._deletedCards) {
    s._deletedCards.forEach(id => {
      const el = document.querySelector(`[data-card-id="${id}"]`);
      if(el) el.classList.add('card-hidden');
    });
  }
  updateCharts();
}

function toggleEdit() {
  if(!isEditing) {
    isEditing = true;
    document.body.classList.add('editing');
    document.querySelectorAll('[data-key]').forEach(el => {
      el.contentEditable = 'true';
    });
    document.getElementById('editBtn').textContent = '✓ Done';
    document.getElementById('editBtn').classList.remove('tb-primary');
    document.getElementById('editBtn').classList.add('tb-export');
    showToast('✏️ Edit mode enabled — changes are saved locally for you only.');
  } else {
    isEditing = false;
    document.body.classList.remove('editing');
    document.querySelectorAll('[data-key]').forEach(el => {
      el.contentEditable = 'false';
    });
    document.getElementById('editBtn').textContent = '✏️ Edit';
    document.getElementById('editBtn').classList.add('tb-primary');
    document.getElementById('editBtn').classList.remove('tb-export');

    const snap = captureSnapshot();
    const history = loadHistory();
    history.push({ timestamp: new Date().toISOString(), snapshot: snap });
    saveHistory(history);
    updateCharts();
  }
}

function deleteCard(cardId) {
  const el = document.getElementById(cardId);
  if(el) el.classList.add('card-hidden');
}

// ═══════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', {day:'numeric',month:'short',year:'numeric'}) + ' ' +
         d.toLocaleTimeString('en-AU', {hour:'2-digit',minute:'2-digit'});
}

function stripHTML(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent.trim();
}

function diffSnapshots(before, after) {
  const changes = [];
  const allKeys = new Set([...Object.keys(before||{}), ...Object.keys(after||{})]);
  allKeys.forEach(key => {
    if(key === '_deletedCards') return;
    const b = stripHTML(before?.[key] || '');
    const a = stripHTML(after?.[key] || '');
    if(b !== a) {
      const el = document.querySelector(`[data-key="${key}"]`);
      const label = el?.dataset.label || key;
      changes.push({label, from:b.substring(0,80), to:a.substring(0,80)});
    }
  });
  // check deleted cards diff
  const delBefore = (before?._deletedCards||[]).join(',');
  const delAfter = (after?._deletedCards||[]).join(',');
  if(delBefore !== delAfter) changes.push({label:'Removed cards',from:delBefore||'none',to:delAfter||'none'});
  return changes;
}

function openHistory() {
  const history = loadHistory();
  const list = document.getElementById('historyList');
  if(!history.length) {
    list.innerHTML = '<div class="no-hist">No edit history yet. Click Edit to start making changes.</div>';
  } else {
    const current = captureSnapshot();
    list.innerHTML = [...history].reverse().map((h,ri) => {
      const i = history.length - 1 - ri;
      const isCurrent = i === history.length - 1;
      const next = history[i+1];
      const diffCount = diffSnapshots(h.snapshot, next ? next.snapshot : current).length;
      return `<div class="hist-item" onclick="openDiff(${i})">
        <div class="hist-time">${formatDate(h.timestamp)} ${isCurrent ? '<span class="hist-current">Latest</span>' : ''}</div>
        <div class="hist-desc">${diffCount} change${diffCount!==1?'s':''} saved in this version</div>
      </div>`;
    }).join('');
  }
  document.getElementById('historyModal').classList.add('open');
}

function closeHistory() { document.getElementById('historyModal').classList.remove('open'); }

function openDiff(index) {
  pendingRollbackIndex = index;
  const history = loadHistory();
  const thisSnap = history[index].snapshot;
  const current = captureSnapshot();
  const changes = diffSnapshots(thisSnap, current);
  document.getElementById('diffTitle').textContent = 'Changes since ' + formatDate(history[index].timestamp);
  const diffList = document.getElementById('diffList');
  if(!changes.length) {
    diffList.innerHTML = '<p style="font-size:14px;color:var(--text-sec)">No differences between this save and the current version.</p>';
  } else {
    diffList.innerHTML = changes.map(c => `
      <div class="diff-item">
        <div class="diff-key">${c.label}</div>
        <div class="diff-from">Was: ${c.from || '(empty)'}</div>
        <div class="diff-to">Now: ${c.to || '(empty)'}</div>
      </div>`).join('');
  }
  document.getElementById('diffModal').classList.add('open');
}

function closeDiff() { document.getElementById('diffModal').classList.remove('open'); pendingRollbackIndex = -1; }

function doRollback() {
  if(pendingRollbackIndex < 0) return;
  const history = loadHistory();
  const snap = history[pendingRollbackIndex].snapshot;
  applySnapshot(snap);
  // trim history to this point
  const newHistory = history.slice(0, pendingRollbackIndex + 1);
  saveHistory(newHistory);
  closeDiff();
  closeHistory();
}

function confirmRevert() { document.getElementById('revertModal').classList.add('open'); }

function doRevertAll() {
  // Re-render everything from original data
  renderDays(DAYS_TAS1, 'days-tas1');
  renderDays(DAYS_TAS2, 'days-tas2');
  renderDays(DAYS_MELB, 'days-melb');
  renderStays();
  renderCostTable();
  renderTips();
  renderChecklist();
  // reset inline editable keys from original data (hero, etc.)
  const originals = {
    'hero-title':'Tasmania &amp;<br>Melbourne',
    'hero-sub':'15 days exploring the wild south — fly from Singapore into Hobart, loop the island\'s ancient rainforests, granite beaches and rugged highlands, then fly to Melbourne for the world\'s greatest coastal drive.',
    'stat-days':'15','stat-budget':'~$4,200',
    'overview-desc':'Fly from Singapore into Hobart and loop Tasmania clockwise — convict history, pristine rainforest, glowing granite beaches, and alpine wilderness — then fly to Melbourne for the city\'s legendary laneways and coffee, before tackling the breathtaking Great Ocean Road.',
    'flight-hobartleg':'~$400–700','flight-melbleg':'~$120–250',
    'car-cost':'Est. $110–150/day → ~$1,500–2,000 total',
    'stays-desc':'All prices are estimates for a whole-home Airbnb for 4 guests in December 2026 peak season. Book as early as possible — especially Coles Bay (Freycinet) and Cradle Mountain, which have very limited supply.',
  };
  Object.entries(originals).forEach(([key,val]) => {
    const el = document.querySelector(`[data-key="${key}"]`);
    if(el) el.innerHTML = val;
  });
  saveHistory([]);
  document.getElementById('revertModal').classList.remove('open');
  setTimeout(updateCharts, 100);
}

// ═══════════════════════════════════════
// PDF EXPORT
// ═══════════════════════════════════════
function exportPDF() {
  document.getElementById('pdfModal').classList.add('open');
}

async function doExportPDF(isLandscape) {

  // ── Capture maps as images ────────────────────────────────
  async function captureMap(mapId, pageId, leafletMap) {
    const pageEl = document.getElementById(pageId);
    const mapEl  = document.getElementById(mapId);
    if (!mapEl || !pageEl) return null;
    const prev = pageEl.style.display;
    pageEl.style.display = 'block';
    if (leafletMap) { leafletMap.invalidateSize(); await new Promise(r => setTimeout(r, 350)); }
    try {
      const canvas = await html2canvas(mapEl, { useCORS: true, allowTaint: true, scale: 1.5, backgroundColor: '#f5f5f7' });
      pageEl.style.display = prev;
      return canvas.toDataURL('image/jpeg', 0.88);
    } catch(e) {
      pageEl.style.display = prev;
      return null;
    }
  }

  const toast = document.createElement('div');
  toast.textContent = 'Capturing maps…';
  Object.assign(toast.style, { position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)',
    background:'#1d1d1f', color:'#fff', padding:'10px 22px', borderRadius:'20px',
    fontSize:'14px', fontFamily:'var(--font)', zIndex:9999, boxShadow:'0 4px 20px rgba(0,0,0,0.3)' });
  document.body.appendChild(toast);

  const [mapTasUrl, mapMelbUrl] = await Promise.all([
    captureMap('map-tas',  'page-overview', window._mapTas),
    captureMap('map-melb', 'page-melb',     window._mapMelb),
  ]);

  toast.textContent = 'Building PDF…';
  await new Promise(r => setTimeout(r, 50));

  function txt(key) {
    const el = document.querySelector(`[data-key="${key}"]`);
    return el ? el.innerText.trim() : '';
  }

  const allDays = [...DAYS_TAS1, ...DAYS_TAS2, ...DAYS_MELB];

  function buildDayHtml(d) {
    const card = document.getElementById('card-' + d.id);
    if (card && card.classList.contains('card-hidden')) return '';
    const title = txt(`${d.id}-title`) || d.title;
    const meta  = txt(`${d.id}-meta`)  || d.meta;
    const desc  = txt(`${d.id}-desc`)  || d.desc;

    const tlHtml = d.timeline ? `<div class="tl">${d.timeline.map(t =>
      `<div class="tl-item"><div class="tl-time">${t.time}</div><div class="tl-icon">${t.icon}</div><div class="tl-lbl">${t.label}</div></div>`
    ).join('')}</div>` : '';

    const actsHtml = d.activities.map((a, i) => {
      const name  = txt(`${d.id}-act${i}-name`) || a.name;
      const adesc = txt(`${d.id}-act${i}-desc`) || a.desc;
      const cost  = (txt(`${d.id}-act${i}-cost`) || a.cost || '').replace('💰 ', '');
      return `<div class="act">
        <span class="act-ico">${a.icon}</span>
        <div>
          <div class="act-name">${name}</div>
          <div class="act-desc">${adesc}</div>
          ${cost ? `<div class="act-cost">💰 ${cost}</div>` : ''}
        </div>
      </div>`;
    }).join('');

    return `<div class="day">
      <div class="day-hdr">
        <div class="day-num"><span>${d.day}</span><strong>${d.date}</strong><span>Day ${parseInt(d.num, 10)}</span></div>
        <div class="day-info"><div class="day-ttl">${title}</div><div class="day-meta">${meta}</div></div>
      </div>
      <div class="day-body">
        ${tlHtml}
        <p class="day-desc">${desc}</p>
        <div class="acts">${actsHtml}</div>
      </div>
    </div>`;
  }

  function buildStayHtml(s) {
    const card = document.getElementById('card-stay-' + s.id);
    if (card && card.classList.contains('card-hidden')) return '';
    const name  = txt(`stay-${s.id}-name`)  || s.name;
    const loc   = txt(`stay-${s.id}-loc`)   || s.loc;
    const areas = txt(`stay-${s.id}-areas`) || s.areas.join(' · ');
    const min   = txt(`stay-${s.id}-min`)   || s.minPrice;
    const max   = txt(`stay-${s.id}-max`)   || s.maxPrice;
    const tip   = (txt(`stay-${s.id}-tip`)  || s.tip).replace('💡 ','');
    return `<div class="stay">
      <div class="stay-top"><span class="stay-name">${name}</span><span class="stay-nights">${s.nights}</span></div>
      <div class="stay-loc">📍 ${loc}</div>
      <div class="stay-price">$${min}–${max} <span class="stay-price-sub">/night (whole house, 4 guests)</span></div>
      <div class="stay-areas">Best areas: ${areas}</div>
      <div class="stay-tip">💡 ${tip}</div>
    </div>`;
  }

  function buildCostRows() {
    let lastCat = '';
    return COSTS.map((c, i) => {
      const item  = txt(`cost-${i}-item`)  || c.item;
      const total = txt(`cost-${i}-total`) || c.total;
      const pp    = txt(`cost-${i}-pp`)    || c.pp;
      const note  = txt(`cost-${i}-note`)  || c.note;
      const span  = COSTS.filter(x => x.cat === c.cat).length;
      const catCell = c.cat !== lastCat
        ? `<td class="cost-cat" rowspan="${span}">${c.cat}</td>` : '';
      if (c.cat !== lastCat) lastCat = c.cat;
      const totalNum = String(total).replace(/[^0-9.]/g,'');
      const totalFmt = totalNum ? '$' + Number(totalNum).toLocaleString() : '$' + total;
      const ppNum = String(pp).replace(/[^0-9.]/g,'');
      const ppFmt = ppNum ? '$' + Number(ppNum).toLocaleString() : '$' + pp;
      return `<tr>${catCell}<td>${item}</td><td class="cost-amt">${totalFmt}</td><td class="cost-pp">${ppFmt}</td><td class="cost-note">${note}</td></tr>`;
    }).join('');
  }

  function buildTipHtml(t, ti) {
    const card = document.getElementById('card-tip-' + ti);
    if (card && card.classList.contains('card-hidden')) return '';
    const title = txt(`tip-${ti}-title`) || t.title;
    const items = t.items.map((_, ii) =>
      `<li>${txt(`tip-${ti}-item${ii}`) || t.items[ii]}</li>`
    ).join('');
    return `<div class="tip-card"><div class="tip-ico">${t.icon}</div><div class="tip-ttl">${title}</div><ul class="tip-list">${items}</ul></div>`;
  }

  const tas1Html = allDays.slice(0, 6).map(buildDayHtml).join('');
  const tas2Html = allDays.slice(6, 11).map(buildDayHtml).join('');
  const melbHtml = allDays.slice(11).map(buildDayHtml).join('');
  const staysHtml = STAYS.map(buildStayHtml).join('');
  const costRows  = buildCostRows();
  const tipsHtml  = TIPS.map(buildTipHtml).join('');

  const checklistState = loadChecklistState();
  const sortLabels = {urgency:'Urgency', category:'Category', date:'Travel Date', status:'Status'};
  const pdfGroups = getChecklistGroups();
  const checklistHtml = pdfGroups.map(g => {
    const done  = g.items.filter(it => checklistState[it.id]).length;
    const total = g.items.length;
    return `<div class="cl-group-pdf">
      <div class="cl-group-pdf-hdr" style="background:${g.color}">
        <div><div class="cl-group-pdf-title">${g.label}</div><div class="cl-group-pdf-sub">${g.sub}</div></div>
        <div class="cl-group-pdf-badge">${done}/${total} booked</div>
      </div>
      <div class="cl-items-pdf">
        ${g.items.map(it => {
          const checked = !!checklistState[it.id];
          return `<div class="cl-item-pdf">
            <div class="cl-box" style="${checked ? 'background:#34c759;border-color:#34c759' : ''}"></div>
            <div class="cl-ico-pdf">${it.icon}</div>
            <div class="cl-body-pdf">
              <div class="cl-title-pdf"${checked ? ' style="text-decoration:line-through;color:#999"' : ''}>${it.title}</div>
              <div class="cl-dates-pdf">${it.dates}</div>
              <div class="cl-detail-pdf">${it.detail}</div>
              <div class="cl-meta-pdf"><strong>💰 ${it.est}</strong> &nbsp;·&nbsp; 🔗 ${it.where}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  const heroSub  = txt('hero-sub')     || '15 days exploring the wild south.';
  const budget   = txt('stat-budget')  || '~$4,200';
  const totalPP  = document.getElementById('total-pp')?.textContent    || budget;
  const totalGrp = document.getElementById('total-group')?.textContent || '';

  const pdfCssRaw = await fetch(PDF_CSS_URL).then(r => {
    if (!r.ok) throw new Error(`pdf-export.css HTTP ${r.status}`);
    return r.text();
  });
  const pageRule = `@page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: 14mm 14mm 16mm 14mm; }`;
  const CSS = pdfCssRaw.replace('/* __PDF_PAGE__ */', pageRule);

  const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tasmania & Melbourne — December 2026 Itinerary</title>
<style>${CSS}</style>
</head>
<body>

<!-- ═══ COVER ═══ -->
<div class="cover">
  <div>
    <div class="cover-label">December 7–21, 2026 · 4 Friends · 1 RAV4</div>
    <div class="cover-title">Tasmania &amp;<br>Melbourne</div>
    <div class="cover-sub">${heroSub}</div>
    <div class="stats">
      <div class="stat-box"><div class="stat-val">15</div><div class="stat-lbl">Days total</div></div>
      <div class="stat-box"><div class="stat-val">4</div><div class="stat-lbl">Travellers</div></div>
      <div class="stat-box"><div class="stat-val">~2,100km</div><div class="stat-lbl">Total driving</div></div>
      <div class="stat-box"><div class="stat-val">${budget}</div><div class="stat-lbl">Est. per person (AUD)</div></div>
    </div>
    <div class="route-box">
      <div class="route-lbl">Tasmania · Dec 7–17</div>
      <div class="route-stops">
        <span class="rs">✈ SIN → Hobart</span><span class="ra">→</span>
        <span class="rs">Hobart</span><span class="ra">→</span>
        <span class="rs">Bruny Is.</span><span class="ra">→</span>
        <span class="rs">Maria Is.</span><span class="ra">→</span>
        <span class="rs">Port Arthur</span><span class="ra">→</span>
        <span class="rs">Freycinet</span><span class="ra">→</span>
        <span class="rs">Bay of Fires</span><span class="ra">→</span>
        <span class="rs">Cradle Mtn</span><span class="ra">→</span>
        <span class="rs">✈ Melbourne</span>
      </div>
    </div>
    <div class="route-box">
      <div class="route-lbl">Melbourne & Great Ocean Road · Dec 17–21</div>
      <div class="route-stops">
        <span class="rs">Melbourne</span><span class="ra">→</span>
        <span class="rs">Torquay</span><span class="ra">→</span>
        <span class="rs">Lorne</span><span class="ra">→</span>
        <span class="rs">Apollo Bay</span><span class="ra">→</span>
        <span class="rs">Cape Otway</span><span class="ra">→</span>
        <span class="rs">12 Apostles</span><span class="ra">→</span>
        <span class="rs">✈ Fly home</span>
      </div>
    </div>
  </div>
  <div class="cover-foot">All costs in AUD · December 2026 peak season estimates · Generated from your trip planner</div>
</div>

<!-- ═══ ROUTE MAPS ═══ -->
<div class="sec">
  <div class="tag">Route Overview</div>
  <h2>Trip Maps</h2>
</div>
${(mapTasUrl || mapMelbUrl) ? `
<div class="${isLandscape && mapTasUrl && mapMelbUrl ? 'maps-grid' : ''}">
  ${mapTasUrl ? `<div class="map-section-pdf">
    <div class="map-label tas">🗺 Tasmania · 11-day clockwise loop</div>
    <img class="map-img" src="${mapTasUrl}" alt="Tasmania route map">
    <div class="map-caption">Hobart → Bruny Is. → Maria Is. → Port Arthur → Freycinet → Bay of Fires → Bridestowe → Cradle Mountain → Hobart (fly) · ~1,500 km total</div>
  </div>` : ''}
  ${mapMelbUrl ? `<div class="map-section-pdf">
    <div class="map-label melb">🗺 Melbourne & Great Ocean Road</div>
    <img class="map-img" src="${mapMelbUrl}" alt="Melbourne and Great Ocean Road map">
    <div class="map-caption">Melbourne → Torquay → Anglesea → Lorne → Kennett River → Apollo Bay → Cape Otway → Twelve Apostles → Melbourne · ~600 km total</div>
  </div>` : ''}
</div>` : '<p style="color:#888;font-size:9pt">Maps could not be captured — view interactive maps in the trip planner.</p>'}

<!-- ═══ TASMANIA SOUTH ═══ -->
<div class="sec">
  <div class="tag">Tasmania · Days 1–6 · Dec 7–12</div>
  <h2>South Tasmania & Hobart Base</h2>
</div>
${tas1Html}

<!-- ═══ TASMANIA EAST & HIGHLANDS ═══ -->
<div class="sec">
  <div class="tag">Tasmania · Days 7–11 · Dec 13–17</div>
  <h2>East Coast & Highlands</h2>
</div>
${tas2Html}

<!-- ═══ MELBOURNE & GOR ═══ -->
<div class="sec">
  <div class="tag">Victoria · Days 12–15 · Dec 18–21</div>
  <h2>Melbourne & Great Ocean Road</h2>
</div>
${melbHtml}

<!-- ═══ ACCOMMODATION ═══ -->
<div class="sec">
  <div class="tag">Planning</div>
  <h2>Accommodation — 14 Nights, 7 Locations</h2>
</div>
${staysHtml}

<!-- ═══ BUDGET ═══ -->
<div class="sec">
  <div class="tag">Costs & Budget</div>
  <h2>Budget Breakdown — All Figures AUD</h2>
</div>
<div class="b-totals">
  <div class="b-total"><div class="b-val">${totalPP}</div><div class="b-lbl">Per person (mid-range)</div></div>
  <div class="b-total"><div class="b-val">${totalGrp}</div><div class="b-lbl">Total group (4 people)</div></div>
</div>
<table class="ctable">
  <thead><tr><th>Category</th><th>Item</th><th>Group Total</th><th>Per Person</th><th>Notes</th></tr></thead>
  <tbody>${costRows}</tbody>
</table>

<!-- ═══ TIPS ═══ -->
<div class="sec">
  <div class="tag">Practical Info</div>
  <h2>Tips & Essential Info</h2>
</div>
<div class="tips">${tipsHtml}</div>

<!-- ═══ BOOKING CHECKLIST ═══ -->
<div class="sec">
  <div class="tag">Action Items</div>
  <h2>Booking Checklist — December 7–21, 2026</h2>
  <p style="font-size:9pt;color:#888;margin-top:4pt">Sorted by: ${sortLabels[clSort] || 'Urgency'}</p>
</div>
${checklistHtml}

</body>
</html>`;

  document.body.removeChild(toast);

  // Use a hidden iframe instead of window.open() — avoids Safari popup blocker
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:none;pointer-events:none';
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(HTML);
  iframe.contentDocument.close();
  setTimeout(() => {
    iframe.contentWindow.print();
    setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 3000);
  }, 700);
}

// ═══════════════════════════════════════
// VERSION HISTORY
// ═══════════════════════════════════════
function openVersionModal() {
  const list = document.getElementById('versionList');
  list.innerHTML = VERSIONS.slice().sort(compareVersionDesc).map(v => `
    <div class="ver-entry">
      <div class="ver-entry-hdr">
        <span class="ver-badge${v.latest?' latest':''}">v${v.v}</span>
        <div>
          <div class="ver-entry-title">${v.title}</div>
          <div class="ver-entry-date">${v.date}</div>
        </div>
      </div>
      <ul class="ver-changes">${v.changes.map(c=>`<li>${c}</li>`).join('')}</ul>
    </div>`).join('');
  document.getElementById('versionModal').classList.add('open');
}

// ═══════════════════════════════════════
// SMART MERGE
// ═══════════════════════════════════════
let _pendingConflicts = [];
let _pendingMergedSnap = {};
let _conflictChoices = {};

function loadFreshSnap() {
  try { return JSON.parse(localStorage.getItem('tripFreshSnapshot') || 'null'); } catch { return null; }
}

function checkVersionMerge() {
  const storedVer   = localStorage.getItem('tripAppVersion');
  const storedFresh = loadFreshSnap();
  const history     = loadHistory();

  // Capture the clean render (before any user edits applied)
  const freshSnap = captureSnapshot();

  // Always update the stored fresh snapshot and version for next load
  localStorage.setItem('tripFreshSnapshot', JSON.stringify(freshSnap));
  localStorage.setItem('tripAppVersion', APP_VERSION);

  // Update pill
  const pill = document.getElementById('ver-pill-label');
  if (pill) pill.textContent = 'v' + APP_VERSION;

  if (!history.length) return; // No user edits — nothing to merge

  const userSnap = history[history.length - 1].snapshot;

  if (!storedVer || storedVer === APP_VERSION) {
    // Same version — apply user edits normally
    applySnapshot(userSnap);
    return;
  }

  // ── Version changed: 3-way merge ────────────────────────────
  const mergedSnap = Object.assign({}, freshSnap);
  const conflicts  = [];
  const allKeys    = new Set([...Object.keys(freshSnap), ...Object.keys(userSnap)]);

  allKeys.forEach(key => {
    if (key === '_deletedCards') return;
    const devText  = stripHTML(freshSnap[key]  || '');
    const userText = stripHTML(userSnap[key]   || '');
    const baseText = storedFresh ? stripHTML(storedFresh[key] || '') : devText;

    const userChanged = userText !== baseText;
    const devChanged  = devText  !== baseText;

    if (userChanged && devChanged) {
      // Genuine conflict
      const el    = document.querySelector(`[data-key="${key}"]`);
      const label = el?.dataset.label || key;
      conflicts.push({ key, label,
        devVal:  freshSnap[key] || '',
        userVal: userSnap[key]  || '' });
      // Default to developer's version in merged snap
      mergedSnap[key] = freshSnap[key];
    } else if (userChanged) {
      // User edited, dev left alone — keep user version
      mergedSnap[key] = userSnap[key];
    }
    // else dev changed or nothing changed — keep fresh (already default)
  });

  // Merge deleted cards: honour any the user hid
  const userDel = userSnap._deletedCards || [];
  const devDel  = freshSnap._deletedCards || [];
  mergedSnap._deletedCards = [...new Set([...devDel, ...userDel])];

  applySnapshot(mergedSnap);

  // Persist the merged state as the latest history entry
  history.push({ timestamp: new Date().toISOString(), snapshot: mergedSnap,
    note: `Auto-merged from v${storedVer} → v${APP_VERSION}` });
  saveHistory(history);

  if (conflicts.length) {
    setTimeout(() => openConflictModal(conflicts, mergedSnap), 400);
  } else {
    // Count how many user edits survived
    const saved = [...allKeys].filter(k => {
      if (k === '_deletedCards') return false;
      const u = stripHTML(userSnap[k] || '');
      const b = storedFresh ? stripHTML(storedFresh[k] || '') : '';
      return u !== b;
    }).length;
    if (saved > 0) showMergeToast(saved);
  }
}

function showToast(msg, duration) {
  const t = document.createElement('div');
  t.innerHTML = msg;
  Object.assign(t.style, {
    position:'fixed',bottom:'80px',left:'50%',transform:'translateX(-50%)',
    background:'#1d1d1f',color:'#fff',padding:'11px 22px',borderRadius:'12px',
    fontSize:'13px',fontFamily:'var(--font)',zIndex:'9999',
    boxShadow:'0 4px 20px rgba(0,0,0,.3)',lineHeight:'1.55',
    maxWidth:'380px',textAlign:'center',transition:'opacity .5s',whiteSpace:'nowrap'
  });
  document.body.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),500); }, duration||3500);
}

function showMergeToast(count) {
  showToast(`✅ Updated to <strong>v${APP_VERSION}</strong> — ${count} of your edit${count!==1?'s were':' was'} preserved automatically.`, 4000);
}

function openConflictModal(conflicts, mergedSnap) {
  _pendingConflicts  = conflicts;
  _pendingMergedSnap = Object.assign({}, mergedSnap);
  _conflictChoices   = {};
  conflicts.forEach(c => { _conflictChoices[c.key] = 'dev'; });

  document.getElementById('conflictBanner').innerHTML =
    `The app was updated to <strong>v${APP_VERSION}</strong>. ${conflicts.length} field${conflicts.length!==1?'s were':' was'} changed both by the update and by your edits. Review each conflict below — the update's version is selected by default.`;

  document.getElementById('conflictList').innerHTML = conflicts.map((c,i) => `
    <div class="conflict-item" id="cfi-${i}">
      <div class="conflict-item-hdr">⚠️ ${c.label}</div>
      <div class="conflict-vals">
        <div class="conflict-val">
          <div class="conflict-val-lbl">📲 New version</div>
          <div class="conflict-val-text" id="cfdev-${i}">${stripHTML(c.devVal)||'(empty)'}</div>
        </div>
        <div class="conflict-val">
          <div class="conflict-val-lbl">✏️ Your edit</div>
          <div class="conflict-val-text" id="cfuser-${i}">${stripHTML(c.userVal)||'(empty)'}</div>
        </div>
      </div>
      <div class="conflict-choice">
        <button class="conf-btn chosen" id="cfbtn-dev-${i}"  onclick="chooseConflict(${i},'dev')">Use new version</button>
        <button class="conf-btn"        id="cfbtn-user-${i}" onclick="chooseConflict(${i},'user')">Keep my edit</button>
      </div>
    </div>`).join('');

  document.getElementById('conflictModal').classList.add('open');
}

function chooseConflict(i, choice) {
  const key = _pendingConflicts[i].key;
  _conflictChoices[key] = choice;
  document.getElementById('cfbtn-dev-'+i).classList.toggle('chosen',  choice==='dev');
  document.getElementById('cfbtn-user-'+i).classList.toggle('chosen', choice==='user');
  document.getElementById('cfdev-'+i).classList.toggle('selected',    choice==='dev');
  document.getElementById('cfuser-'+i).classList.toggle('selected',   choice==='user');
}

function resolveAllConflicts(choice) {
  _pendingConflicts.forEach((_,i) => chooseConflict(i, choice));
}

function saveConflictChoices() {
  const snap = Object.assign({}, _pendingMergedSnap);
  _pendingConflicts.forEach(c => {
    snap[c.key] = _conflictChoices[c.key] === 'user' ? c.userVal : c.devVal;
  });
  applySnapshot(snap);
  const history = loadHistory();
  if (history.length) {
    history[history.length-1].snapshot = snap;
    saveHistory(history);
  }
  document.getElementById('conflictModal').classList.remove('open');
  _pendingConflicts = []; _pendingMergedSnap = {}; _conflictChoices = {};
}

// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════
function init() {
  renderDays(DAYS_TAS1, 'days-tas1');
  renderDays(DAYS_TAS2, 'days-tas2');
  renderDays(DAYS_MELB, 'days-melb');
  renderStays();
  renderCostTable();
  renderTips();
  renderChecklist();

  checkVersionMerge(); // applies history + handles version-change merge
  setTimeout(initMaps, 200);
}

// ═══════════════════════════════════════
// MAPS
// ═══════════════════════════════════════
function initMaps() {
  const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileOpts = { attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 13 };

  // ── Tasmania Map ──────────────────────────────────────────
  const mapTas = L.map('map-tas', { zoomControl: true, scrollWheelZoom: false }).setView([-42.2, 146.8], 7);
  L.tileLayer(tileUrl, tileOpts).addTo(mapTas);
  window._mapTas = mapTas;

  const tasStops = [
    { lat:-42.8821, lng:147.3272, num:1,  label:'Hobart', note:'Dec 7–10 · 4 nights · Base for Bruny & Maria day trips', color:'#0071e3', daytrip:false },
    { lat:-43.38,   lng:147.28,   num:'A', label:'Bruny Island', note:'Dec 9 · Day trip · Wilderness cruise, oysters, bread fridge', color:'#34c759', daytrip:true },
    { lat:-42.62,   lng:148.07,   num:'B', label:'Maria Island', note:'Dec 10 · Day trip · Painted Cliffs, wombats, convict ruins', color:'#34c759', daytrip:true },
    { lat:-42.6750, lng:146.5528, num:2,  label:'Mt Field NP', note:'Dec 11 · Morning stop en route Port Arthur', color:'#0071e3', daytrip:false },
    { lat:-43.1397, lng:147.8572, num:3,  label:'Port Arthur', note:'Dec 11 · 1 night · Historic penal colony, Isle of the Dead', color:'#0071e3', daytrip:false },
    { lat:-42.1167, lng:148.2833, num:4,  label:'Freycinet (Coles Bay)', note:'Dec 12–13 · 2 nights · Wineglass Bay, Mount Amos', color:'#0071e3', daytrip:false },
    { lat:-41.3197, lng:148.2467, num:5,  label:'Bay of Fires / St Helens', note:'Dec 14 · 1 night · Pyengana dairy, Swimcart Beach', color:'#0071e3', daytrip:false },
    { lat:-41.25,   lng:147.58,   num:'C', label:'Bridestowe Lavender', note:'Dec 15 · Morning stop · World\'s largest lavender estate', color:'#34c759', daytrip:true },
    { lat:-41.4419, lng:147.145,  num:6,  label:'Launceston', note:'Dec 15 · Brief stop · Cataract Gorge', color:'#0071e3', daytrip:false },
    { lat:-41.6417, lng:145.95,   num:7,  label:'Cradle Mountain', note:'Dec 15–16 · 2 nights · Dove Lake, Barn Bluff', color:'#0071e3', daytrip:false },
    { lat:-42.8821, lng:147.3272, num:8,  label:'Hobart Airport', note:'Dec 17 · Fly to Melbourne · Return RAV4 · No one-way fee', color:'#ff3b30', daytrip:false },
  ];

  const mainRoute = tasStops.filter(s => !s.daytrip).map(s => [s.lat, s.lng]);
  L.polyline(mainRoute, { color:'#0071e3', weight:3, opacity:0.7, dashArray:'6 4' }).addTo(mapTas);

  // Day trip lines from Hobart
  [[tasStops[0], tasStops[1]], [tasStops[0], tasStops[2]]].forEach(([a,b]) => {
    L.polyline([[a.lat,a.lng],[b.lat,b.lng]], { color:'#34c759', weight:2, opacity:0.6, dashArray:'4 6' }).addTo(mapTas);
  });
  // Bridestowe line
  L.polyline([[tasStops[5].lat,tasStops[5].lng],[tasStops[7].lat,tasStops[7].lng]], { color:'#34c759', weight:2, opacity:0.6, dashArray:'4 6' }).addTo(mapTas);

  tasStops.forEach((s, i) => {
    const size = s.daytrip ? 24 : 28;
    const icon = L.divIcon({
      className:'',
      html:`<div style="width:${size}px;height:${size}px;border-radius:50%;background:${s.color};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:${s.daytrip?10:11}px;font-weight:700;color:#fff;font-family:var(--font)">${s.num}</div>`,
      iconSize:[size,size], iconAnchor:[size/2,size/2], popupAnchor:[0,-size/2]
    });
    L.marker([s.lat,s.lng], {icon}).addTo(mapTas)
     .bindPopup(`<strong>${s.label}</strong>${s.note}`);
  });

  // ── Melbourne / GOR Map ───────────────────────────────────
  const mapMelb = L.map('map-melb', { zoomControl: true, scrollWheelZoom: false }).setView([-38.4, 144.2], 8);
  L.tileLayer(tileUrl, tileOpts).addTo(mapMelb);
  window._mapMelb = mapMelb;

  const melbStops = [
    { lat:-37.8136, lng:144.9631, num:1, label:'Melbourne', note:'Dec 17–18 · 2 nights · Laneways, markets, penguins' },
    { lat:-38.3367, lng:144.3253, num:2, label:'Torquay', note:'Dec 19 · Bells Beach, surf culture, GOR km 0' },
    { lat:-38.4042, lng:144.1869, num:3, label:'Anglesea', note:'Dec 19 · Kangaroos on the golf course' },
    { lat:-38.5469, lng:143.9811, num:4, label:'Lorne', note:'Dec 19 · Lunch, Erskine Falls, foreshore views' },
    { lat:-38.6603, lng:143.8644, num:5, label:'Kennett River', note:'Dec 19 · Best wild koalas in Victoria' },
    { lat:-38.7578, lng:143.6717, num:6, label:'Apollo Bay', note:'Dec 19–20 · 2 nights · Base for western GOR' },
    { lat:-38.8583, lng:143.5133, num:7, label:'Cape Otway', note:'Dec 20 · Lighthouse, koalas, rainforest' },
    { lat:-38.6634, lng:143.105,  num:8, label:'Twelve Apostles', note:'Dec 20 · Sunset at the rock stacks · ~2 hrs from Apollo Bay' },
    { lat:-37.8136, lng:144.9631, num:9, label:'Melbourne (return)', note:'Dec 21 · Return via inland — Geelong or Princes Freeway' },
  ];

  const gorRoute = melbStops.map(s => [s.lat, s.lng]);
  L.polyline(gorRoute, { color:'#ff9500', weight:3, opacity:0.8, dashArray:'6 4' }).addTo(mapMelb);

  melbStops.forEach((s, i) => {
    const isEnd = i === melbStops.length - 1;
    const color = isEnd ? '#86868b' : '#ff9500';
    const icon = L.divIcon({
      className:'',
      html:`<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;font-family:var(--font)">${s.num}</div>`,
      iconSize:[28,28], iconAnchor:[14,14], popupAnchor:[0,-14]
    });
    L.marker([s.lat,s.lng], {icon}).addTo(mapMelb)
     .bindPopup(`<strong>${s.label}</strong>${s.note}`);
  });
}

// ═══════════════════════════════════════
// AUTH
// ═══════════════════════════════════════
const _AH = '9172fe8ff387c2cc69d2a0bb8723a6544bf2252c60b18048f5e8a493b6aa6190';
const _AS = 'TasMelb_j9Rx2026';
const _AK = 'tripAuthToken';

async function _hashInput(val) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(val + _AS));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function checkAuth() {
  const stored = localStorage.getItem(_AK);
  if (stored === _AH) {
    document.getElementById('auth-overlay').classList.add('hidden');
    maybeShowOnboarding();
    return;
  }
  // Focus input after overlay is shown
  setTimeout(() => document.getElementById('auth-input')?.focus(), 50);
}

async function submitAuth() {
  const input = document.getElementById('auth-input');
  const btn   = document.getElementById('auth-btn');
  const err   = document.getElementById('auth-error');
  const val   = input.value;
  if (!val) return;

  btn.disabled = true;
  btn.textContent = 'Checking…';
  err.textContent = '';

  const hash = await _hashInput(val);
  if (hash === _AH) {
    if (document.getElementById('auth-remember').checked) {
      localStorage.setItem(_AK, _AH);
    }
    document.getElementById('auth-overlay').classList.add('hidden');
    maybeShowOnboarding();
  } else {
    input.value = '';
    input.classList.add('error');
    err.textContent = 'Incorrect password. Try again.';
    setTimeout(() => input.classList.remove('error'), 400);
    input.focus();
    btn.disabled = false;
    btn.textContent = 'Unlock';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  (async () => {
    try {
      await loadTripData();
    } catch (e) {
      console.error(e);
      alert('Could not load content/trip-data.json. Run a local static server (for example: npx serve) instead of opening this file directly.');
      return;
    }
    checkAuth();
    init();
  })();
});

// ═══════════════════════════════════════
// ONBOARDING & WHAT'S NEW
// ═══════════════════════════════════════
function maybeShowOnboarding() {
  const welcomed = localStorage.getItem('tripWelcomeSeen');
  const lastSeen = localStorage.getItem('tripLastSeenVersion');

  if (!welcomed) {
    // Brand new visitor — show welcome, mark both flags
    localStorage.setItem('tripWelcomeSeen', '1');
    localStorage.setItem('tripLastSeenVersion', APP_VERSION);
    setTimeout(() => document.getElementById('welcomeModal').classList.add('open'), 600);
  } else if (lastSeen !== APP_VERSION) {
    // Returning visitor seeing a new version
    localStorage.setItem('tripLastSeenVersion', APP_VERSION);
    setTimeout(() => openWhatsNewModal(), 600);
  }
}

function openWhatsNewModal() {
  const latest = VERSIONS.find(v => v.latest);
  if (!latest) return;
  document.getElementById('whatsNewSub').textContent =
    `Updated to v${latest.v} — ${latest.title}. Here's what changed:`;
  document.getElementById('whatsNewList').innerHTML =
    `<ul class="wn-changes">${latest.changes.map(c => `<li>${c}</li>`).join('')}</ul>`;
  document.getElementById('whatsNewModal').classList.add('open');
}

Object.assign(window, {
  submitAuth,
  toggleMobileMenu,
  closeMobileMenu,
  openVersionModal,
  showPage,
  setClSort,
  resetChecklist,
  toggleChecklistItem,
  openHistory,
  confirmRevert,
  toggleEdit,
  exportPDF,
  doExportPDF,
  closeHistory,
  closeDiff,
  doRollback,
  doRevertAll,
  doResetChecklist,
  resolveAllConflicts,
  saveConflictChoices,
  deleteCard,
  toggleDay,
  chooseConflict,
  openDiff,
});

// ═══════════════════════════════════════
// TOUCH TOOLTIPS
// ═══════════════════════════════════════
(function() {
  const tip = document.createElement('div');
  tip.id = 'touch-tip';
  document.body.appendChild(tip);
  let hideTimer, _startX = 0, _startY = 0;

  document.addEventListener('touchstart', function(e) {
    _startX = e.touches[0].clientX;
    _startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    const dx = Math.abs(e.changedTouches[0].clientX - _startX);
    const dy = Math.abs(e.changedTouches[0].clientY - _startY);
    if (dx > 8 || dy > 8) return; // user was scrolling, not tapping

    const target = e.target.closest('[data-tip]');
    if (!target) { tip.classList.remove('tt-show'); return; }

    clearTimeout(hideTimer);
    tip.textContent = target.getAttribute('data-tip');

    // Position above the tapped element, clamped within viewport
    const rect = target.getBoundingClientRect();
    const vw = window.innerWidth;
    let left = rect.left + rect.width / 2;
    left = Math.max(112, Math.min(vw - 112, left));
    tip.style.left = left + 'px';
    tip.style.top = Math.max(rect.top, 60) + 'px';
    tip.classList.add('tt-show');

    hideTimer = setTimeout(() => tip.classList.remove('tt-show'), 3000);
  }, { passive: true });
})();
