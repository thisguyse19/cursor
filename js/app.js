// Trip planner — load content/trip-data.json over HTTP (GitHub Pages or a local static server).

let APP_VERSION;
let VERSIONS;
let DAYS_TAS1, DAYS_TAS2, DAYS_MELB;
let STAYS, CHECKLIST, CL_META, COSTS, TIPS;
let FLIGHTS = [];
let FLIGHTS_LIVE = null;
let flightUserExtras = [];
let flightHiddenIds = new Set();
let flightEdits = {};
let flightModalEditingId = null;
const FLIGHT_OVERLAY_KEY = 'tripleFlightOverlay';
const FLIGHT_PATCH_KEYS = [
  'label',
  'airline',
  'flightNo',
  'depAirport',
  'arrAirport',
  'departureUtc',
  'arrivalUtc',
  'notes',
  'connectionKind',
  'viaAirport',
  'connectionDetail',
];
const FLIGHT_CONNECTION_LABELS = {
  direct: 'Direct',
  same_pnr: 'Same booking',
  self_transfer: 'Self-transfer',
  overnight: 'Long layover',
  open_jaw: 'Multi-city',
};

/** Lock page scroll while any modal (or the auth gate) is visible. */
let modalScrollLockActive = false;
let modalScrollLockY = 0;

function modalBlockingOverlayCount() {
  let n = document.querySelectorAll('.modal-overlay.open').length;
  const auth = document.getElementById('auth-overlay');
  if (auth && !auth.classList.contains('hidden')) n += 1;
  return n;
}

function syncModalScrollLock() {
  const n = modalBlockingOverlayCount();
  if (n > 0) {
    if (!modalScrollLockActive) {
      modalScrollLockY = window.scrollY || window.pageYOffset || 0;
      modalScrollLockActive = true;
      document.documentElement.classList.add('modal-scroll-lock');
      document.body.classList.add('modal-scroll-lock');
      document.body.style.top = `-${modalScrollLockY}px`;
    }
  } else if (modalScrollLockActive) {
    modalScrollLockActive = false;
    document.documentElement.classList.remove('modal-scroll-lock');
    document.body.classList.remove('modal-scroll-lock');
    document.body.style.removeProperty('top');
    window.scrollTo(0, modalScrollLockY);
  }
}

function initModalScrollLockObservers() {
  const mo = new MutationObserver(() => syncModalScrollLock());
  document.querySelectorAll('.modal-overlay').forEach(el =>
    mo.observe(el, { attributes: true, attributeFilter: ['class'] })
  );
  const auth = document.getElementById('auth-overlay');
  if (auth) mo.observe(auth, { attributes: true, attributeFilter: ['class'] });
  syncModalScrollLock();
}
let _tripCountdownTick = null;
let TRIP_COUNTDOWN_META = null;

