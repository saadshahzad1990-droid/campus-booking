(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------
  const OPEN = 8 * 60;          // 08:00
  const CLOSE = 22 * 60;        // 22:00
  const STEP = 15;              // minutes per slot
  const DAYS = 7;
  const CHECKIN_EARLY = 10;     // check-in opens 10 min before start
  const WARN = 5;               // finish-up warning 5 min before end
  const KEY = 'cb.v2.state';
  const OFFKEY = 'cb.v2.offset';
  const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

  const ITEMS = [
    { id: 'room214', name: 'Study room 2.14', cat: 'Study rooms', icon: 'room', where: 'Building B, 2nd floor', cap: 6, max: 120, typical: [30, 60, 90, 120],
      rules: ['Quiet group work only.'] },
    { id: 'room215', name: 'Study room 2.15', cat: 'Study rooms', icon: 'room', where: 'Building B, 2nd floor', cap: 4, max: 120, typical: [30, 60, 120],
      rules: ['Bring your own laptop charger, sockets are limited.'] },
    { id: 'print1', name: '3D printer 1', cat: 'Makerspace', icon: 'printer', where: 'Makerspace, room 0.04', cap: 1, max: 240, typical: [60, 90, 120, 180, 240], unattended: true,
      rules: ['Book the full print time from your slicer, plus 15 min.', 'Take your print off the bed when you check out.'] },
    { id: 'print2', name: '3D printer 2', cat: 'Makerspace', icon: 'printer', where: 'Makerspace, room 0.04', cap: 1, max: 240, typical: [60, 120, 180], unattended: true,
      rules: ['Book the full print time from your slicer, plus 15 min.', 'Take your print off the bed when you check out.'] },
    { id: 'laser', name: 'Laser cutter', cat: 'Makerspace', icon: 'laser', where: 'Makerspace, room 0.05', cap: 1, max: 60, typical: [15, 30, 45, 60],
      rules: ['Stay with the machine the whole time it runs.'] },
    { id: 'bench', name: 'Workbench area', cat: 'Makerspace', icon: 'bench', where: 'Makerspace, room 0.04', cap: 8, max: 180, typical: [30, 60, 90, 120],
      rules: ['Put the tools back on the wall when you leave.'] },
    { id: 'sewing', name: 'Sewing machine', cat: 'Makerspace', icon: 'sewing', where: 'Makerspace, room 0.06', cap: 1, max: 120, typical: [30, 60, 90],
      rules: ['Remove your thread and switch the machine off.'] },
    { id: 'booth', name: 'Podcast booth', cat: 'Media lab', icon: 'mic', where: 'Media lab, room 1.12', cap: 2, max: 60, typical: [15, 30, 45, 60],
      rules: ['Log out of the recording laptop when you finish.'] },
  ];
  const CATS = ['All', 'Study rooms', 'Makerspace', 'Media lab'];

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m % 60))}`;
  const durLabel = (d) => (d < 60 ? `${d} min` : d % 60 ? `${Math.floor(d / 60)} h ${d % 60} min` : `${d / 60} h`);
  const itemById = (id) => ITEMS.find((i) => i.id === id);
  const load = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: keep in memory */ } };

  // ---------------------------------------------------------------------------
  // Time (with a demo offset so a session can be shown without waiting)
  // ---------------------------------------------------------------------------
  let offset = Number(load(OFFKEY, 0)) || 0;
  const now = () => new Date(Date.now() + offset);
  const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayKey = () => dkey(now());
  const nowMin = () => { const n = now(); return n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60; };
  const dateOf = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
  const ts = (key, min) => dateOf(key).getTime() + min * 60000;
  const dayList = () => { const t = dateOf(todayKey()); return Array.from({ length: DAYS }, (_, i) => { const d = new Date(t); d.setDate(t.getDate() + i); return dkey(d); }); };
  const dayLabel = (key, long = false) => {
    const i = dayList().indexOf(key);
    const d = dateOf(key);
    const base = d.toLocaleDateString('en-GB', { weekday: long ? 'long' : 'short', day: 'numeric', month: 'short' });
    if (i === 0) return long ? `Today, ${base}` : 'Today';
    if (i === 1) return long ? `Tomorrow, ${base}` : 'Tomorrow';
    return base;
  };
  function setOffset(ms) { offset = ms; store(OFFKEY, offset); seedCache.clear(); render(); renderDemo(); }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const fresh = () => ({ user: null, bookings: [], reports: {}, prefs: { remindStart: true, warnEnd: true } });
  let state = Object.assign(fresh(), load(KEY, {}));
  const save = () => store(KEY, state);
  let draft = null; // { itemId, date, dur, start }
  let ui = { cat: 'All', q: '', showAll: false };

  // ---------------------------------------------------------------------------
  // Other people's bookings (generated per day so the app feels used)
  // ---------------------------------------------------------------------------
  const seedCache = new Map();
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function others(item, key) {
    const ck = `${key}|${item.id}`;
    if (seedCache.has(ck)) return seedCache.get(ck);
    const r = rng(hash(ck));
    const di = Math.max(0, dayList().indexOf(key));
    const busy = 0.62 - di * 0.05;
    const isToday = key === todayKey();
    const keepFreeFrom = Math.floor(nowMin() / STEP) * STEP - STEP;
    const keepFree = isToday && ITEMS.indexOf(item) % 2 === 0; // half the items stay free for the next 2 h today
    const out = [];
    for (let lane = 0; lane < item.cap; lane++) {
      let t = OPEN + Math.floor(r() * 5) * STEP;
      while (t < CLOSE) {
        const dur = item.typical[Math.floor(r() * item.typical.length)];
        if (t + dur > CLOSE) break;
        const clash = keepFree && t < keepFreeFrom + 135 && t + dur > keepFreeFrom;
        if (r() < busy && !clash) out.push({ start: t, end: t + dur });
        t += dur + Math.floor(r() * 4) * STEP;
      }
    }
    seedCache.set(ck, out);
    return out;
  }

  const endOf = (b) => (b.endedMin != null ? b.endedMin : b.start + b.dur);
  const counts = (b) => b.status !== 'cancelled';

  // People on an item at minute t (others + me)
  function countAt(item, key, t, excludeId) {
    let n = others(item, key).filter((o) => o.start <= t && t < o.end).length;
    n += state.bookings.filter((b) => b.id !== excludeId && b.itemId === item.id && b.date === key && counts(b) && b.start <= t && t < endOf(b)).length;
    return n;
  }
  // Highest number of people during [start, end)
  function peak(item, key, start, end, excludeId) {
    let m = 0;
    for (let t = start; t < end; t += STEP) m = Math.max(m, countAt(item, key, t, excludeId));
    return m;
  }
  // My own bookings that overlap a time window. You can't be in two rooms at once,
  // but a 3D print can run while you're somewhere else.
  function myClash(key, start, end, excludeId, itemId) {
    const it = itemById(itemId || (draft && draft.itemId));
    return state.bookings.find((b) => {
      if (b.id === excludeId || b.date !== key || !counts(b) || b.status === 'done') return false;
      if (!(b.start < end && start < endOf(b))) return false;
      if (b.itemId === (it && it.id)) return true;
      return !(it && it.unattended) && !itemById(b.itemId).unattended;
    });
  }

  function statusNow(item) {
    const key = todayKey();
    const nm = nowMin();
    if (nm < OPEN) return { kind: 'closed', text: `Opens at ${fmt(OPEN)}`, n: 0 };
    if (nm >= CLOSE) return { kind: 'closed', text: `Closed · opens ${fmt(OPEN)} tomorrow`, n: 0 };
    const t = Math.floor(nm);
    const n = countAt(item, key, t);
    if (n >= item.cap) {
      let f = Math.ceil(nm / STEP) * STEP;
      while (f < CLOSE && countAt(item, key, f) >= item.cap) f += STEP;
      const until = f >= CLOSE ? 'closing' : fmt(f);
      return { kind: 'full', text: item.cap === 1 ? `In use until ${until}` : `Full until ${until}`, n };
    }
    if (item.cap === 1) {
      let f = Math.ceil(nm / STEP) * STEP;
      while (f < CLOSE && countAt(item, key, f) < 1 && f < nm + 180) f += STEP;
      return { kind: 'free', text: f >= nm + 180 || f >= CLOSE ? 'Free now' : `Free now until ${fmt(f)}`, n };
    }
    return { kind: n >= item.cap - 1 ? 'busy' : 'free', text: n ? `${item.cap - n} of ${item.cap} places free` : 'Free now, nobody here', n };
  }

  function phase(b) {
    if (b.status === 'cancelled') return 'cancelled';
    if (b.status === 'done') return 'done';
    const n = now().getTime();
    const s = ts(b.date, b.start);
    const e = ts(b.date, endOf(b));
    if (b.status === 'active') return n >= e ? 'overtime' : 'active';
    if (n < s - CHECKIN_EARLY * 60000) return 'upcoming';
    if (n < e) return 'checkin';
    return 'missed';
  }
  const PHASE_TAG = { upcoming: ['Booked', ''], checkin: ['Check in now', 'live'], active: ['In use', 'live'], overtime: ['Time is up', 'missed'], done: ['Finished', 'done'], missed: ['Missed', 'missed'], cancelled: ['Cancelled', 'done'] };

  const sortedBookings = () => [...state.bookings].sort((a, b) => ts(a.date, a.start) - ts(b.date, b.start));
  const nextBooking = () => sortedBookings().find((b) => ['active', 'overtime', 'checkin', 'upcoming'].includes(phase(b)));

  // ---------------------------------------------------------------------------
  // Icons
  // ---------------------------------------------------------------------------
  const I = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg>',
    cam: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    mark: '<svg viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="12" stroke="#fff" stroke-width="3.5"/><path d="M20 12.5V20l5 3.5" stroke="#ffc83d" stroke-width="3.5" stroke-linecap="round"/></svg>',
    room: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 21V4h11v17M3 21h18M16 6h3v15"/><path d="M12.5 12.5h.01" stroke-linecap="round" stroke-width="3"/></svg>',
    printer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 3h16v18H4zM4 8h16"/><path d="M10 8v3l2 2 2-2V8M8 18h8"/></svg>',
    laser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18v5H3zM12 10v6M8 20h8"/><path d="M12 16l-2 4M12 16l2 4"/></svg>',
    bench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18M5 9v11M19 9v11M5 14h14M9 9V5h6v4"/></svg>',
    sewing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18M5 20V6a2 2 0 012-2h11v5H9v11M14 9v5"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
    cal: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  };

  // ---------------------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------------------
  const app = $('#app');
  const route = () => (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  const go = (path) => { if (location.hash === `#/${path}`) render(); else location.hash = `#/${path}`; };
  window.addEventListener('hashchange', () => { render(); app.scrollTop = 0; window.scrollTo(0, 0); });

  function render() {
    if (!state.user) { viewLogin(); return; }
    const [r, id] = route();
    const views = { home: viewHome, item: viewItem, confirm: viewConfirm, booked: viewBooked, bookings: viewBookings, checkin: viewCheckin, session: viewSession, checkout: viewCheckout };
    (views[r] || viewHome)(id);
  }

  const topbar = (title, { back = null, right = '' } = {}) => `
    <header class="topbar">
      ${back ? `<button class="iconbtn" data-go="${back}" aria-label="Back">${I.back}</button>` : ''}
      <h1>${esc(title)}</h1><button class="demo-pill" data-demo-open aria-label="Demo controls">Demo</button>${right}
    </header>`;

  const clockline = () => `<p class="clockline"><span>${dayLabel(todayKey(), true)}</span><span>${offset ? '<span class="demo-flag">demo time</span> ' : ''}<b class="live-clock">${fmt(Math.floor(nowMin()))}</b></span></p>`;

  // Shared click handling for data-go buttons
  app.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); go(g.dataset.go); return; }
    if (e.target.closest('[data-demo-open]')) openDemoSheet();
  });

  // ---------------------------------------------------------------------------
  // 1. Login
  // ---------------------------------------------------------------------------
  function viewLogin() {
    app.innerHTML = `
      <form class="login" id="login" novalidate>
        <div class="mark">${I.mark}</div>
        <h1>Campus<br>Booking</h1>
        <p class="lead">Book shared rooms and equipment for a set time, and hand them over on time.</p>
        <label class="field"><span>Student or staff ID</span>
          <input class="input" id="uid" autocomplete="username" autocapitalize="characters" placeholder="e.g. S-2048" maxlength="12">
          <p class="err" id="uid-err"></p></label>
        <label class="field"><span>Password</span>
          <input class="input" id="pw" type="password" autocomplete="current-password" placeholder="Your campus password">
          <p class="err" id="pw-err"></p></label>
        <button class="btn" type="submit">Log in</button>
        <p class="hint">Prototype: any ID and password work. Your bookings are saved on this device only.</p>
      </form>`;
    $('#login').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = $('#uid').value.trim().toUpperCase();
      const pw = $('#pw').value;
      const okId = /^[A-Z0-9-]{3,12}$/.test(id);
      $('#uid').classList.toggle('bad', !okId);
      $('#uid-err').textContent = okId ? '' : 'Enter your ID, for example S-2048 (letters, numbers, dashes).';
      $('#pw').classList.toggle('bad', !pw);
      $('#pw-err').textContent = pw ? '' : 'Enter your password.';
      if (!okId || !pw) return;
      state.user = { id };
      save();
      go('home');
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Home: what's free now + your next booking
  // ---------------------------------------------------------------------------
  function nextCard() {
    const b = nextBooking();
    if (!b) return '';
    const it = itemById(b.itemId);
    const p = phase(b);
    const n = now().getTime();
    const left = Math.max(0, Math.round((ts(b.date, endOf(b)) - n) / 60000));
    const startsIn = Math.round((ts(b.date, b.start) - n) / 60000);
    let k, actions;
    if (p === 'active') {
      k = left <= WARN ? `${left} min left · finish up` : `In use · ${left} min left`;
      actions = `<button class="btn on-blue" data-go="session/${b.id}">Open timer</button>`;
    } else if (p === 'overtime') {
      k = 'Your time is up';
      actions = `<button class="btn on-blue" data-go="checkout/${b.id}">Check out</button>`;
    } else if (p === 'checkin') {
      k = startsIn > 0 ? `Starts in ${startsIn} min · check-in is open` : 'Started · check in now';
      actions = `<button class="btn on-blue" data-go="checkin/${b.id}">Check in</button><button class="btn on-blue outline" data-go="booked/${b.id}">Details</button>`;
    } else {
      k = b.date === todayKey() ? `Today · check-in opens ${fmt(b.start - CHECKIN_EARLY)}` : `${dayLabel(b.date, true)}`;
      actions = `<button class="btn on-blue outline" data-go="booked/${b.id}">Details</button>`;
    }
    const soon = (p === 'active' && left <= WARN) || p === 'overtime';
    return `<section class="next ${soon ? 'signal' : ''}" aria-label="Your next booking">
      <p class="k">${k}</p>
      <p class="t">${esc(it.name)}</p>
      <p class="times">${fmt(b.start)}–${fmt(endOf(b))}</p>
      <div class="row">${actions}</div>
    </section>`;
  }

  function viewHome() {
    const q = ui.q.toLowerCase();
    const items = ITEMS.filter((i) => (ui.cat === 'All' || i.cat === ui.cat) && (!q || `${i.name} ${i.where} ${i.cat}`.toLowerCase().includes(q)));
    const rank = { free: 0, busy: 1, full: 2, closed: 3 };
    const rows = items.map((i) => ({ i, s: statusNow(i) })).sort((a, b) => rank[a.s.kind] - rank[b.s.kind]);
    const nOpen = state.bookings.filter((b) => ['active', 'overtime', 'checkin', 'upcoming'].includes(phase(b))).length;

    app.innerHTML = `
      ${topbar('Book a space', { right: `<button class="iconbtn" data-go="bookings" aria-label="My bookings (${nOpen})">${I.list}</button><button class="idchip" id="me" aria-label="Account">${esc(state.user.id)}</button>` })}
      ${clockline()}
      ${nextCard()}
      <label class="search">${I.search}<input id="q" type="search" placeholder="Search rooms or equipment" value="${esc(ui.q)}" aria-label="Search rooms or equipment"></label>
      <div class="chips" role="group" aria-label="Filter by area">
        ${CATS.map((c) => `<button class="chip" data-cat="${c}" aria-pressed="${ui.cat === c}">${c}</button>`).join('')}
      </div>
      <h2 class="section-h">Right now <span>${rows.filter((r) => r.s.kind === 'free' || r.s.kind === 'busy').length} of ${rows.length} free</span></h2>
      <div class="panel"><ul class="list">
        ${rows.length ? rows.map(({ i, s }) => {
          const issues = (state.reports[i.id] || []).length;
          return `<li><button class="item" data-go="item/${i.id}">
            <span class="glyph">${I[i.icon]}</span>
            <span class="main"><span class="name">${esc(i.name)}</span><br><span class="where">${esc(i.where)}</span><br>
              <span class="status ${s.kind}">${esc(s.text)}</span>${issues ? `<br><span class="issue">${issues} issue${issues > 1 ? 's' : ''} reported</span>` : ''}</span>
            ${i.cap > 1 && s.kind !== 'closed' ? `<span class="occ"><b>${s.n}/${i.cap}</b><span>here now</span></span>` : ''}
          </button></li>`;
        }).join('') : `<li class="empty">Nothing matches “${esc(ui.q)}”. Try “room” or “printer”.</li>`}
      </ul></div>
      <p class="foot">Prototype v2 · bookings are saved on this device · open ${fmt(OPEN)}–${fmt(CLOSE)}</p>`;

    $('#q').addEventListener('input', (e) => {
      ui.q = e.target.value;
      const pos = e.target.selectionStart;
      viewHome();
      const el = $('#q'); el.focus(); el.setSelectionRange(pos, pos);
    });
    $$('[data-cat]').forEach((b) => b.addEventListener('click', () => { ui.cat = b.dataset.cat; viewHome(); }));
    $('#me').addEventListener('click', accountSheet);
  }

  function accountSheet() {
    sheet(`<h2>Logged in as ${esc(state.user.id)}</h2>
      <p class="muted small" style="margin-bottom:16px">Bookings are tied to this ID. In this prototype they are stored on this device only.</p>
      <button class="btn ghost" id="out">Log out</button>
      <button class="btn danger" id="wipe">Reset demo data</button>`, (el, close) => {
      $('#out', el).onclick = () => { state.user = null; save(); close(); go('home'); };
      $('#wipe', el).onclick = () => { resetAll(); close(); };
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Item: pick day, length and start time
  // ---------------------------------------------------------------------------
  function firstStart(key) {
    if (key !== todayKey()) return OPEN;
    return Math.max(OPEN, Math.ceil(nowMin() / STEP) * STEP);
  }

  function viewItem(id) {
    const it = itemById(id);
    if (!it) { go('home'); return; }
    if (!draft || draft.itemId !== id) {
      const days = dayList();
      const date = firstStart(days[0]) + 15 <= CLOSE ? days[0] : days[1];
      draft = { itemId: id, date, dur: Math.min(60, it.max), start: null };
      ui.showAll = false;
    }
    const days = dayList();
    const durs = DURATIONS.filter((d) => d <= it.max);
    const from = firstStart(draft.date);
    const starts = [];
    for (let t = from; t + draft.dur <= CLOSE; t += STEP) starts.push(t);
    const shown = ui.showAll ? starts : starts.slice(0, 12);
    const reports = (state.reports[it.id] || []).slice(0, 2);

    const dayBusy = (key) => {
      let used = 0, total = 0;
      for (let t = OPEN; t < CLOSE; t += 60) { total += it.cap; used += countAt(it, key, t); }
      return Math.round((used / total) * 100);
    };

    app.innerHTML = `
      ${topbar(it.name, { back: 'home' })}
      <p class="facts"><span>${esc(it.where)}</span><span><b>${it.cap === 1 ? '1 person' : `Up to ${it.cap} people`}</b> at a time</span></p>
      ${reports.map((r) => `<div class="report"><b>Reported ${esc(dayLabel(r.date))} at ${fmt(r.at)}</b>${esc(r.text || 'Something is broken or missing.')}</div>`).join('')}

      <h2 class="section-h">Day</h2>
      <div class="days" role="group" aria-label="Choose a day">
        ${days.map((k) => {
          const d = dateOf(k);
          const none = firstStart(k) + Math.min(...durs) > CLOSE;
          return `<button class="day" data-day="${k}" aria-pressed="${k === draft.date}" ${none ? 'disabled' : ''} aria-label="${dayLabel(k, true)}">
            <small>${k === days[0] ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short' })}</small><b>${d.getDate()}</b><i style="--busy:${dayBusy(k)}%"></i></button>`;
        }).join('')}
      </div>

      <h2 class="section-h">How long?</h2>
      <div class="chips" role="group" aria-label="Booking length" style="flex-wrap:wrap;padding-top:0">
        ${durs.map((d) => `<button class="chip" data-dur="${d}" aria-pressed="${d === draft.dur}">${durLabel(d)}</button>`).join('')}
      </div>
      <p class="limit">Longest booking here: ${durLabel(it.max)}. Need longer? Book two slots in a row.</p>

      <h2 class="section-h">Start time <span>${it.cap > 1 ? 'places taken' : 'free or booked'}</span></h2>
      <div class="slots" id="slots">
        ${shown.length ? shown.map((t) => slotRow(it, t)).join('') : `<div class="panel empty">No ${durLabel(draft.dur)} slots left on this day. Try a shorter length or another day.</div>`}
      </div>
      ${starts.length > shown.length ? `<button class="btn ghost more" id="more">Show later times</button>` : ''}

      <div class="dock"><div class="dock-in">
        <button class="btn" id="go" ${draft.start == null ? 'disabled' : ''}>${draft.start == null ? 'Pick a start time' : `Continue · ${fmt(draft.start)}–${fmt(draft.start + draft.dur)}`}</button>
      </div></div>`;

    $$('[data-day]').forEach((b) => b.addEventListener('click', () => { draft.date = b.dataset.day; draft.start = null; ui.showAll = false; viewItem(id); }));
    $$('[data-dur]').forEach((b) => b.addEventListener('click', () => {
      draft.dur = Number(b.dataset.dur);
      if (draft.start != null && slotProblem(it, draft.start)) { toast(`${fmt(draft.start)} doesn't fit ${durLabel(draft.dur)}. Pick another start time.`); draft.start = null; }
      viewItem(id);
    }));
    $('#more')?.addEventListener('click', () => { ui.showAll = true; viewItem(id); });
    $('#slots').addEventListener('click', (e) => {
      const s = e.target.closest('[data-start]');
      if (!s) return;
      const t = Number(s.dataset.start);
      const why = slotProblem(it, t);
      if (why) { toast(why); return; }
      draft.start = t;
      viewItem(id);
    });
    $('#go').addEventListener('click', () => go('confirm'));
  }

  function slotProblem(it, t) {
    const end = t + draft.dur;
    if (end > CLOSE) return `That would run past closing at ${fmt(CLOSE)}.`;
    const mine = myClash(draft.date, t, end);
    if (mine) return `You already have ${itemById(mine.itemId).name} at ${fmt(mine.start)}–${fmt(endOf(mine))}.`;
    if (peak(it, draft.date, t, end) >= it.cap) {
      let f = t + STEP;
      while (f + draft.dur <= CLOSE && (peak(it, draft.date, f, f + draft.dur) >= it.cap || myClash(draft.date, f, f + draft.dur))) f += STEP;
      return f + draft.dur <= CLOSE ? `${fmt(t)}–${fmt(end)} is full. Next free start: ${fmt(f)}.` : `${fmt(t)}–${fmt(end)} is full, and nothing later fits today.`;
    }
    return '';
  }

  function slotRow(it, t) {
    const end = t + draft.dur;
    const p = peak(it, draft.date, t, end);
    const full = p >= it.cap;
    const mine = myClash(draft.date, t, end);
    const sel = draft.start === t;
    const who = mine ? 'You have another booking'
      : full ? (it.cap === 1 ? 'Booked' : 'Full')
      : it.cap === 1 ? 'Free'
      : `${p} of ${it.cap} taken`;
    const meter = it.cap > 1 ? `<span class="meter" aria-hidden="true">${Array.from({ length: it.cap }, (_, i) => `<span class="${i < p ? 'on' : ''}"></span>`).join('')}</span>` : '';
    return `<button class="slot ${full ? 'full' : ''} ${mine ? 'mine' : ''}" data-start="${t}" aria-pressed="${sel}" ${full || mine ? 'aria-disabled="true"' : ''}>
      <span class="tm">${fmt(t)}<small> – ${fmt(end)}</small></span><span class="who">${sel ? 'Selected' : who}</span>${meter}</button>`;
  }

  // ---------------------------------------------------------------------------
  // 4. Confirm
  // ---------------------------------------------------------------------------
  function viewConfirm() {
    if (!draft || draft.start == null) { go('home'); return; }
    const it = itemById(draft.itemId);
    const end = draft.start + draft.dur;
    app.innerHTML = `
      ${topbar('Check your booking', { back: `item/${it.id}` })}
      <p class="bigtime">${fmt(draft.start)}–${fmt(end)}</p>
      <p class="muted" style="margin-bottom:16px">${dayLabel(draft.date, true)} · ${durLabel(draft.dur)}</p>
      <div class="panel summary">
        <div class="kv"><span>What</span><b>${esc(it.name)}</b></div>
        <div class="kv"><span>Where</span><b>${esc(it.where)}</b></div>
        <div class="kv"><span>Ends at</span><b>${fmt(end)} sharp</b></div>
        <div class="kv"><span>Booked with</span><b>ID ${esc(state.user.id)}</b></div>
      </div>
      <div class="rules">
        <p class="rule">${I.info}<span>Check in when you arrive (from ${fmt(draft.start - CHECKIN_EARLY)}) and report anything broken before you start.</span></p>
        <p class="rule">${I.info}<span>You'll get a warning at ${fmt(end - WARN)}. Finish up and log out of any computers so the next person can start on time.</span></p>
        ${it.rules.map((r) => `<p class="rule">${I.info}<span>${esc(r)}</span></p>`).join('')}
      </div>
      <div class="dock"><div class="dock-in"><button class="btn" id="ok">Confirm booking</button></div></div>`;

    $('#ok').addEventListener('click', () => {
      const why = slotProblem(it, draft.start);
      if (why) { toast(`Someone was faster. ${why}`); draft.start = null; go(`item/${it.id}`); return; }
      const b = { id: Math.random().toString(36).slice(2, 9), itemId: it.id, date: draft.date, start: draft.start, dur: draft.dur, status: 'booked', created: Date.now() };
      // Booking something that starts soon: no extra "starts soon" pop-up, the booked screen already offers check-in
      if (ts(b.date, b.start) - CHECKIN_EARLY * 60000 <= now().getTime()) b.reminded = true;
      state.bookings.push(b);
      save();
      draft = null;
      go(`booked/${b.id}`);
    });
  }

  // ---------------------------------------------------------------------------
  // 5. Booked / booking details
  // ---------------------------------------------------------------------------
  function viewBooked(id) {
    const b = state.bookings.find((x) => x.id === id);
    if (!b) { go('home'); return; }
    const it = itemById(b.itemId);
    const p = phase(b);
    const fresh = Date.now() - b.created < 4000 && p !== 'done';
    const email = `${state.user.id.toLowerCase().replace(/[^a-z0-9]/g, '')}@campus.example`;
    const tag = PHASE_TAG[p];
    app.innerHTML = `
      ${topbar(fresh ? '' : 'Booking', { back: fresh ? null : 'bookings' })}
      ${fresh ? `<div class="done-mark">${I.check}</div><h2 style="font-size:28px;font-weight:800;font-stretch:118%">You're booked</h2>` : `<span class="tag ${tag[1]}">${tag[0]}</span>`}
      <p class="bigtime">${fmt(b.start)}–${fmt(endOf(b))}</p>
      <p class="muted">${esc(it.name)} · ${dayLabel(b.date, true)}</p>
      <div class="mail">
        <p class="from">Email to ${esc(email)} <span class="demo-flag">simulated</span></p>
        <b>Booking confirmed: ${esc(it.name)}, ${fmt(b.start)}–${fmt(endOf(b))}</b>
        <p class="muted small">${esc(it.where)} · ${dayLabel(b.date, true)} · booked with ID ${esc(state.user.id)}</p>
      </div>
      <h2 class="section-h">Reminders</h2>
      <div class="panel">
        <label class="toggle"><span>Remind me ${CHECKIN_EARLY} min before the start</span><span class="switch"><input type="checkbox" id="r1" ${state.prefs.remindStart ? 'checked' : ''}><i></i></span></label>
        <label class="toggle"><span>Warn me ${WARN} min before the end</span><span class="switch"><input type="checkbox" id="r2" ${state.prefs.warnEnd ? 'checked' : ''}><i></i></span></label>
      </div>
      <div style="margin-top:18px">
        ${p === 'checkin' ? `<button class="btn" data-go="checkin/${b.id}">Check in now</button>` : ''}
        ${p === 'active' || p === 'overtime' ? `<button class="btn" data-go="session/${b.id}">Open timer</button>` : ''}
        ${['upcoming', 'checkin'].includes(p) ? `<button class="btn ghost" id="ics">${I.cal} Add to my calendar</button>` : ''}
        ${fresh ? `<button class="btn ghost" data-go="home">Back to home</button>` : ''}
        ${['upcoming', 'checkin'].includes(p) ? `<button class="btn danger" id="cancel">Cancel booking</button>` : ''}
      </div>`;

    $('#r1').addEventListener('change', (e) => { state.prefs.remindStart = e.target.checked; save(); });
    $('#r2').addEventListener('change', (e) => { state.prefs.warnEnd = e.target.checked; save(); });
    $('#ics')?.addEventListener('click', () => downloadIcs(b));
    $('#cancel')?.addEventListener('click', () => {
      sheet(`<h2>Cancel this booking?</h2><p class="muted" style="margin-bottom:16px">${esc(it.name)}, ${fmt(b.start)}–${fmt(endOf(b))}. The time becomes free for others straight away.</p>
        <button class="btn danger" id="yes">Cancel booking</button><button class="btn ghost" id="no">Keep it</button>`, (el, close) => {
        $('#no', el).onclick = close;
        $('#yes', el).onclick = () => { b.status = 'cancelled'; save(); close(); toast('Booking cancelled. The time is free for others again.'); go('bookings'); };
      });
    });
  }

  function downloadIcs(b) {
    const it = itemById(b.itemId);
    const stamp = (ms) => { const d = new Date(ms); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`; };
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Campus Booking//v2//EN', 'BEGIN:VEVENT',
      `UID:${b.id}@campus-booking`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(ts(b.date, b.start))}`, `DTEND:${stamp(ts(b.date, endOf(b)))}`,
      `SUMMARY:${it.name}`, `LOCATION:${it.where}`, `DESCRIPTION:Booked with ID ${state.user.id}. Check in from ${fmt(b.start - CHECKIN_EARLY)}.`,
      'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', 'DESCRIPTION:Check in soon', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = `${it.name.replace(/\s+/g, '-')}-${b.date}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------------------------------------------------------------------------
  // My bookings
  // ---------------------------------------------------------------------------
  function viewBookings() {
    const all = sortedBookings();
    const open = all.filter((b) => ['active', 'overtime', 'checkin', 'upcoming'].includes(phase(b)));
    const past = all.filter((b) => !open.includes(b)).reverse();
    const row = (b) => {
      const it = itemById(b.itemId);
      const p = phase(b);
      const [t, c] = PHASE_TAG[p];
      const target = p === 'checkin' ? `checkin/${b.id}` : (p === 'active' || p === 'overtime') ? `session/${b.id}` : `booked/${b.id}`;
      const d = dateOf(b.date);
      return `<button class="bk item" data-go="${target}">
        <span class="when"><b>${d.getDate()}</b><small>${d.toLocaleDateString('en-GB', { month: 'short' })}</small></span>
        <span class="main"><b>${esc(it.name)}</b><span class="muted small">${fmt(b.start)}–${fmt(endOf(b))} · ${dayLabel(b.date)}</span><br><span class="tag ${c}">${t}</span></span>
      </button>`;
    };
    app.innerHTML = `
      ${topbar('My bookings', { back: 'home' })}
      <h2 class="section-h">Coming up</h2>
      <div class="panel">${open.length ? open.map(row).join('') : `<p class="empty">No bookings yet. <button class="linkbtn" data-go="home">Book a space</button></p>`}</div>
      ${past.length ? `<h2 class="section-h">Earlier</h2><div class="panel">${past.map(row).join('')}</div>` : ''}`;
  }

  // ---------------------------------------------------------------------------
  // 6. Check in + report damage
  // ---------------------------------------------------------------------------
  function viewCheckin(id) {
    const b = state.bookings.find((x) => x.id === id);
    if (!b) { go('home'); return; }
    const it = itemById(b.itemId);
    const p = phase(b);
    if (p === 'active' || p === 'overtime') { go(`session/${id}`); return; }
    if (p !== 'checkin') {
      app.innerHTML = `${topbar('Check in', { back: 'bookings' })}
        <div class="banner calm"><b>${p === 'upcoming' ? `Check-in opens at ${fmt(b.start - CHECKIN_EARLY)}` : 'This booking is over'}</b>${esc(it.name)}, ${dayLabel(b.date, true)}, ${fmt(b.start)}–${fmt(endOf(b))}</div>`;
      return;
    }
    let photo = null;
    app.innerHTML = `
      ${topbar('Check in', { back: 'bookings' })}
      <p class="muted" style="margin:-4px 2px 14px">${esc(it.name)} · ${fmt(b.start)}–${fmt(endOf(b))}<br>Is everything OK before you start?</p>
      <div class="checks">
        <label class="check"><input type="checkbox" id="c1" checked> The space is clean</label>
        <label class="check"><input type="checkbox" id="c2" checked> The equipment works</label>
        <label class="check warn"><input type="checkbox" id="c3"> Something is broken or missing</label>
      </div>
      <div id="dmg" hidden>
        <h2 class="section-h">Report it</h2>
        <textarea class="input" id="note" placeholder="What's wrong? e.g. HDMI cable missing, printer bed dirty"></textarea>
        <label class="photo" style="margin-top:8px">${I.cam} Add a photo<input type="file" id="pic" accept="image/*" capture="environment" hidden></label>
        <img id="prev" class="photo-prev" alt="" hidden>
        <p class="muted small" style="margin-top:8px">Reported under your ID, so the last person is asked about it, not you.</p>
      </div>
      <div class="dock"><div class="dock-in"><button class="btn" id="start">Start my session</button></div></div>`;

    const sync = () => {
      const bad = $('#c3').checked;
      $('#dmg').hidden = !bad;
      if (bad) { $('#c1').checked = $('#c1').checked; }
    };
    $('#c3').addEventListener('change', sync);
    $('#pic').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      photo = await shrink(f);
      $('#prev').src = photo; $('#prev').hidden = false;
    });
    $('#start').addEventListener('click', () => {
      const bad = $('#c3').checked || !$('#c1').checked || !$('#c2').checked;
      const note = $('#note').value.trim();
      if (bad) {
        const text = note || [!$('#c1').checked && 'The space was not clean.', !$('#c2').checked && 'The equipment did not work.'].filter(Boolean).join(' ') || 'Something is broken or missing.';
        (state.reports[it.id] = state.reports[it.id] || []).unshift({ date: todayKey(), at: Math.floor(nowMin()), text, photo, by: state.user.id });
      }
      b.status = 'active';
      b.checkedIn = Date.now();
      save();
      if (bad) toast('Thanks, your report is saved with this booking.');
      go(`session/${b.id}`);
    });
  }

  function shrink(file) {
    return new Promise((res) => {
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          const s = Math.min(1, 480 / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = () => res(null);
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  // ---------------------------------------------------------------------------
  // 7. In use: countdown
  // ---------------------------------------------------------------------------
  const R = 108, CIRC = 2 * Math.PI * R;

  function canExtend(b) {
    const it = itemById(b.itemId);
    const end = endOf(b);
    if (end + STEP > CLOSE) return { ok: false, why: `The space closes at ${fmt(CLOSE)}.` };
    if (b.dur + STEP > it.max) return { ok: false, why: `${durLabel(it.max)} is the longest booking here.` };
    if (peak(it, b.date, end, end + STEP, b.id) >= it.cap) return { ok: false, why: `Someone has booked ${fmt(end)}–${fmt(end + STEP)}.` };
    if (myClash(b.date, end, end + STEP, b.id, b.itemId)) return { ok: false, why: 'You have another booking right after this one.' };
    return { ok: true, why: `${fmt(end)}–${fmt(end + STEP)} is free` };
  }

  function viewSession(id) {
    const b = state.bookings.find((x) => x.id === id);
    if (!b) { go('home'); return; }
    const p = phase(b);
    if (p === 'checkin' || p === 'upcoming') { go(`checkin/${id}`); return; }
    if (p !== 'active' && p !== 'overtime') { go(`booked/${id}`); return; }
    const it = itemById(b.itemId);
    const ext = canExtend(b);
    app.innerHTML = `
      ${topbar('In use', { back: 'home', right: `<span class="idchip">${esc(state.user.id)}</span>` })}
      <p class="ends">${esc(it.name)} · ends at <b>${fmt(endOf(b))}</b></p>
      <div class="ring-wrap" id="ring">
        <svg viewBox="0 0 248 248" aria-hidden="true"><circle class="ring-bg" cx="124" cy="124" r="${R}" fill="none" stroke-width="16"/>
          <circle class="ring-fg" id="arc" cx="124" cy="124" r="${R}" fill="none" stroke-width="16" stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="0"/></svg>
        <div class="ring-label"><div><b id="left">--:--</b><span id="leftlbl">left</span></div></div>
      </div>
      <div id="banner"></div>
      <div style="margin-top:16px">
        <button class="btn ghost" id="ext" ${ext.ok ? '' : 'disabled'}>${ext.ok ? `Add 15 min · ${ext.why}` : 'Can’t add more time'}</button>
        ${ext.ok ? '' : `<p class="limit" style="text-align:center">${esc(ext.why)}</p>`}
      </div>
      <div class="dock"><div class="dock-in"><button class="btn" id="fin">Finish and check out</button></div></div>`;

    $('#ext').addEventListener('click', () => {
      const e2 = canExtend(b);
      if (!e2.ok) { toast(e2.why); return; }
      b.dur += STEP; b.warned = false; save();
      toast(`Extended. You now have until ${fmt(endOf(b))}.`);
      viewSession(id);
    });
    $('#fin').addEventListener('click', () => go(`checkout/${id}`));
    tickSession(b);
  }

  function tickSession(b) {
    const el = $('#left');
    if (!el) return;
    const s = ts(b.date, b.start), e = ts(b.date, endOf(b)), n = now().getTime();
    const rem = Math.round((e - n) / 1000);
    const over = rem < 0;
    const a = Math.abs(rem);
    el.textContent = `${over ? '+' : ''}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
    $('#leftlbl').textContent = over ? 'over your time' : 'left';
    const frac = Math.max(0, Math.min(1, (e - n) / (e - s)));
    $('#arc').setAttribute('stroke-dashoffset', String(CIRC * (1 - frac)));
    const ring = $('#ring');
    ring.classList.toggle('soon', !over && rem <= WARN * 60);
    ring.classList.toggle('over', over);
    const it = itemById(b.itemId);
    const nextPeople = peak(it, b.date, endOf(b), endOf(b) + STEP, b.id);
    const nextLine = nextPeople ? `Next booking starts at ${fmt(endOf(b))}.` : `Nobody is booked right after you.`;
    const html = over
      ? `<div class="banner red"><b>Your time ended at ${fmt(endOf(b))}</b>${nextPeople ? 'Someone is waiting for this space.' : 'Please check out now.'}</div>`
      : rem <= WARN * 60
        ? `<div class="banner"><b>${Math.ceil(rem / 60)} min left · finish up</b>Save your work and log out of any computers. ${nextLine}</div>`
        : `<div class="banner calm"><b>We'll warn you at ${fmt(endOf(b) - WARN)}</b>${nextLine}</div>`;
    const ban = $('#banner');
    if (ban.dataset.k !== html) { ban.innerHTML = html; ban.dataset.k = html; }
  }

  // ---------------------------------------------------------------------------
  // 8. Check out
  // ---------------------------------------------------------------------------
  function viewCheckout(id) {
    const b = state.bookings.find((x) => x.id === id);
    if (!b || !['active', 'overtime'].includes(phase(b))) { go('home'); return; }
    const it = itemById(b.itemId);
    const rem = Math.round((ts(b.date, endOf(b)) - now().getTime()) / 60000);
    const nextPeople = peak(it, b.date, endOf(b), endOf(b) + STEP, b.id);
    const items = it.cat === 'Makerspace'
      ? ['I switched the machine off or left it ready', 'I took my things and prints with me', 'The space is tidy for the next person']
      : ['I logged out of any computers', 'I took all my things with me', 'The space is tidy for the next person'];
    app.innerHTML = `
      ${topbar('Before you leave', { back: `session/${id}` })}
      <div class="banner ${rem <= WARN ? '' : 'calm'}"><b>${rem > 0 ? `${rem} min left` : rem === 0 ? 'Your time is up' : `${-rem} min over`}</b>${nextPeople ? `Next booking starts at ${fmt(endOf(b))}.` : 'Nobody is booked right after you.'}</div>
      <h2 class="section-h">Quick check</h2>
      <div class="checks">${items.map((t, i) => `<label class="check"><input type="checkbox" class="co" id="co${i}"> ${t}</label>`).join('')}</div>
      <div class="dock"><div class="dock-in"><button class="btn" id="out" disabled>Tick all three to check out</button></div></div>`;
    const sync = () => {
      const all = $$('.co').every((c) => c.checked);
      $('#out').disabled = !all;
      $('#out').textContent = all ? 'Check out' : 'Tick all three to check out';
    };
    $$('.co').forEach((c) => c.addEventListener('change', sync));
    $('#out').addEventListener('click', () => {
      const nm = Math.ceil(nowMin() / 5) * 5;
      const early = b.date === todayKey() && nm < endOf(b);
      if (early) b.endedMin = Math.max(b.start + 5, nm);
      b.status = 'done';
      save();
      toast(early ? `Checked out early. ${it.name} is free again from ${fmt(b.endedMin)}.` : 'Checked out. Thanks for finishing on time.');
      go('home');
    });
  }

  // ---------------------------------------------------------------------------
  // Sheet + toast
  // ---------------------------------------------------------------------------
  function sheet(html, wire) {
    const root = $('#sheet-root');
    root.innerHTML = `<div class="scrim"><div class="sheet" role="dialog" aria-modal="true"><div class="grip"></div>${html}</div></div>`;
    const close = () => { root.innerHTML = ''; };
    $('.scrim', root).addEventListener('click', (e) => { if (e.target.classList.contains('scrim')) close(); });
    wire?.($('.sheet', root), close);
    $('.sheet button', root)?.focus();
    return close;
  }
  let tt;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove('show'), 3800);
  }

  // ---------------------------------------------------------------------------
  // Reminders and the 5-minute warning (run every second)
  // ---------------------------------------------------------------------------
  function alerts() {
    if (!state.user || $('#sheet-root').innerHTML) return;
    const [r, rid] = route();
    for (const b of state.bookings) {
      const p = phase(b);
      const it = itemById(b.itemId);
      const n = now().getTime();
      if (p === 'checkin' && state.prefs.remindStart && !b.reminded && n < ts(b.date, b.start) + 5 * 60000) {
        b.reminded = true; save();
        buzz();
        sheet(`<h2>${esc(it.name)} starts at ${fmt(b.start)}</h2><p class="muted" style="margin-bottom:16px">Check-in is open. Check the space and report anything broken before you start.</p>
          <button class="btn" id="a">Check in now</button><button class="btn ghost" id="b">Later</button>`, (el, close) => {
          $('#a', el).onclick = () => { close(); go(`checkin/${b.id}`); };
          $('#b', el).onclick = close;
        });
        return;
      }
      if (p === 'active' && state.prefs.warnEnd && !b.warned && ts(b.date, endOf(b)) - n <= WARN * 60000) {
        b.warned = true; save();
        buzz();
        if (r === 'session' && rid === b.id) { render(); }
        sheet(`<h2>${WARN} minutes left</h2><p class="muted" style="margin-bottom:16px">${esc(it.name)} ends at ${fmt(endOf(b))}. Save your work, log out of any computers and get ready to hand over.</p>
          <button class="btn signal" id="a">Finish up now</button><button class="btn ghost" id="b">I need the last minutes</button>`, (el, close) => {
          $('#a', el).onclick = () => { close(); go(`checkout/${b.id}`); };
          $('#b', el).onclick = close;
        });
        return;
      }
    }
  }
  const buzz = () => { try { navigator.vibrate?.([180, 80, 180]); } catch { /* not supported */ } };

  setInterval(() => {
    const [r, id] = route();
    if (state.user && r === 'session') {
      const b = state.bookings.find((x) => x.id === id);
      if (b) {
        const before = phase(b);
        tickSession(b);
        if (before === 'active' && ts(b.date, endOf(b)) <= now().getTime() && !$('#ring').classList.contains('over')) render();
      }
    }
    $$('.live-clock').forEach((c) => { c.textContent = fmt(Math.floor(nowMin())); });
    alerts();
  }, 1000);
  // Refresh live statuses on list screens every 30 s
  setInterval(() => { const [r] = route(); if (state.user && (r === 'home' || r === '' || r === 'bookings')) render(); }, 30000);

  // ---------------------------------------------------------------------------
  // Demo controls (side panel on laptops, sheet on phones)
  // ---------------------------------------------------------------------------
  function resetAll() {
    const user = state.user;
    state = fresh(); state.user = user; save();
    draft = null; seedCache.clear(); setOffset(0);
    toast('Demo data reset.');
    go('home');
  }

  function demoActions() {
    const b = nextBooking();
    const it = b && itemById(b.itemId);
    return [
      b && ['upcoming', 'checkin'].includes(phase(b)) && { label: `Jump to check-in for ${it.name}`, run: () => setOffset(ts(b.date, b.start) - 3 * 60000 - Date.now()) },
      b && ['active', 'overtime'].includes(phase(b)) && { label: 'Jump to 5½ min before the end', run: () => { b.warned = false; save(); setOffset(ts(b.date, endOf(b)) - 330000 - Date.now()); } },
      b && phase(b) === 'active' && { label: 'Jump to 1 min after the end', run: () => setOffset(ts(b.date, endOf(b)) + 60000 - Date.now()) },
      offset && { label: 'Back to real time', run: () => setOffset(0) },
      { label: 'Reset demo data', run: resetAll },
    ].filter(Boolean);
  }

  function renderDemo() {
    const box = $('#side-demo');
    if (box) {
      const acts = demoActions();
      box.innerHTML = `<div class="demo-box"><h3>Demo controls</h3>
        <p>Skip ahead in time to show check-in, the countdown and the 5-minute warning without waiting. App time: <b>${fmt(Math.floor(nowMin()))}</b>${offset ? ' (shifted)' : ''}.</p>
        ${acts.map((a, i) => `<button class="btn" data-demo="${i}">${esc(a.label)}</button>`).join('')}</div>`;
      $$('[data-demo]', box).forEach((btn) => btn.addEventListener('click', () => acts[Number(btn.dataset.demo)].run()));
    }
  }

  function openDemoSheet() {
    const acts = demoActions();
    sheet(`<h2>Demo controls</h2><p class="muted small" style="margin-bottom:14px">Skip ahead in time to show check-in, the countdown and the 5-minute warning. App time: ${fmt(Math.floor(nowMin()))}${offset ? ' (shifted)' : ''}.</p>
      ${acts.map((a, i) => `<button class="btn ${i ? 'ghost' : ''}" data-d="${i}">${esc(a.label)}</button>`).join('')}`, (el, close) => {
      $$('[data-d]', el).forEach((btn) => btn.addEventListener('click', () => { close(); acts[Number(btn.dataset.d)].run(); }));
    });
  }

  // Keep the side panel's demo buttons in step with the app
  const origRender = render;
  render = function () { origRender(); renderDemo(); }; // eslint-disable-line no-func-assign

  // QR code for testers (laptop view)
  window.addEventListener('load', () => {
    try {
      if (window.QRCode) new window.QRCode($('#qr'), { text: location.origin + location.pathname, width: 96, height: 96, colorDark: '#16203a', colorLight: '#ffffff' });
    } catch { /* QR is optional */ }
  });

  render();
})();