function contentUrl(path) {
  const base = document.baseURI || window.location.href;
  return new URL(path.replace(/^\//, ''), base).href;
}

async function loadTripData() {
  const res = await fetch(contentUrl('content/trip-data.json'), { cache: 'no-store' });
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
  FLIGHTS = Array.isArray(d.flights) ? d.flights : [];
  TRIP_COUNTDOWN_META = d.tripCountdown && typeof d.tripCountdown === 'object' ? d.tripCountdown : null;
}

async function refreshFlightsFromNetwork() {
  FLIGHTS_LIVE = null;
  try {
    const res = await fetch(contentUrl('content/flights-live.json'), { cache: 'no-store' });
    if (res.ok) FLIGHTS_LIVE = await res.json();
  } catch (e) {
    console.warn('[Triple] flights-live', e);
  }
}

function flightEsc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function formatFlightCardTime(dt) {
  try {
    return dt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

function flightConnectionBlock(m) {
  const k = m.connectionKind || 'direct';
  const via = (m.viaAirport && String(m.viaAirport).trim()) ? String(m.viaAirport).trim().toUpperCase() : '';
  const detail = m.connectionDetail && String(m.connectionDetail).trim();
  if (k === 'direct' && !via && !detail) return '';
  const label = FLIGHT_CONNECTION_LABELS[k] || 'Connection';
  const viaPart = via ? ` · via ${flightEsc(via)}` : '';
  const notePart = detail ? `<div class="flight-connection-note">${flightEsc(detail)}</div>` : '';
  return `<div class="flight-connection"><span class="flight-connection-tag">${flightEsc(label)}</span>${viaPart}${notePart}</div>`;
}

function mergeLiveIntoFlight(base) {
  const u = (FLIGHTS_LIVE && FLIGHTS_LIVE.updates && FLIGHTS_LIVE.updates[base.id]) || {};
  return {
    ...base,
    departureUtc: u.departureUtc || base.departureUtc,
    arrivalUtc: u.arrivalUtc !== undefined ? u.arrivalUtc : base.arrivalUtc,
    status: u.status !== undefined ? u.status : base.status,
    gate: u.gate !== undefined ? u.gate : base.gate,
    terminal: u.terminal !== undefined ? u.terminal : base.terminal,
    delayMinutes: u.delayMinutes !== undefined ? u.delayMinutes : base.delayMinutes,
    checkIn: u.checkIn !== undefined ? u.checkIn : base.checkIn,
    liveNote: u.note !== undefined ? u.note : base.liveNote,
  };
}

function pickFlightPatch(obj) {
  if (!obj || typeof obj !== 'object') return {};
  const o = {};
  for (const k of FLIGHT_PATCH_KEYS) {
    if (obj[k] !== undefined) o[k] = obj[k];
  }
  return o;
}

function applyEditsToFlight(f) {
  if (!f || !f.id || f.id.startsWith('u-')) return { ...f };
  const p = flightEdits[f.id];
  if (!p || typeof p !== 'object') return { ...f };
  return { ...f, ...pickFlightPatch(p) };
}

function enrichFlightRow(f) {
  const withEdit = f.id && f.id.startsWith('u-') ? { ...f } : applyEditsToFlight(f);
  return mergeLiveIntoFlight(withEdit);
}

function calendarDiffDays(d0, d1) {
  const a = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate());
  const b = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
  return Math.round((b - a) / 86400000);
}

function tripCountdownState() {
  const m = TRIP_COUNTDOWN_META;
  if (!m || !m.start || !m.end) return null;
  const sy = m.start.year;
  const sm = m.start.month;
  const sd = m.start.day;
  const ey = m.end.year;
  const em = m.end.month;
  const ed = m.end.day;
  if (!sy || !sm || !sd || !ey || !em || !ed) return null;
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const today = new Date();
  const until = calendarDiffDays(today, start);
  const totalDays = calendarDiffDays(start, end) + 1;
  const dayIndex = calendarDiffDays(start, today) + 1;
  const afterEnd = calendarDiffDays(end, today) > 0;
  const label = m.label || 'Your trip';
  return { until, totalDays, dayIndex, afterEnd, start, end, label };
}

function renderTripCountdownBanner() {
  const el = document.getElementById('trip-countdown-banner');
  if (!el) return;
  if (_tripCountdownTick) {
    clearInterval(_tripCountdownTick);
    _tripCountdownTick = null;
  }
  const st = tripCountdownState();
  if (!st) {
    el.innerHTML = '';
    el.classList.add('trip-countdown-banner--empty');
    return;
  }
  el.classList.remove('trip-countdown-banner--empty');
  const write = () => {
    const s = tripCountdownState();
    if (!s) return;
    const { until, totalDays, dayIndex, afterEnd, start, label } = s;
    let inner;
    if (afterEnd) {
      inner = `<div class="trip-cd-inner trip-cd-inner--past">
        <div class="trip-cd-kicker">${flightEsc(label)}</div>
        <div class="trip-cd-past-msg">Hope you brought the stories home ✈️</div>
      </div>`;
    } else if (until > 1) {
      inner = `<div class="trip-cd-inner">
        <div class="trip-cd-kicker">Countdown to day one</div>
        <div class="trip-cd-num" aria-hidden="true">${until}</div>
        <div class="trip-cd-unit">days to go</div>
        <div class="trip-cd-sub">${start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
      </div>`;
    } else if (until === 1) {
      inner = `<div class="trip-cd-inner">
        <div class="trip-cd-kicker">Almost there</div>
        <div class="trip-cd-num trip-cd-num--sm">1</div>
        <div class="trip-cd-unit">day to go</div>
        <div class="trip-cd-sub">Pack the zoom lens and the patience for group chats.</div>
      </div>`;
    } else if (until === 0) {
      inner = `<div class="trip-cd-inner trip-cd-inner--today">
        <div class="trip-cd-kicker">This is it</div>
        <div class="trip-cd-today">Day one</div>
        <div class="trip-cd-sub">${flightEsc(label)} begins.</div>
      </div>`;
    } else {
      const d = Math.min(Math.max(dayIndex, 1), totalDays);
      inner = `<div class="trip-cd-inner trip-cd-inner--away">
        <div class="trip-cd-kicker">On the road</div>
        <div class="trip-cd-num trip-cd-num--sm">${d}</div>
        <div class="trip-cd-unit">of ${totalDays} days</div>
        <div class="trip-cd-sub">${flightEsc(label)}</div>
      </div>`;
    }
    el.innerHTML = inner;
  };
  write();
  _tripCountdownTick = setInterval(write, 60 * 60 * 1000);
}

function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function effectiveDepArr(f) {
  let dep = new Date(f.departureUtc).getTime();
  let arr = f.arrivalUtc ? new Date(f.arrivalUtc).getTime() : NaN;
  const dm = f.delayMinutes != null && f.delayMinutes > 0 ? f.delayMinutes * 60000 : 0;
  if (dm) {
    dep += dm;
    if (!Number.isNaN(arr)) arr += dm;
  }
  return {
    depIso: new Date(dep).toISOString(),
    arrIso: !Number.isNaN(arr) ? new Date(arr).toISOString() : '',
  };
}

function loadFlightOverlay() {
  try {
    const raw = localStorage.getItem(FLIGHT_OVERLAY_KEY);
    if (!raw) {
      flightUserExtras = [];
      flightHiddenIds = new Set();
      flightEdits = {};
      return;
    }
    const o = JSON.parse(raw);
    flightUserExtras = Array.isArray(o.extras) ? o.extras : [];
    flightHiddenIds = new Set(Array.isArray(o.hidden) ? o.hidden : []);
    flightEdits = o.edits && typeof o.edits === 'object' && !Array.isArray(o.edits) ? o.edits : {};
  } catch {
    flightUserExtras = [];
    flightHiddenIds = new Set();
    flightEdits = {};
  }
}

function persistFlightOverlay() {
  localStorage.setItem(
    FLIGHT_OVERLAY_KEY,
    JSON.stringify({
      extras: flightUserExtras,
      hidden: [...flightHiddenIds],
      edits: flightEdits,
    })
  );
}

function removeFlightCard(id) {
  if (id.startsWith('u-')) flightUserExtras = flightUserExtras.filter(f => f.id !== id);
  else {
    flightHiddenIds.add(id);
    delete flightEdits[id];
  }
  persistFlightOverlay();
  renderFlights();
}

function flightCardHtml(m) {
  const { depIso, arrIso } = effectiveDepArr(m);
  const depT = new Date(depIso);
  const arrT = arrIso ? new Date(arrIso) : null;
  const bits = [m.status, m.terminal && `Terminal ${m.terminal}`, m.gate && `Gate ${m.gate}`, m.checkIn].filter(Boolean);
  const statusLine = bits.join(' · ');
  const delayNote =
    m.delayMinutes != null && m.delayMinutes > 0
      ? `<div class="flight-delay">+${flightEsc(m.delayMinutes)}m delay (from live file)</div>`
      : '';
  const depStr = formatFlightCardTime(depT);
  const arrStr = arrT ? formatFlightCardTime(arrT) : '—';

  return `<div class="flight-card glass-card" data-flight-id="${flightEsc(m.id)}">
    <div class="flight-card-btns">
      <button type="button" class="flight-card-edit" title="Edit details" aria-label="Edit flight" onclick="openFlightEditModal('${flightEsc(m.id)}')">Edit</button>
      <button type="button" class="del-btn flight-card-remove" title="Remove from board" aria-label="Remove from board" onclick="removeFlightCard('${flightEsc(m.id)}')">×</button>
    </div>
    <div class="flight-card-label">${flightEsc(m.label)}</div>
    <div class="flight-mini-tl">
      <div class="flight-tl-track">
        <div class="flight-tl-stop">
          <div class="flight-tl-time">${flightEsc(depStr)}</div>
          <div class="flight-tl-dot"></div>
          <div class="flight-tl-code">${flightEsc(m.depAirport)}</div>
          <div class="flight-tl-sub">Depart</div>
        </div>
        <div class="flight-tl-mid">
          <div class="flight-tl-line"></div>
          <div class="flight-tl-plane" aria-hidden="true">✈</div>
          <div class="flight-tl-meta">${flightEsc(m.airline)}<span class="flight-tl-meta-sep"> · </span>${flightEsc(m.flightNo)}</div>
        </div>
        <div class="flight-tl-stop">
          <div class="flight-tl-time">${flightEsc(arrStr)}</div>
          <div class="flight-tl-dot flight-tl-dot--hollow"></div>
          <div class="flight-tl-code">${flightEsc(m.arrAirport)}</div>
          <div class="flight-tl-sub">Arrive</div>
        </div>
      </div>
    </div>
    ${flightConnectionBlock(m)}
    ${delayNote}
    ${statusLine ? `<div class="flight-live-status">${flightEsc(statusLine)}</div>` : ''}
    ${m.liveNote ? `<div class="flight-live-note">${flightEsc(m.liveNote)}</div>` : ''}
    ${m.notes ? `<div class="flight-notes">${flightEsc(m.notes)}</div>` : ''}
  </div>`;
}

function renderFlights() {
  const grid = document.getElementById('flight-cards-grid');
  const hint = document.getElementById('flight-sync-hint');
  if (!grid) return;

  const base = (FLIGHTS || []).filter(f => !flightHiddenIds.has(f.id)).map(f => ({ ...f }));
  const user = flightUserExtras.map(f => ({ ...f }));
  const rows = [...base, ...user]
    .sort((a, b) => new Date(a.departureUtc).getTime() - new Date(b.departureUtc).getTime())
    .map(enrichFlightRow);

  grid.classList.toggle('flight-cards-scroller--empty', rows.length === 0);
  grid.innerHTML = rows.length
    ? rows.map(flightCardHtml).join('')
    : '<div class="flight-empty flight-empty--solo">No flights here yet. Use <strong>+ Add flight</strong> or restore data from a backup.</div>';

  if (hint) {
    if (FLIGHTS_LIVE && FLIGHTS_LIVE.updatedAt) {
      try {
        const d = new Date(FLIGHTS_LIVE.updatedAt);
        hint.textContent =
          'Live file merged · updated ' +
          d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      } catch {
        hint.textContent = 'Live file merged';
      }
    } else {
      hint.textContent =
        'Using itinerary times only — live status file was not loaded (offline, blocked, or missing).';
    }
  }

  renderTripCountdownBanner();
}

function openFlightAddModal() {
  const modal = document.getElementById('flightAddModal');
  if (!modal) {
    console.warn('[Triple] flightAddModal missing');
    return;
  }
  flightModalEditingId = null;
  const titleEl = document.getElementById('flight-modal-title');
  if (titleEl) titleEl.textContent = 'Add flight';
  const subEl = document.getElementById('flight-modal-sub');
  if (subEl) {
    subEl.textContent =
      'Saved only on this device. Enter departure and optional arrival in your local timezone; times are stored in UTC.';
  }
  const submitEl = document.getElementById('flight-modal-submit');
  if (submitEl) submitEl.textContent = 'Save flight';
  const ids = [
    'flight-f-label',
    'flight-f-airline',
    'flight-f-no',
    'flight-f-dep-ap',
    'flight-f-arr-ap',
    'flight-f-dep',
    'flight-f-arr',
    'flight-f-notes',
    'flight-f-via',
    'flight-f-connection-notes',
  ];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) el.value = '';
  }
  const conn = document.getElementById('flight-f-connection');
  if (conn) conn.value = 'direct';
  modal.classList.add('open');
  setTimeout(() => document.getElementById('flight-f-label')?.focus(), 50);
}

function getFlightFormSource(id) {
  const u = flightUserExtras.find(f => f.id === id);
  if (u) return { ...u };
  const b = (FLIGHTS || []).find(f => f.id === id);
  if (!b) return null;
  return applyEditsToFlight(b);
}

function openFlightEditModal(id) {
  const modal = document.getElementById('flightAddModal');
  if (!modal) return;
  const src = getFlightFormSource(id);
  if (!src) return;
  flightModalEditingId = id;
  const titleEl = document.getElementById('flight-modal-title');
  if (titleEl) titleEl.textContent = 'Edit flight';
  const subEl = document.getElementById('flight-modal-sub');
  if (subEl) {
    subEl.textContent =
      'Updates are saved on this device. Built-in legs still merge with the live status file when you open the app.';
  }
  const submitEl = document.getElementById('flight-modal-submit');
  if (submitEl) submitEl.textContent = 'Save changes';
  document.getElementById('flight-f-label').value = src.label || '';
  document.getElementById('flight-f-airline').value = src.airline && src.airline !== '—' ? src.airline : '';
  document.getElementById('flight-f-no').value = src.flightNo && src.flightNo !== '—' ? src.flightNo : '';
  document.getElementById('flight-f-dep-ap').value = src.depAirport || '';
  document.getElementById('flight-f-arr-ap').value = src.arrAirport || '';
  document.getElementById('flight-f-dep').value = isoToDatetimeLocal(src.departureUtc);
  document.getElementById('flight-f-arr').value = src.arrivalUtc ? isoToDatetimeLocal(src.arrivalUtc) : '';
  document.getElementById('flight-f-notes').value = src.notes || '';
  const conn = document.getElementById('flight-f-connection');
  if (conn) conn.value = src.connectionKind && FLIGHT_CONNECTION_LABELS[src.connectionKind] ? src.connectionKind : 'direct';
  document.getElementById('flight-f-via').value = src.viaAirport || '';
  document.getElementById('flight-f-connection-notes').value = src.connectionDetail || '';
  modal.classList.add('open');
  setTimeout(() => document.getElementById('flight-f-label')?.focus(), 50);
}

function closeFlightAddModal() {
  flightModalEditingId = null;
  document.getElementById('flightAddModal')?.classList.remove('open');
  const titleEl = document.getElementById('flight-modal-title');
  if (titleEl) titleEl.textContent = 'Add flight';
  const submitEl = document.getElementById('flight-modal-submit');
  if (submitEl) submitEl.textContent = 'Save flight';
}

function submitFlightAdd() {
  const label = document.getElementById('flight-f-label').value.trim();
  const depAp = document.getElementById('flight-f-dep-ap').value.trim().toUpperCase();
  const arrAp = document.getElementById('flight-f-arr-ap').value.trim().toUpperCase();
  const dep = document.getElementById('flight-f-dep').value;
  if (!label || depAp.length < 3 || arrAp.length < 3 || !dep) {
    showAlert('Add a label, both airport codes (3 letters), and a departure date & time.', 'Flight');
    return;
  }
  const depIso = new Date(dep).toISOString();
  let arrIso = null;
  const arrVal = document.getElementById('flight-f-arr').value;
  if (arrVal) arrIso = new Date(arrVal).toISOString();
  const viaRaw = document.getElementById('flight-f-via').value.trim().toUpperCase();
  const connectionKind = document.getElementById('flight-f-connection')?.value || 'direct';
  const patch = {
    label,
    airline: document.getElementById('flight-f-airline').value.trim() || '—',
    flightNo: document.getElementById('flight-f-no').value.trim() || '—',
    depAirport: depAp.slice(0, 4),
    arrAirport: arrAp.slice(0, 4),
    departureUtc: depIso,
    arrivalUtc: arrIso,
    notes: document.getElementById('flight-f-notes').value.trim(),
    connectionKind,
    viaAirport: viaRaw ? viaRaw.slice(0, 4) : '',
    connectionDetail: document.getElementById('flight-f-connection-notes').value.trim(),
  };

  if (flightModalEditingId) {
    const eid = flightModalEditingId;
    const uIdx = flightUserExtras.findIndex(f => f.id === eid);
    if (uIdx >= 0) {
      flightUserExtras[uIdx] = { ...flightUserExtras[uIdx], ...pickFlightPatch(patch) };
    } else {
      flightEdits[eid] = { ...pickFlightPatch(patch) };
    }
    flightModalEditingId = null;
  } else {
    flightUserExtras.push({
      id: 'u-' + Date.now(),
      ...pickFlightPatch(patch),
    });
  }
  persistFlightOverlay();
  renderFlights();
  closeFlightAddModal();
}

window.removeFlightCard = removeFlightCard;
window.openFlightAddModal = openFlightAddModal;
window.openFlightEditModal = openFlightEditModal;
window.closeFlightAddModal = closeFlightAddModal;
window.submitFlightAdd = submitFlightAdd;

/** Newest-first semver sort for the version history modal. */
function compareVersionDesc(a, b) {
  const pa = String(a.v).split('.').map(part => parseInt(part, 10) || 0);
  const pb = String(b.v).split('.').map(part => parseInt(part, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return db - da;
  }
  return 0;
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
// CHECKLIST SORTING / GROUPING
// ═══════════════════════════════════════
let clSort = 'urgency';

function setClSort(s) {
  clSort = s;
  document.querySelectorAll('.cl-sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === s));
  renderChecklist();
}

function getChecklistGroups() {
  if (!CHECKLIST || !Array.isArray(CHECKLIST)) return [];
  const metaFor = id => (CL_META && CL_META[id]) || { cat: 'Other', catIcon: '📌', catColor: '#86868b', tripDate: 0 };
  const state = loadChecklistState();
  const allItems = CHECKLIST.flatMap(g => g.items.map(it => ({
    ...it, ...metaFor(it.id),
    urgencyId: g.id, urgencyLabel: g.label, urgencyColor: g.color, urgencySub: g.sub
  })));

  if (clSort === 'urgency') {
    return CHECKLIST.map(g => ({
      id: g.id, label: g.label, sub: g.sub, color: g.color,
      items: g.items.map(it => ({ ...it, ...metaFor(it.id) }))
    }));
  }
  if (clSort === 'category') {
    const catOrder = ['Flights', 'Accommodation', 'Car Rental', 'Ferries & Transfers', 'Activities', 'Insurance', 'Essentials'];
    const cats = [...new Set(allItems.map(it => it.cat))].sort((a, b) =>
      (catOrder.indexOf(a) < 0 ? 99 : catOrder.indexOf(a)) - (catOrder.indexOf(b) < 0 ? 99 : catOrder.indexOf(b)));
    return cats.map(cat => {
      const items = allItems.filter(it => it.cat === cat);
      const m = items[0];
      return {
        id: 'cat-' + cat.replace(/\s+/g, '-'),
        label: m.catIcon + ' ' + cat,
        sub: items.length + ' item' + (items.length !== 1 ? 's' : ''),
        color: m.catColor,
        items
      };
    });
  }
  if (clSort === 'date') {
    const dates = [...new Set(allItems.map(it => it.tripDate))].sort((a, b) => a - b);
    return dates.map(d => {
      const items = allItems.filter(it => it.tripDate === d);
      const label = d === 0 ? '📋 Pre-Trip (book now)' : '📅 Dec ' + d;
      const color = d === 0 ? '#636366' : d <= 9 ? '#ff3b30' : d <= 13 ? '#ff9500' : d <= 17 ? '#34c759' : '#0071e3';
      return { id: 'date-' + d, label, sub: items.length + ' item' + (items.length !== 1 ? 's' : ''), color, items };
    });
  }
  if (clSort === 'status') {
    const todo = allItems.filter(it => !state[it.id]);
    const done = allItems.filter(it => state[it.id]);
    return [
      todo.length ? { id: 'todo', label: '⏳ Still to Book', sub: todo.length + ' item' + (todo.length !== 1 ? 's' : '') + ' remaining', color: '#ff9500', items: todo } : null,
      done.length ? { id: 'done', label: '✅ Booked', sub: done.length + ' item' + (done.length !== 1 ? 's' : '') + ' complete', color: '#34c759', items: done } : null,
    ].filter(Boolean);
  }
  return [];
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
  flightUserExtras = [];
  flightHiddenIds = new Set();
  flightEdits = {};
  localStorage.removeItem(FLIGHT_OVERLAY_KEY);
  document.getElementById('revertModal').classList.remove('open');
  setTimeout(updateCharts, 100);
  renderFlights();
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

  try {
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

  const pdfCssRaw = await fetch(contentUrl('styles/pdf-export.css')).then(r => {
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

  if (toast.parentNode) toast.parentNode.removeChild(toast);

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
  } catch (e) {
    console.error('doExportPDF', e);
    showAlert('Could not build the PDF (' + (e.message || 'unknown error') + '). Try again on Wi‑Fi or use a desktop browser.', 'PDF export');
  } finally {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }
}

// ═══════════════════════════════════════
// VERSION HISTORY
// ═══════════════════════════════════════
function openVersionModal() {
  if (!VERSIONS || !Array.isArray(VERSIONS)) return;
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

  loadFlightOverlay();
  renderFlights();

  checkVersionMerge(); // applies history + handles version-change merge
  setTimeout(initMaps, 200);
}

// ═══════════════════════════════════════
// MAPS
// ═══════════════════════════════════════
function initMaps() {
  try {
    if (typeof L === 'undefined') {
      console.warn('Leaflet not loaded; maps disabled');
      return;
    }
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

  requestAnimationFrame(() => {
    mapTas.invalidateSize();
    mapMelb.invalidateSize();
  });
  } catch (e) {
    console.error('initMaps', e);
  }
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
  const val   = input.value.trim();
  if (!val) return;

  btn.disabled = true;
  btn.textContent = 'Checking…';
  err.textContent = '';

  try {
    if (!globalThis.crypto?.subtle) {
      err.textContent = 'This page needs a secure connection (https) to verify the password. Use the site’s GitHub Pages URL, not http or file.';
      return;
    }
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
    }
  } catch (e) {
    console.error(e);
    err.textContent = 'Could not verify password (try again, or use the https site link).';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Unlock';
  }
}

/* Inline handlers resolve on `window`; async fns and some engines need explicit assignment. */
window.submitAuth = submitAuth;
window.doExportPDF = doExportPDF;
window.setClSort = setClSort;
window.doRevertAll = doRevertAll;

/** In-app PWA update: new worker waits until the user taps Update, then reloads once (localStorage is kept). */
function setupServiceWorkerUpdates() {
  if (!('serviceWorker' in navigator)) return;

  let sawController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!sawController) {
      sawController = true;
      return;
    }
    window.location.reload();
  });

  let updateBarShown = false;
  function showSwUpdateBar(onActivate) {
    if (updateBarShown) return;
    updateBarShown = true;
    const bar = document.createElement('div');
    bar.id = 'sw-update-bar';
    bar.setAttribute('role', 'status');
    bar.innerHTML =
      '<span class="sw-update-msg">A new version is ready. Your saved trip data stays on this device.</span>' +
      '<button type="button" class="btn btn-blue sw-update-btn">Update</button>';
    bar.querySelector('.sw-update-btn').addEventListener('click', () => onActivate());
    document.body.appendChild(bar);
  }

  navigator.serviceWorker
    .register(contentUrl('sw.js'))
    .then((reg) => {
      const pingWaiting = () => {
        if (reg.waiting) {
          showSwUpdateBar(() => reg.waiting.postMessage({ type: 'SKIP_WAITING' }));
        }
      };

      reg.addEventListener('updatefound', () => {
        const inst = reg.installing;
        if (!inst) return;
        inst.addEventListener('statechange', () => {
          if (inst.state === 'installed' && navigator.serviceWorker.controller) {
            pingWaiting();
          }
        });
      });

      pingWaiting();

      const check = () => {
        reg.update();
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('focus', check);
    })
    .catch((err) => console.warn('[Triple] service worker registration failed', err));
}

window.addEventListener('DOMContentLoaded', () => {
  initModalScrollLockObservers();
  setupServiceWorkerUpdates();

  const flightAddBtnEarly = document.getElementById('flight-add-btn');
  if (flightAddBtnEarly) {
    flightAddBtnEarly.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openFlightAddModal();
    });
  }

  (function setupTouchTips() {
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
      if (dx > 8 || dy > 8) return;

      const target = e.target.closest('[data-tip]');
      if (!target) { tip.classList.remove('tt-show'); return; }

      clearTimeout(hideTimer);
      tip.textContent = target.getAttribute('data-tip');

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

  (async () => {
    let dataLoaded = false;
    try {
      await loadTripData();
      await refreshFlightsFromNetwork();
      dataLoaded = true;
    } catch (e) {
      console.error(e);
      alert('Could not load content/trip-data.json. If testing locally, use a static server (e.g. npx serve). On GitHub Pages, verify content/trip-data.json is published.');
    }
    try {
      checkAuth();
    } catch (e) {
      console.error('checkAuth', e);
    }
    if (dataLoaded) {
      try {
        init();
      } catch (e) {
        console.error('init', e);
      }
    }
  })();
});

// ═══════════════════════════════════════
// ONBOARDING & WHAT'S NEW
// ═══════════════════════════════════════
function maybeShowOnboarding() {
  if (APP_VERSION == null || !VERSIONS || !Array.isArray(VERSIONS)) return;
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
  if (!VERSIONS || !Array.isArray(VERSIONS)) return;
  const latest = VERSIONS.find(v => v.latest);
  if (!latest) return;
  document.getElementById('whatsNewSub').textContent =
    `Updated to v${latest.v} — ${latest.title}. Here's what changed:`;
  document.getElementById('whatsNewList').innerHTML =
    `<ul class="wn-changes">${latest.changes.map(c => `<li>${c}</li>`).join('')}</ul>`;
  document.getElementById('whatsNewModal').classList.add('open');
}
