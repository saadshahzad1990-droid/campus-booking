(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------
  const SLOT = 30;          // one session = 30 minutes; bookings are 1 or more sessions in a row
  const WARN = 5;           // finish-up warning 5 min before the end ...
  const HANDOVER = 5;       // ... and the next person can check in from that same moment
  const AHEAD = 90;         // book up to 90 days ahead
  const KEY = 'cb.v3.state';
  const OFFKEY = 'cb.v3.offset';
  const LENGTHS = [30, 60, 90, 120, 180, 240, 300, 360, 480];
  const FRIENDS = ['S-1033', 'S-2210', 'S-3175'];

  // Opening hours: Mon-Fri 08-22, Sat 10-18, Sun closed
  const hoursOn = (dow) => (dow === 0 ? null : dow === 6 ? { open: 600, close: 1080 } : { open: 480, close: 1320 });

  const ITEMS = [
    { id: 'room214', name: 'Study room 2.14', cat: 'Study rooms', icon: 'room', unit: 'room', where: 'Building B, 2nd floor', cap: 6, max: 240, typical: [60, 90, 120, 180],
      kit: ['Wall screen + HDMI', 'Whiteboard', '6 seats'], rules: ['Quiet group work only.'] },
    { id: 'room215', name: 'Study room 2.15', cat: 'Study rooms', icon: 'room', unit: 'room', where: 'Building B, 2nd floor', cap: 4, max: 240, typical: [60, 120],
      kit: ['TV screen', 'Whiteboard', '4 seats'], rules: ['Bring your own charger, sockets are limited.'] },
    { id: 'room105', name: 'Group room 1.05', cat: 'Study rooms', icon: 'group', unit: 'room', where: 'Building A, ground floor', cap: 10, max: 240, typical: [60, 90, 120],
      kit: ['Projector', 'Movable tables', '10 seats'], rules: ['Put the tables back the way you found them.'] },
    { id: 'print1', name: '3D printer 1', cat: 'Makerspace', icon: 'printer', unit: 'machine', where: 'Makerspace, room 0.04', cap: 1, max: 480, typical: [60, 120, 180, 240], unattended: true,
      kit: ['Prusa MK4', 'PLA and PETG', '25 × 21 cm bed'], rules: ['Book the full print time from your slicer.', 'Take your print off the bed when you check out.'] },
    { id: 'print2', name: '3D printer 2', cat: 'Makerspace', icon: 'printer', unit: 'machine', where: 'Makerspace, room 0.04', cap: 1, max: 480, typical: [60, 120, 240], unattended: true,
      kit: ['Prusa MK4', 'PLA only', '25 × 21 cm bed'], rules: ['Book the full print time from your slicer.', 'Take your print off the bed when you check out.'] },
    { id: 'laser', name: 'Laser cutter', cat: 'Makerspace', icon: 'laser', unit: 'machine', where: 'Makerspace, room 0.05', cap: 1, max: 180, typical: [30, 60, 90], addon: true,
      kit: ['60 W laser', 'Up to 60 × 40 cm', 'Wood, acrylic, card'], rules: ['Stay with the machine while it runs.'] },
    { id: 'bench', name: 'Workbench area', cat: 'Makerspace', icon: 'bench', unit: 'area', where: 'Makerspace, room 0.04', cap: 8, max: 240, typical: [60, 90, 120],
      kit: ['Hand tools', 'Soldering station', '8 places'], rules: ['Put the tools back on the wall when you leave.'] },
    { id: 'sewing', name: 'Sewing machine', cat: 'Makerspace', icon: 'sewing', unit: 'machine', where: 'Makerspace, room 0.06', cap: 1, max: 180, typical: [60, 90],
      kit: ['Bernina 335', 'Overlocker on request'], rules: ['Remove your thread and switch the machine off.'] },
    { id: 'booth', name: 'Podcast booth', cat: 'Media lab', icon: 'mic', unit: 'booth', where: 'Media lab, room 1.12', cap: 2, max: 180, typical: [30, 60, 90], addon: true,
      kit: ['2 mics + mixer', 'Recording laptop', 'Sound-treated'], rules: ['Log out of the recording laptop when you finish.'] },
  ];
  const CATS = ['All', 'Study rooms', 'Makerspace', 'Media lab'];
  const KEEP_FREE = ['room214', 'room105', 'print2', 'laser', 'booth']; // stay free for the next hours today, so a demo always works

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m % 60))}`;
  const durLabel = (d) => (d < 60 ? `${d} min` : d % 60 ? `${Math.floor(d / 60)} h ${d % 60} min` : `${d / 60} h`);
  const itemById = (id) => ITEMS.find((i) => i.id === id);
  const uid = () => Math.random().toString(36).slice(2, 9);
  const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  const load = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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
  const addDays = (key, n) => { const d = dateOf(key); d.setDate(d.getDate() + n); return dkey(d); };
  const daysFrom = (a, b) => Math.round((dateOf(b) - dateOf(a)) / 86400000);
  const hoursOf = (key) => hoursOn(dateOf(key).getDay());
  const lastDay = () => addDays(todayKey(), AHEAD);
  const dayLabel = (key, long = false) => {
    const i = daysFrom(todayKey(), key);
    const base = dateOf(key).toLocaleDateString('en-GB', { weekday: long ? 'long' : 'short', day: 'numeric', month: 'short' });
    if (i === 0) return long ? `Today, ${base}` : 'Today';
    if (i === 1) return long ? `Tomorrow, ${base}` : 'Tomorrow';
    return base;
  };
  function setOffset(ms) { offset = ms; store(OFFKEY, offset); seedCache.clear(); render(); }

  // ---------------------------------------------------------------------------
  // State. Bookings are shared by every ID that logs in on this device (and live
  // across tabs), so a friend you invite sees the booking when they log in.
  // ---------------------------------------------------------------------------
  const fresh = () => ({ bookings: [], reports: {}, inbox: {}, known: [], lastId: '', prefs: { remindStart: true, warnEnd: true } });
  let state = Object.assign(fresh(), load(KEY, {}));
  const save = () => store(KEY, state);
  let me = null;
  try { me = sessionStorage.getItem('cb.v3.me'); } catch { /* no session storage */ }
  const setMe = (id) => { me = id; try { id ? sessionStorage.setItem('cb.v3.me', id) : sessionStorage.removeItem('cb.v3.me'); } catch { /* ignore */ } };

  let draft = null;   // booking being made or changed
  const ui = { cat: 'All', q: '', month: null, calMonth: null, calDay: null, prefDate: null, flash: null, showPast: false };

  const isMine = (b) => b.owner === me || (b.members || []).includes(me);
  const endOf = (b) => (b.endedMin != null ? b.endedMin : b.end);
  const live = (b) => b.status !== 'cancelled';
  const weight = (it, b) => (b.places ? b.places : b.whole ? it.cap : it.cap > 1 ? 1 + (b.members || []).length : 1);

  // ---------------------------------------------------------------------------
  // Other students' bookings: generated per day so the app looks used
  // ---------------------------------------------------------------------------
  const seedCache = new Map();
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function others(it, key) {
    const ck = `${key}|${it.id}`;
    if (seedCache.has(ck)) return seedCache.get(ck);
    const h = hoursOf(key);
    const out = [];
    if (h) {
      const r = rng(hash(ck));
      const di = Math.max(0, daysFrom(todayKey(), key));
      const busy = Math.max(0.16, 0.6 - di * 0.025);
      const isToday = key === todayKey();
      const from = Math.floor(nowMin() / SLOT) * SLOT - SLOT;
      const keep = isToday && KEEP_FREE.includes(it.id);
      const blocked = (s, e) => keep && s < from + 210 && e > from;
      // A whole-room booking now and then (study groups, seminars)
      if (it.cap > 1 && r() < 0.35 - di * 0.004) {
        const s = h.open + Math.floor(r() * ((h.close - h.open - 120) / SLOT)) * SLOT;
        if (!blocked(s, s + 120)) out.push({ start: s, end: s + 120, w: it.cap, whole: true });
      }
      // Shared rooms are often empty for a while, so the whole room can be booked
      const quiet = [];
      if (it.cap > 1) {
        for (let q = 0; q < 3; q++) {
          const len = (4 + Math.floor(r() * 3)) * SLOT;
          const s = h.open + Math.floor(r() * ((h.close - h.open - len) / SLOT)) * SLOT;
          quiet.push([s, s + len]);
        }
      }
      const wholeHit = (s, e) => out.some((o) => o.whole && o.start < e && s < o.end) || quiet.some(([a, z]) => a < e && s < z);
      const lanes = it.cap > 1 ? Math.ceil(it.cap * 0.6) : it.cap;
      for (let lane = 0; lane < lanes; lane++) {
        let t = h.open + Math.floor(r() * 3) * SLOT;
        while (t < h.close) {
          const dur = it.typical[Math.floor(r() * it.typical.length)];
          if (t + dur > h.close) break;
          if (r() < busy && !blocked(t, t + dur) && !wholeHit(t, t + dur)) out.push({ start: t, end: t + dur, w: 1 });
          t += dur + (r() < 0.55 ? 0 : SLOT * (1 + Math.floor(r() * 3))); // back to back is normal, there is no pause between bookings
        }
      }
    }
    seedCache.set(ck, out);
    return out;
  }

  // Places in use on an item during the session that starts at t
  function usedAt(it, key, t, excl) {
    let n = 0;
    for (const o of others(it, key)) if (o.start <= t && t < o.end) n += o.w;
    for (const b of state.bookings) {
      if (b.itemId !== it.id || b.date !== key || !live(b) || (excl && excl.has(b.id))) continue;
      if (b.start <= t && t < endOf(b)) n += weight(it, b);
    }
    return Math.min(n, it.cap);
  }
  const fits = (it, key, t, need, whole, excl) => { const u = usedAt(it, key, t, excl); return whole ? u === 0 : u + need <= it.cap; };
  const myAt = (it, key, t, excl) => state.bookings.find((b) => b.itemId === it.id && b.date === key && live(b) && b.status !== 'done' && isMine(b) && !(excl && excl.has(b.id)) && b.start <= t && t < endOf(b));
  const mySame = (it, key, s, e, excl) => state.bookings.find((b) => b.itemId === it.id && b.date === key && live(b) && b.status !== 'done' && isMine(b) && !(excl && excl.has(b.id)) && b.start < e && s < endOf(b));
  const myOther = (key, s, e, itemId) => state.bookings.filter((b) => b.itemId !== itemId && b.date === key && live(b) && b.status !== 'done' && isMine(b) && b.start < e && s < endOf(b));

  function sessionsOf(key) {
    const h = hoursOf(key);
    if (!h) return [];
    const from = key === todayKey() ? Math.max(h.open, Math.floor(nowMin() / SLOT) * SLOT) : h.open;
    const out = [];
    for (let t = from; t + SLOT <= h.close; t += SLOT) out.push(t);
    return out;
  }

  // Why a time range can't be booked ('' = it can)
  function problem(it, key, s, e, { whole = false, need = 1, excl = null } = {}) {
    const h = hoursOf(key);
    if (!h) return 'Everything is closed on Sundays.';
    if (key < todayKey() || key > lastDay()) return `You can book up to ${AHEAD} days ahead.`;
    if (s < h.open || e > h.close) return `Open ${fmt(h.open)}–${fmt(h.close)} that day.`;
    if (key === todayKey() && s < Math.floor(nowMin() / SLOT) * SLOT) return 'That time has already passed.';
    if (e - s > it.max) return `${durLabel(it.max)} is the longest single booking for the ${it.name.toLowerCase()}.`;
    const same = mySame(it, key, s, e, excl);
    if (same) return `You already have the ${it.name.toLowerCase()} at ${fmt(same.start)}–${fmt(endOf(same))}. Change that booking instead.`;
    for (let t = s; t < e; t += SLOT) {
      if (!fits(it, key, t, need, whole, excl)) {
        const u = usedAt(it, key, t, excl);
        if (whole) return `At ${fmt(t)} ${u === it.cap ? 'the whole ' + it.unit + ' is booked' : `${u} ${u === 1 ? 'person has' : 'people have'} a place`}, so you can't have the whole ${it.unit} then.`;
        if (it.cap === 1 || u >= it.cap) return `${fmt(t)}–${fmt(t + SLOT)} is already booked.`;
        return `Only ${it.cap - u} of ${it.cap} places are free at ${fmt(t)}, you need ${need}.`;
      }
    }
    return '';
  }

  // How bookable a day is, for the calendar (0..1, or null when closed)
  function dayScore(it, key, whole, need) {
    const ss = sessionsOf(key);
    if (!hoursOf(key)) return null;
    if (!ss.length) return 0;
    let ok = 0;
    for (const t of ss) if (fits(it, key, t, need, whole) && !myAt(it, key, t)) ok++;
    return ok / ss.length;
  }

  function statusNow(it) {
    const key = todayKey();
    const h = hoursOf(key);
    const nm = nowMin();
    if (!h) return { kind: 'closed', text: 'Closed on Sundays', n: 0 };
    if (nm < h.open) return { kind: 'closed', text: `Opens at ${fmt(h.open)}`, n: 0 };
    if (nm >= h.close) return { kind: 'closed', text: 'Closed for today', n: 0 };
    const t = Math.floor(nm / SLOT) * SLOT;
    const n = usedAt(it, key, t);
    if (n >= it.cap) {
      let f = t + SLOT;
      while (f < h.close && usedAt(it, key, f) >= it.cap) f += SLOT;
      return { kind: 'full', text: f >= h.close ? 'Booked until closing' : `${it.cap === 1 ? 'In use' : 'Full'} until ${fmt(f)}`, n };
    }
    if (it.cap === 1) {
      let f = t + SLOT;
      while (f < h.close && usedAt(it, key, f) < 1 && f < t + 240) f += SLOT;
      return { kind: 'free', text: f >= t + 240 || f >= h.close ? 'Free now' : `Free now until ${fmt(f)}`, n };
    }
    return { kind: n >= it.cap - 1 ? 'busy' : 'free', text: n ? `${it.cap - n} of ${it.cap} places free` : 'Empty right now', n };
  }

  function phase(b) {
    if (b.status === 'cancelled') return 'cancelled';
    if (b.status === 'done') return 'done';
    const n = now().getTime();
    const s = ts(b.date, b.start);
    const e = ts(b.date, endOf(b));
    if (b.status === 'active') return n >= e ? 'overtime' : 'active';
    if (n < s - HANDOVER * 60000) return 'upcoming';
    if (n < e) return 'checkin';
    return 'missed';
  }
  const OPEN_PHASES = ['active', 'overtime', 'checkin', 'upcoming'];
  const PHASE_TAG = { upcoming: ['Booked', ''], checkin: ['Check-in open', 'live'], active: ['In use now', 'live'], overtime: ['Time is up', 'missed'], done: ['Finished', 'done'], missed: ['Missed', 'missed'], cancelled: ['Cancelled', 'done'] };
  const mine = () => state.bookings.filter(isMine);
  const sorted = (a) => [...a].sort((x, y) => ts(x.date, x.start) - ts(y.date, y.start));
  const nextBooking = () => sorted(mine()).find((b) => OPEN_PHASES.includes(phase(b)));
  const unread = () => (state.inbox[me] || []).filter((m) => !m.read).length;

  // Tell everyone on a booking what changed (simulated push/email + an inbox entry)
  function notify(b, text) {
    const ids = [...new Set([b.owner, ...(b.members || [])])].filter((x) => x && x !== me);
    (b.log = b.log || []).push({ at: now().getTime(), by: me, text });
    for (const id of ids) (state.inbox[id] = state.inbox[id] || []).unshift({ at: now().getTime(), text: `${me}: ${text}`, bid: b.id, read: false });
    return ids;
  }
  const sentTo = (ids) => (ids.length ? ` Update sent to ${list(ids)}.` : '');

  // ---------------------------------------------------------------------------
  // Icons
  // ---------------------------------------------------------------------------
  const sv = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    back: sv('<path d="M15 5l-7 7 7 7"/>', 2.2),
    next: sv('<path d="M9 5l7 7-7 7"/>', 2.2),
    chev: sv('<path d="M9 6l6 6-6 6"/>', 2),
    list: sv('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
    search: sv('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    check: sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3),
    info: sv('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'),
    cam: sv('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    cal: sv('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    book: sv('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>'),
    user: sv('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
    people: sv('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 15c2 .7 3.2 2.3 3.8 5"/>'),
    repeat: sv('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 01-3 3H3"/>'),
    plus: sv('<path d="M12 5v14M5 12h14"/>', 2.4),
    x: sv('<path d="M6 6l12 12M18 6L6 18"/>', 2.4),
    bell: sv('<path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/>'),
    link: sv('<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>'),
    mark: '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="12" stroke="#fff" stroke-width="3.5"/><path d="M20 12.5V20l5 3.5" stroke="#ffc83d" stroke-width="3.5" stroke-linecap="round"/></svg>',
    room: sv('<path d="M5 21V4h11v17M3 21h18M16 6h3v15"/><path d="M12.5 12.5h.01" stroke-width="3"/>'),
    group: sv('<rect x="3" y="9" width="18" height="6" rx="1.5"/><path d="M6 15v4M18 15v4M7 5.5h.01M12 5.5h.01M17 5.5h.01" /><path d="M7 5.5h.01M12 5.5h.01M17 5.5h.01" stroke-width="3.5"/>'),
    printer: sv('<path d="M4 3h16v18H4zM4 8h16"/><path d="M10 8v3l2 2 2-2V8M8 18h8"/>'),
    laser: sv('<path d="M3 5h18v5H3zM12 10v6M8 20h8"/><path d="M12 16l-2 4M12 16l2 4"/>'),
    bench: sv('<path d="M3 9h18M5 9v11M19 9v11M5 14h14M9 9V5h6v4"/>'),
    sewing: sv('<path d="M3 20h18M5 20V6a2 2 0 012-2h11v5H9v11M14 9v5"/>'),
    mic: sv('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>'),
  };

  // ---------------------------------------------------------------------------
  // Router (with a soft transition between screens)
  // ---------------------------------------------------------------------------
  const app = $('#app');
  const tabs = $('#tabs');
  const route = () => (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  const go = (path) => { if (location.hash === `#/${path}`) render(); else location.hash = `#/${path}`; };
  window.addEventListener('hashchange', () => {
    const run = () => { render(); app.scrollTop = 0; window.scrollTo(0, 0); };
    if (document.startViewTransition && !reduced()) document.startViewTransition(run); else run();
  });

  const TAB_ROUTES = ['home', 'calendar', 'bookings', 'account'];
  function render() {
    closeSheet();
    const [r, id] = route();
    if (!me) { viewLogin(); renderTabs(null); renderDemo(); return; }
    const views = { home: viewHome, item: viewItem, confirm: viewConfirm, booked: viewBooked, bookings: viewBookings, calendar: viewCalendar, account: viewAccount, checkin: viewCheckin, session: viewSession, checkout: viewCheckout };
    (views[r] || viewHome)(id);
    renderTabs(views[r] ? r : 'home');
    renderDemo();
  }

  function renderTabs(r) {
    const show = !!me && TAB_ROUTES.includes(r);
    tabs.hidden = !show;
    document.body.classList.toggle('has-tabs', show);
    if (!show) return;
    const n = mine().filter((b) => OPEN_PHASES.includes(phase(b))).length;
    const u = unread();
    const t = [['home', 'Book', I.book, ''], ['calendar', 'Calendar', I.cal, ''], ['bookings', 'My bookings', I.list, n ? `<span class="badge${u ? ' dot' : ''}">${n}</span>` : u ? '<span class="badge dot only"></span>' : ''], ['account', 'Account', I.user, '']];
    tabs.innerHTML = t.map(([k, label, ic, badge]) => `<a class="tab" href="#/${k}" ${k === r ? 'aria-current="page"' : ''}><span class="tab-ic">${ic}${badge}</span><span>${label}</span></a>`).join('');
  }

  const topbar = (title, { back = null, right = '' } = {}) => `
    <header class="topbar">
      ${back ? `<button class="iconbtn" data-go="${back}" aria-label="Back">${I.back}</button>` : ''}
      <h1>${esc(title)}</h1><button class="demo-pill" data-demo-open aria-label="Demo controls">Demo</button>${right}
    </header>`;
  const clockline = () => `<p class="clockline"><span>${dayLabel(todayKey(), true)}</span><span>${offset ? '<span class="demo-flag">demo time</span> ' : ''}<b class="live-clock">${fmt(Math.floor(nowMin()))}</b></span></p>`;

  app.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); go(g.dataset.go); return; }
    if (e.target.closest('[data-demo-open]')) openDemoSheet();
  });

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------
  function viewLogin() {
    app.innerHTML = `
      <form class="login" id="login" novalidate>
        <div class="mark">${I.mark}</div>
        <h1>Campus<br>Booking</h1>
        <p class="lead">Book rooms, places and machines on campus, for as long as you need, and hand them over on time.</p>
        <label class="field"><span>Student or staff ID</span>
          <input class="input" id="uid" autocomplete="username" autocapitalize="characters" placeholder="e.g. S-2048" maxlength="12" value="${esc(state.lastId)}">
          <p class="err" id="uid-err"></p></label>
        <label class="field"><span>Password</span>
          <input class="input" id="pw" type="password" autocomplete="current-password" placeholder="Your campus password">
          <p class="err" id="pw-err"></p></label>
        <button class="btn" type="submit">Log in</button>
        <p class="hint">Prototype: any ID and password work. Bookings are shared between everyone who logs in on this device.</p>
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
      logIn(id);
    });
  }
  function logIn(id) {
    setMe(id);
    state.lastId = id;
    if (!state.known.includes(id)) state.known.push(id);
    save();
    draft = null;
    const u = unread();
    go('home');
    if (u) toast(`You have ${u} new update${u > 1 ? 's' : ''} in My bookings.`);
  }

  // ---------------------------------------------------------------------------
  // Home: what's free now + your next booking
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
      actions = `<button class="btn on-blue" data-go="session/${b.id}">Open my timer</button>`;
    } else if (p === 'overtime') {
      k = 'Your time is up';
      actions = `<button class="btn on-blue" data-go="checkout/${b.id}">Check out now</button>`;
    } else if (p === 'checkin') {
      k = startsIn > 0 ? `Starts in ${startsIn} min · check-in is open` : 'Started · check in now';
      actions = `<button class="btn on-blue" data-go="checkin/${b.id}">Check in now</button><button class="btn on-blue outline" data-go="booked/${b.id}">View booking</button>`;
    } else {
      k = b.date === todayKey() ? `Today · check-in opens ${fmt(b.start - HANDOVER)}` : dayLabel(b.date, true);
      actions = `<button class="btn on-blue outline" data-go="booked/${b.id}">View booking</button><button class="btn on-blue outline" data-go="bookings">All my bookings</button>`;
    }
    const soon = (p === 'active' && left <= WARN) || p === 'overtime';
    return `<section class="next ${soon ? 'signal' : ''}" aria-label="Your next booking">
      <p class="k">${k}</p>
      <p class="t">${esc(it.name)}${b.whole ? ` <span class="pill">whole ${it.unit}</span>` : ''}</p>
      <p class="times">${fmt(b.start)}–${fmt(endOf(b))}</p>
      <div class="row">${actions}</div>
    </section>`;
  }

  function viewHome() {
    const q = ui.q.toLowerCase();
    const items = ITEMS.filter((i) => (ui.cat === 'All' || i.cat === ui.cat) && (!q || `${i.name} ${i.where} ${i.cat} ${i.kit.join(' ')}`.toLowerCase().includes(q)));
    const rank = { free: 0, busy: 1, full: 2, closed: 3 };
    const rows = items.map((i) => ({ i, s: statusNow(i) })).sort((a, b) => rank[a.s.kind] - rank[b.s.kind]);
    const pref = ui.prefDate && ui.prefDate !== todayKey() ? ui.prefDate : null;

    app.innerHTML = `
      ${topbar('Book a space', { right: `<button class="idchip" data-go="account" aria-label="Account ${esc(me)}">${esc(me)}</button>` })}
      ${clockline()}
      ${nextCard()}
      ${pref ? `<div class="prefbar">${I.cal}<span>Booking for <b>${dayLabel(pref, true)}</b></span><button class="iconbtn sm" id="clearpref" aria-label="Book for today instead">${I.x}</button></div>` : ''}
      <label class="search">${I.search}<input id="q" type="search" placeholder="Search rooms, machines or kit" value="${esc(ui.q)}" aria-label="Search rooms, machines or kit"></label>
      <div class="chips" role="group" aria-label="Filter by area">
        ${CATS.map((c) => `<button class="chip" data-cat="${c}" aria-pressed="${ui.cat === c}">${c}</button>`).join('')}
      </div>
      <h2 class="section-h">Right now <span>${rows.filter((r) => r.s.kind === 'free' || r.s.kind === 'busy').length} of ${rows.length} free</span></h2>
      <div class="panel"><ul class="list">
        ${rows.length ? rows.map(({ i, s }) => {
          const issues = (state.reports[i.id] || []).length;
          return `<li><button class="item" data-go="item/${i.id}" aria-label="${esc(i.name)}, ${esc(s.text)}. Open to book">
            <span class="glyph">${I[i.icon]}</span>
            <span class="main"><span class="name">${esc(i.name)}</span><br><span class="where">${esc(i.where)}</span><br>
              <span class="status ${s.kind}">${esc(s.text)}</span>${issues ? `<br><span class="issue">${issues} issue${issues > 1 ? 's' : ''} reported</span>` : ''}</span>
            ${i.cap > 1 && s.kind !== 'closed' ? `<span class="occ"><b>${s.n}/${i.cap}</b><span>here now</span></span>` : ''}
            <span class="go">${I.chev}</span>
          </button></li>`;
        }).join('') : `<li class="empty">Nothing matches “${esc(ui.q)}”. Try “room”, “printer” or “projector”.</li>`}
      </ul></div>
      <p class="foot">Prototype v3 · Mon–Fri 08:00–22:00 · Sat 10:00–18:00 · closed Sundays</p>`;

    $('#q').addEventListener('input', (e) => {
      ui.q = e.target.value;
      const pos = e.target.selectionStart;
      viewHome();
      const el = $('#q'); el.focus(); el.setSelectionRange(pos, pos);
    });
    $$('[data-cat]').forEach((b) => b.addEventListener('click', () => { ui.cat = b.dataset.cat; viewHome(); }));
    $('#clearpref')?.addEventListener('click', () => { ui.prefDate = null; viewHome(); });
  }

  // ---------------------------------------------------------------------------
  // Month calendar (used on the item screen and the Calendar tab)
  // ---------------------------------------------------------------------------
  const monthOf = (key) => key.slice(0, 7);
  const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };

  function monthGrid(month, selected, cell) {
    const [y, m] = month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const lead = (first.getDay() + 6) % 7; // weeks start on Monday
    const days = new Date(y, m, 0).getDate();
    const minM = monthOf(todayKey()), maxM = monthOf(lastDay());
    const title = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    let html = `<div class="cal" role="group" aria-label="${title}">
      <div class="cal-head"><button class="iconbtn sm" data-month="-1" ${month <= minM ? 'disabled' : ''} aria-label="Previous month">${I.back}</button>
        <b>${title}</b><button class="iconbtn sm" data-month="1" ${month >= maxM ? 'disabled' : ''} aria-label="Next month">${I.next}</button></div>
      <div class="cal-grid">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => `<span class="cal-dow">${d}</span>`).join('')}`;
    for (let i = 0; i < lead; i++) html += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const key = `${month}-${pad(d)}`;
      const c = cell(key);
      html += `<button class="cd ${c.cls}" data-date="${key}" aria-pressed="${key === selected}" ${c.off ? 'disabled' : ''} aria-label="${dayLabel(key, true)}: ${esc(c.label)}">
        <span class="cd-n">${d}</span>${c.mark || ''}</button>`;
    }
    return html + '</div></div>';
  }

  // ---------------------------------------------------------------------------
  // Item: pick a day on the calendar, then the sessions you need
  // ---------------------------------------------------------------------------
  function newDraft(it) {
    let date = ui.prefDate && !problemDay(ui.prefDate) ? ui.prefDate : todayKey();
    let guard = 0;
    while (!sessionsOf(date).length && guard++ < 10) date = addDays(date, 1);
    return { itemId: it.id, date, whole: false, start: null, end: null, editId: null, title: '', members: [], addons: [], repeat: 0 };
  }
  const problemDay = (key) => (key < todayKey() || key > lastDay() ? 'out' : !hoursOf(key) ? 'closed' : !sessionsOf(key).length ? 'over' : '');
  const need = (it, d) => (d.whole ? it.cap : it.cap > 1 ? 1 + d.members.length : 1);
  const exclOf = (d) => new Set(d.editId ? [d.editId] : []);

  function viewItem(id) {
    const it = itemById(id);
    if (!it) { go('home'); return; }
    if (!draft || draft.itemId !== id || (!draft.editId && problemDay(draft.date))) { draft = newDraft(it); ui.month = monthOf(draft.date); }
    if (!ui.month) ui.month = monthOf(draft.date);
    const d = draft;
    const excl = exclOf(d);
    const nd = need(it, d);
    const ss = sessionsOf(d.date);
    const reports = (state.reports[it.id] || []).slice(0, 2);
    const mineToday = state.bookings.filter((b) => b.itemId !== it.id && b.date === d.date && live(b) && b.status !== 'done' && isMine(b));
    const overl = d.start != null ? myOther(d.date, d.start, d.end, it.id) : [];
    const groups = [['Morning', 0, 720], ['Afternoon', 720, 1020], ['Evening', 1020, 1440]];

    const cellOf = (t) => {
      const u = usedAt(it, d.date, t, excl);
      const my = myAt(it, d.date, t, excl);
      const ok = fits(it, d.date, t, nd, d.whole, excl) && !my;
      const inSel = d.start != null && t >= d.start && t < d.end;
      let txt;
      if (my) txt = 'Your booking';
      else if (d.whole) txt = u === 0 ? `Empty, free` : u >= it.cap ? 'Booked' : `${u} ${u === 1 ? 'person' : 'people'} in`;
      else if (it.cap === 1) txt = u ? 'Booked' : 'Free';
      else txt = u >= it.cap ? 'Full' : u === 0 ? `All ${it.cap} free` : `${it.cap - u} of ${it.cap} free`;
      const role = inSel ? (t === d.start && t + SLOT === d.end ? 'one' : t === d.start ? 'first' : t + SLOT === d.end ? 'last' : 'mid') : '';
      const label = inSel ? (t === d.start ? 'Start' : t + SLOT === d.end ? `Ends ${fmt(d.end)}` : 'Selected') : txt;
      const meter = it.cap > 1 && !d.whole ? `<i class="bar" style="--u:${(u / it.cap) * 100}%"></i>` : '';
      return `<button class="ses ${ok ? '' : 'no'} ${my ? 'mine' : ''} ${inSel ? 'sel ' + role : ''}" data-t="${t}" ${ok || inSel ? '' : 'aria-disabled="true"'} aria-pressed="${inSel}"
        aria-label="${fmt(t)} to ${fmt(t + SLOT)}: ${esc(txt)}"><b>${fmt(t)}</b><small>${esc(label)}</small>${meter}</button>`;
    };

    const lengths = d.start != null ? LENGTHS.filter((L) => L <= it.max).map((L) => {
      const bad = problem(it, d.date, d.start, d.start + L, { whole: d.whole, need: nd, excl });
      return `<button class="chip" data-len="${L}" aria-pressed="${d.end - d.start === L}" ${bad ? 'disabled' : ''}>${durLabel(L)}</button>`;
    }).join('') : '';

    app.innerHTML = `
      ${topbar(d.editId ? 'Change booking' : it.name, { back: d.editId ? `booked/${d.editId}` : 'home' })}
      ${d.editId ? `<div class="banner calm slim"><b>Changing your ${esc(it.name)} booking</b>Pick a new day or time. Everyone on the booking gets the update.</div>` : ''}
      <p class="facts"><span>${esc(it.where)}</span><span><b>${it.cap === 1 ? '1 person' : `${it.cap} places`}</b></span><span>Up to <b>${durLabel(it.max)}</b> in one booking</span></p>
      <div class="kit">${it.kit.map((k) => `<span>${esc(k)}</span>`).join('')}</div>
      ${reports.map((r) => `<div class="report"><b>Reported ${esc(dayLabel(r.date))} at ${fmt(r.at)}</b>${esc(r.text || 'Something is broken or missing.')}</div>`).join('')}

      ${it.cap > 1 ? `<div class="seg" role="group" aria-label="What do you need?">
        <button data-whole="0" aria-pressed="${!d.whole}"><b>A place</b><small>Share the ${it.unit}${d.members.length ? `, ${nd} places` : ''}</small></button>
        <button data-whole="1" aria-pressed="${d.whole}"><b>Whole ${it.unit}</b><small>Just you and your group</small></button></div>` : ''}

      <h2 class="section-h">1. Pick a day <span>${dayLabel(d.date, true)}</span></h2>
      ${monthGrid(ui.month, d.date, (key) => {
        const pd = problemDay(key);
        if (pd === 'out') return { cls: 'past', off: true, label: 'not bookable' };
        if (pd === 'closed') return { cls: 'closed', off: true, label: 'closed' };
        if (pd === 'over') return { cls: 'past', off: true, label: 'closed for today' };
        const s = dayScore(it, key, d.whole, nd);
        const has = mine().some((b) => b.date === key && live(b) && b.status !== 'done');
        return { cls: s >= 0.5 ? 'free' : s > 0 ? 'some' : 'full', label: s >= 0.5 ? 'mostly free' : s > 0 ? 'filling up' : 'fully booked', mark: `<i class="cd-dot"></i>${has ? '<i class="cd-mine"></i>' : ''}` };
      })}
      <p class="legend"><span><i class="lg free"></i>Mostly free</span><span><i class="lg some"></i>Filling up</span><span><i class="lg full"></i>Full</span><span><i class="lg mine"></i>You have a booking</span></p>

      <h2 class="section-h">2. Pick your time <span>${d.whole ? `whole ${it.unit}` : it.cap > 1 ? 'places free' : '30-min sessions'}</span></h2>
      <p class="how">${d.start == null ? 'Tap the session you want to start with. Tap a later one to make the booking longer.' : `Tap a later session to book until then, or pick a length below.`}</p>
      ${mineToday.length && it.addon ? `<div class="match">${mineToday.map((b) => `<button class="chip outline" data-match="${b.id}">${I.link} Same time as ${esc(itemById(b.itemId).name)} · ${fmt(b.start)}–${fmt(endOf(b))}</button>`).join('')}</div>` : ''}
      ${ss.length ? groups.map(([g, a, z]) => {
        const part = ss.filter((t) => t >= a && t < z);
        return part.length ? `<h3 class="grp">${g}</h3><div class="sessions">${part.map(cellOf).join('')}</div>` : '';
      }).join('') : `<div class="panel empty">${hoursOf(d.date) ? 'Closed for today. Pick another day above.' : 'Closed on Sundays. Pick another day above.'}</div>`}
      ${d.start != null ? `<h2 class="section-h">How long?</h2><div class="chips wrap" role="group" aria-label="Booking length">${lengths}</div>` : ''}
      ${overl.length ? `<p class="note ok">${I.info}<span>You also have ${list(overl.map((b) => `${esc(itemById(b.itemId).name)} (${fmt(b.start)}–${fmt(endOf(b))})`))} then. That's fine, you can book both.</span></p>` : ''}

      <div class="dock"><div class="dock-in">
        <button class="btn" id="go" ${d.start == null ? 'disabled' : ''}>${d.start == null ? 'Pick a start time to continue' : `Review · ${dayLabel(d.date)}, ${fmt(d.start)}–${fmt(d.end)} <span class="btn-sub">${durLabel(d.end - d.start)}</span>`}</button>
      </div></div>`;

    $$('[data-month]').forEach((b) => b.addEventListener('click', () => { ui.month = shiftMonth(ui.month, Number(b.dataset.month)); viewItem(id); }));
    $$('.cal [data-date]').forEach((b) => b.addEventListener('click', () => {
      d.date = b.dataset.date; d.start = d.end = null; viewItem(id);
      $('.sessions')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
    }));
    $$('[data-whole]').forEach((b) => b.addEventListener('click', () => {
      d.whole = b.dataset.whole === '1';
      if (d.start != null && problem(it, d.date, d.start, d.end, { whole: d.whole, need: need(it, d), excl })) { toast(`Your time doesn't work for ${d.whole ? `the whole ${it.unit}` : 'a place'}. Pick again.`); d.start = d.end = null; }
      viewItem(id);
    }));
    $$('[data-len]').forEach((b) => b.addEventListener('click', () => { d.end = d.start + Number(b.dataset.len); viewItem(id); }));
    $$('[data-match]').forEach((b) => b.addEventListener('click', () => {
      const o = state.bookings.find((x) => x.id === b.dataset.match);
      const s = Math.max(o.start, ss[0] ?? o.start), e = Math.min(endOf(o), s + it.max);
      const why = problem(it, d.date, s, e, { whole: d.whole, need: nd, excl });
      if (why) { toast(why); return; }
      d.start = s; d.end = e;
      viewItem(id);
      if (e < endOf(o)) toast(`${durLabel(it.max)} is the longest booking here, so it ends at ${fmt(e)}.`);
    }));
    app.querySelectorAll('.sessions').forEach((g) => g.addEventListener('click', (e) => {
      const c = e.target.closest('[data-t]');
      if (c) pickSession(it, Number(c.dataset.t));
    }));
    $('#go').addEventListener('click', () => go('confirm'));
  }

  function pickSession(it, t) {
    const d = draft;
    const excl = exclOf(d);
    const nd = need(it, d);
    const fresh = () => {
      const why = problem(it, d.date, t, t + SLOT, { whole: d.whole, need: nd, excl });
      if (why) { toast(why); return; }
      d.start = t; d.end = t + SLOT;
    };
    if (d.start == null || t < d.start) fresh();
    else if (t === d.start && d.end === d.start + SLOT) { d.start = d.end = null; }
    else if (t < d.end) d.end = t + SLOT; // shorten
    else {
      const why = problem(it, d.date, d.start, t + SLOT, { whole: d.whole, need: nd, excl });
      if (!why) d.end = t + SLOT;
      else if (t + SLOT - d.start > it.max) { toast(why); }
      else {
        // something in between is taken: start a new booking at the tapped session instead
        const own = problem(it, d.date, t, t + SLOT, { whole: d.whole, need: nd, excl });
        if (own) { toast(own); return; }
        toast(`${why.replace(/\.$/, '')}. Started a new selection at ${fmt(t)}.`);
        d.start = t; d.end = t + SLOT;
      }
    }
    viewItem(it.id);
  }

  // ---------------------------------------------------------------------------
  // Review & confirm: who's coming, extra equipment, repeat weekly
  // ---------------------------------------------------------------------------
  // A booking right next to one of yours (same thing, same mode) is joined into one
  function mergePartner(it, d) {
    return state.bookings.find((b) => b.itemId === it.id && b.date === d.date && live(b) && ['booked', 'active'].includes(b.status) && b.owner === me
      && !!b.whole === !!d.whole && b.id !== d.editId && (b.end === d.start || b.start === d.end) && Math.max(b.end, d.end) - Math.min(b.start, d.start) <= it.max);
  }

  function addonState(a, d) {
    const s = d.start, e = Math.min(d.end, d.start + a.max);
    const already = mySame(a, d.date, s, e, null);
    if (already) return { ok: false, have: true, s, e, why: `Already yours ${fmt(already.start)}–${fmt(endOf(already))}` };
    const why = problem(a, d.date, s, e, { whole: false, need: 1 });
    return { ok: !why, s, e, why };
  }

  function viewConfirm() {
    if (!draft || draft.start == null) { go('home'); return; }
    const d = draft;
    const it = itemById(d.itemId);
    const nd = need(it, d);
    const excl = exclOf(d);
    const why = problem(it, d.date, d.start, d.end, { whole: d.whole, need: nd, excl });
    const partner = d.editId ? null : mergePartner(it, d);
    const overl = myOther(d.date, d.start, d.end, it.id);
    const addons = d.editId ? [] : ITEMS.filter((a) => a.addon && a.id !== it.id);
    const suggestions = [...new Set([...state.known, ...FRIENDS])].filter((x) => x !== me && !d.members.includes(x)).slice(0, 4);
    const editing = d.editId && state.bookings.find((b) => b.id === d.editId);

    app.innerHTML = `
      ${topbar(d.editId ? 'Review the change' : 'Review your booking', { back: `item/${it.id}` })}
      <div class="ticket">
        <p class="t-what">${esc(it.name)} ${d.whole ? `<span class="pill dark">whole ${it.unit}</span>` : it.cap > 1 ? `<span class="pill dark">${nd} place${nd > 1 ? 's' : ''}</span>` : ''}</p>
        <p class="bigtime">${fmt(d.start)}–${fmt(d.end)}</p>
        <p class="t-sub">${dayLabel(d.date, true)} · ${durLabel(d.end - d.start)} · ${esc(it.where)}</p>
        ${editing ? `<p class="t-was">Was ${dayLabel(editing.date)}, ${fmt(editing.start)}–${fmt(endOf(editing))}</p>` : ''}
      </div>
      ${partner ? `<p class="note good">${I.link}<span>This joins your ${fmt(partner.start)}–${fmt(partner.end)} booking, so you get one booking: <b>${fmt(Math.min(partner.start, d.start))}–${fmt(Math.max(partner.end, d.end))}</b>.</span></p>` : ''}
      ${why ? `<p class="note bad">${I.info}<span>${esc(why)}</span></p>` : ''}

      <h2 class="section-h">What's it for? <span>optional</span></h2>
      <input class="input" id="title" maxlength="60" placeholder="${it.cat === 'Study rooms' ? 'e.g. GUI Design group work' : 'e.g. Prototype parts'}" value="${esc(d.title)}">

      <h2 class="section-h">Who's coming? <span>${it.cap > 1 && !d.whole ? 'each person takes a place' : 'they get the booking too'}</span></h2>
      <div class="people">
        <span class="person me">${I.user} You · ${esc(me)}</span>
        ${d.members.map((m) => `<span class="person">${esc(m)}<button data-rm="${esc(m)}" aria-label="Remove ${esc(m)}">${I.x}</button></span>`).join('')}
      </div>
      <form class="invite" id="inv"><input class="input" id="invid" placeholder="Add a student ID" autocapitalize="characters" maxlength="12" aria-label="Student ID to invite"><button class="btn ghost" type="submit">${I.plus} Add</button></form>
      ${suggestions.length ? `<div class="chips wrap sugg">${suggestions.map((s) => `<button class="chip outline" data-add="${s}">${I.plus} ${s}</button>`).join('')}</div>` : ''}

      ${addons.length ? `<h2 class="section-h">Add equipment for the same time</h2>
      <div class="panel addons">${addons.map((a) => {
        const st = addonState(a, d);
        const on = d.addons.includes(a.id);
        return `<button class="addon ${on ? 'on' : ''}" data-addon="${a.id}" ${st.ok ? '' : 'aria-disabled="true"'} aria-pressed="${on}">
          <span class="glyph sm">${I[a.icon]}</span>
          <span class="main"><b>${esc(a.name)}</b><span class="small ${st.ok ? 'free' : 'muted'}">${st.ok ? `Free ${fmt(st.s)}–${fmt(st.e)}${st.e < d.end ? ` (${durLabel(a.max)} max)` : ''}` : esc(st.why)}</span></span>
          <span class="tick">${on ? I.check : st.ok ? I.plus : ''}</span></button>`;
      }).join('')}</div>` : ''}

      ${d.editId ? '' : `<h2 class="section-h">Repeat <span>same time every week</span></h2>
      <div class="seg three" role="group" aria-label="Repeat weekly">
        ${[[0, 'Just once'], [4, '4 weeks'], [8, '8 weeks']].map(([n, l]) => `<button data-rep="${n}" aria-pressed="${d.repeat === n}"><b>${l}</b></button>`).join('')}
      </div>`}

      ${overl.length ? `<p class="note ok">${I.info}<span>You also have ${list(overl.map((b) => `${esc(itemById(b.itemId).name)} (${fmt(b.start)}–${fmt(endOf(b))})`))} then. You can keep both.</span></p>` : ''}
      <div class="rules">
        <p class="rule">${I.info}<span>Check in from <b>${fmt(d.start - HANDOVER)}</b> and report anything broken before you start.</span></p>
        <p class="rule">${I.info}<span>At <b>${fmt(d.end - WARN)}</b> you get a 5-minute warning to pack up. The next person can check in from then, so hand over on time.</span></p>
        ${it.rules.map((r) => `<p class="rule">${I.info}<span>${esc(r)}</span></p>`).join('')}
      </div>
      <div class="dock"><div class="dock-in"><button class="btn" id="ok" ${why ? 'disabled' : ''}>${d.editId ? 'Save the change' : `Book ${esc(it.name)} · ${fmt(d.start)}–${fmt(d.end)}`}</button></div></div>`;

    $('#title').addEventListener('input', (e) => { d.title = e.target.value; });
    const tryAdd = (raw) => {
      const id = raw.trim().toUpperCase();
      if (!/^[A-Z0-9-]{3,12}$/.test(id)) { toast('Enter a student ID, for example S-1033.'); return; }
      if (id === me) { toast("That's you."); return; }
      if (d.members.includes(id)) { toast(`${id} is already on this booking.`); return; }
      if (it.cap > 1 && !d.whole && d.members.length + 2 > it.cap) { toast(`The ${it.unit} only has ${it.cap} places. Book the whole ${it.unit} instead.`); return; }
      const after = { ...d, members: [...d.members, id] };
      const p2 = problem(it, d.date, d.start, d.end, { whole: d.whole, need: need(it, after), excl });
      if (p2) { toast(`${p2} Book the whole ${it.unit} or pick another time.`); return; }
      d.members.push(id);
      viewConfirm();
    };
    $('#inv').addEventListener('submit', (e) => { e.preventDefault(); tryAdd($('#invid').value); });
    $$('[data-add]').forEach((b) => b.addEventListener('click', () => tryAdd(b.dataset.add)));
    $$('[data-rm]').forEach((b) => b.addEventListener('click', () => { d.members = d.members.filter((m) => m !== b.dataset.rm); viewConfirm(); }));
    $$('[data-addon]').forEach((b) => b.addEventListener('click', () => {
      const a = itemById(b.dataset.addon);
      const st = addonState(a, d);
      if (!st.ok && !d.addons.includes(a.id)) { toast(`${a.name}: ${st.why}`); return; }
      d.addons = d.addons.includes(a.id) ? d.addons.filter((x) => x !== a.id) : [...d.addons, a.id];
      viewConfirm();
    }));
    $$('[data-rep]').forEach((b) => b.addEventListener('click', () => { d.repeat = Number(b.dataset.rep); viewConfirm(); }));
    $('#ok').addEventListener('click', () => commit(it));
  }

  function commit(it) {
    const d = draft;
    const excl = exclOf(d);
    const why = problem(it, d.date, d.start, d.end, { whole: d.whole, need: need(it, d), excl });
    if (why) { toast(`Someone was faster. ${why}`); go(`item/${it.id}`); return; }
    const soon = (key, s) => ts(key, s) - HANDOVER * 60000 <= now().getTime();

    if (d.editId) {
      const b = state.bookings.find((x) => x.id === d.editId);
      const was = `${dayLabel(b.date)} ${fmt(b.start)}–${fmt(endOf(b))}`;
      Object.assign(b, { date: d.date, start: d.start, end: d.end, whole: d.whole, title: d.title.trim(), members: [...d.members], reminded: soon(d.date, d.start), warned: false });
      const ids = notify(b, `moved ${it.name} from ${was} to ${dayLabel(b.date)} ${fmt(b.start)}–${fmt(b.end)}`);
      save(); draft = null;
      toast(`Booking changed.${sentTo(ids)}`);
      go(`booked/${b.id}`);
      return;
    }

    const group = uid();
    const make = (item, key, s, e, extra = {}) => ({ id: uid(), itemId: item.id, date: key, start: s, end: e, whole: item.cap > 1 && d.whole && item.id === it.id, owner: me, members: [...d.members],
      title: d.title.trim(), status: 'booked', created: Date.now(), group, reminded: soon(key, s), log: [{ at: now().getTime(), by: me, text: 'booked it' }], ...extra });

    let main;
    const partner = mergePartner(it, d);
    if (partner) {
      partner.start = Math.min(partner.start, d.start);
      partner.end = Math.max(partner.end, d.end);
      partner.members = [...new Set([...(partner.members || []), ...d.members])];
      if (d.title.trim() && !partner.title) partner.title = d.title.trim();
      partner.warned = false;
      main = partner;
      main.group = main.group || group;
    } else {
      main = make(it, d.date, d.start, d.end);
      state.bookings.push(main);
    }
    const made = { addons: [], weeks: 0, skipped: [], merged: !!partner };
    for (const aid of d.addons) {
      const a = itemById(aid);
      const st = addonState(a, d);
      if (!st.ok) { made.skipped.push(`${a.name} (${st.why.toLowerCase()})`); continue; }
      state.bookings.push(make(a, d.date, st.s, st.e, { group: main.group, places: 1 }));
      made.addons.push(`${a.name} ${fmt(st.s)}–${fmt(st.e)}`);
    }
    if (d.repeat) {
      const series = uid();
      main.series = series;
      for (let w = 1; w < d.repeat; w++) {
        const key = addDays(d.date, 7 * w);
        const p = problem(it, key, d.start, d.end, { whole: d.whole, need: need(it, d) });
        if (p) { made.skipped.push(`${dayLabel(key)} (${p.toLowerCase().replace(/\.$/, '')})`); continue; }
        state.bookings.push(make(it, key, d.start, d.end, { series }));
        made.weeks++;
      }
    }
    const ids = partner ? notify(main, `made ${it.name} longer: now ${fmt(main.start)}–${fmt(main.end)}`) : notify(main, `added you to ${it.name}, ${dayLabel(main.date)} ${fmt(main.start)}–${fmt(main.end)}`);
    made.sent = ids;
    save();
    ui.flash = { id: main.id, ...made };
    draft = null;
    go(`booked/${main.id}`);
  }

  // ---------------------------------------------------------------------------
  // Booking details
  // ---------------------------------------------------------------------------
  function viewBooked(id) {
    const b = state.bookings.find((x) => x.id === id);
    if (!b || !isMine(b)) { go('bookings'); return; }
    const it = itemById(b.itemId);
    const p = phase(b);
    if (draft && draft.editId) draft = null;
    const flash = ui.flash && ui.flash.id === id ? ui.flash : null;
    ui.flash = null;
    const tag = PHASE_TAG[p];
    const linked = state.bookings.filter((x) => x.group && x.group === b.group && x.id !== b.id && live(x) && x.date === b.date);
    const series = b.series ? sorted(state.bookings.filter((x) => x.series === b.series && live(x) && OPEN_PHASES.includes(phase(x)))) : [];
    const people = [...new Set([b.owner, ...(b.members || [])])];
    const email = `${me.toLowerCase().replace(/[^a-z0-9]/g, '')}@campus.example`;
    const open = ['upcoming', 'checkin'].includes(p);

    app.innerHTML = `
      ${topbar(flash ? '' : 'Booking', { back: flash ? null : 'bookings' })}
      ${flash ? `<div class="done-mark">${I.check}</div><h2 class="done-h">${flash.merged ? 'Booking made longer' : "You're booked"}</h2>` : `<span class="tag ${tag[1]}">${tag[0]}</span>`}
      <p class="bigtime">${fmt(b.start)}–${fmt(endOf(b))}</p>
      <p class="muted">${esc(it.name)}${b.whole ? ` · whole ${it.unit}` : ''} · ${dayLabel(b.date, true)} · ${durLabel(endOf(b) - b.start)}</p>
      ${b.title ? `<p class="purpose">“${esc(b.title)}”</p>` : ''}
      ${flash && (flash.addons.length || flash.weeks || flash.skipped.length || flash.sent.length) ? `<div class="panel made">
        ${flash.addons.map((a) => `<p>${I.check}<span>Also booked: <b>${esc(a)}</b></span></p>`).join('')}
        ${flash.weeks ? `<p>${I.repeat}<span>Repeats weekly: <b>${flash.weeks} more ${dateOf(b.date).toLocaleDateString('en-GB', { weekday: 'long' })}s</b> booked</span></p>` : ''}
        ${flash.sent.length ? `<p>${I.bell}<span>Sent to <b>${esc(list(flash.sent))}</b></span></p>` : ''}
        ${flash.skipped.map((s) => `<p class="skip">${I.info}<span>Not booked: ${esc(s)}</span></p>`).join('')}
      </div>` : ''}

      <div class="actions">
        ${p === 'checkin' ? `<button class="btn" data-go="checkin/${b.id}">Check in to ${esc(it.name)}</button>` : ''}
        ${p === 'active' || p === 'overtime' ? `<button class="btn" data-go="session/${b.id}">Open my timer</button>` : ''}
        ${open && b.owner === me ? `<button class="btn ghost" id="edit">${I.cal} Change day or time</button>` : ''}
        ${open ? `<button class="btn ghost" id="ics">${I.cal} Add to my phone calendar</button>` : ''}
        ${flash ? `<button class="btn ghost" data-go="home">Book something else</button>` : ''}
      </div>

      <h2 class="section-h">On this booking <span>${people.length} ${people.length === 1 ? 'person' : 'people'}</span></h2>
      <div class="panel">${people.map((x) => `<div class="kv"><span>${I.user} ${esc(x)}${x === me ? ' (you)' : ''}</span><b>${x === b.owner ? 'Booked it' : 'Invited · notified'}</b></div>`).join('')}</div>

      ${linked.length ? `<h2 class="section-h">Booked together</h2><div class="panel">${linked.map((x) => `<button class="kv link" data-go="booked/${x.id}"><span>${I[itemById(x.itemId).icon]} ${esc(itemById(x.itemId).name)}</span><b>${fmt(x.start)}–${fmt(endOf(x))} ${I.chev}</b></button>`).join('')}</div>` : ''}
      ${series.length > 1 ? `<h2 class="section-h">Every week <span>${series.length} coming up</span></h2><div class="panel">${series.slice(0, 8).map((x) => `<button class="kv link ${x.id === b.id ? 'here' : ''}" data-go="booked/${x.id}"><span>${dayLabel(x.date, true)}</span><b>${fmt(x.start)}–${fmt(endOf(x))} ${I.chev}</b></button>`).join('')}</div>` : ''}

      <div class="mail">
        <p class="from">Email to ${esc(email)} <span class="demo-flag">simulated</span></p>
        <b>Booking confirmed: ${esc(it.name)}, ${fmt(b.start)}–${fmt(endOf(b))}</b>
        <p class="muted small">${esc(it.where)} · ${dayLabel(b.date, true)} · check in from ${fmt(b.start - HANDOVER)}</p>
      </div>
      <h2 class="section-h">Reminders</h2>
      <div class="panel">
        <label class="toggle"><span>Remind me when check-in opens (${HANDOVER} min before)</span><span class="switch"><input type="checkbox" id="r1" ${state.prefs.remindStart ? 'checked' : ''}><i></i></span></label>
        <label class="toggle"><span>Warn me ${WARN} min before the end</span><span class="switch"><input type="checkbox" id="r2" ${state.prefs.warnEnd ? 'checked' : ''}><i></i></span></label>
      </div>
      ${(b.log || []).length > 1 ? `<h2 class="section-h">History</h2><div class="panel log">${[...b.log].reverse().map((l) => `<p><b>${esc(l.by)}</b> ${esc(l.text)} <span>${new Date(l.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></p>`).join('')}</div>` : ''}
      ${open ? `<button class="btn danger" id="cancel" style="margin-top:18px">${b.owner === me ? 'Cancel this booking' : 'Leave this booking'}</button>` : ''}`;

    $('#r1').addEventListener('change', (e) => { state.prefs.remindStart = e.target.checked; save(); });
    $('#r2').addEventListener('change', (e) => { state.prefs.warnEnd = e.target.checked; save(); });
    $('#ics')?.addEventListener('click', () => downloadIcs(b));
    $('#edit')?.addEventListener('click', () => {
      draft = { itemId: it.id, date: b.date, whole: !!b.whole, start: b.start, end: b.end, editId: b.id, title: b.title || '', members: [...(b.members || [])], addons: [], repeat: 0 };
      ui.month = monthOf(b.date);
      go(`item/${it.id}`);
    });
    $('#cancel')?.addEventListener('click', () => cancelSheet(b, linked.filter((x) => OPEN_PHASES.includes(phase(x))), series));
  }

  function cancelSheet(b, linked, series) {
    const it = itemById(b.itemId);
    if (b.owner !== me) {
      sheet(`<h2>Leave this booking?</h2><p class="muted sheet-p">${esc(it.name)}, ${fmt(b.start)}–${fmt(endOf(b))}. ${esc(b.owner)} keeps it and gets told.</p>
        <button class="btn danger" id="yes">Leave booking</button><button class="btn ghost" id="no">Stay on it</button>`, (el, close) => {
        $('#no', el).onclick = close;
        $('#yes', el).onclick = () => { b.members = b.members.filter((m) => m !== me); notify(b, `left ${it.name}, ${dayLabel(b.date)} ${fmt(b.start)}`); save(); close(); toast(`You left the booking. ${b.owner} was told.`); go('bookings'); };
      });
      return;
    }
    const opts = [['one', linked.length ? `Cancel only ${it.name}` : 'Cancel this booking']];
    if (linked.length) opts.unshift(['bundle', `Cancel ${it.name} and ${list(linked.map((x) => itemById(x.itemId).name))}`]);
    if (series.length > 1) opts.push(['series', `Cancel all ${series.length} weekly bookings`]);
    sheet(`<h2>Cancel ${esc(it.name)}?</h2><p class="muted sheet-p">${dayLabel(b.date, true)}, ${fmt(b.start)}–${fmt(endOf(b))}. The time is free for others straight away${(b.members || []).length ? ', and everyone on the booking is told' : ''}.</p>
      ${opts.map(([k, l]) => `<button class="btn danger" data-c="${k}">${esc(l)}</button>`).join('')}<button class="btn ghost" id="no">Keep it</button>`, (el, close) => {
      $('#no', el).onclick = close;
      $$('[data-c]', el).forEach((btn) => btn.addEventListener('click', () => {
        const k = btn.dataset.c;
        const set = k === 'bundle' ? [b, ...linked] : k === 'series' ? series : [b];
        let ids = [];
        for (const x of set) { x.status = 'cancelled'; ids = [...new Set([...ids, ...notify(x, `cancelled ${itemById(x.itemId).name}, ${dayLabel(x.date)} ${fmt(x.start)}–${fmt(endOf(x))}`)])]; }
        save(); close();
        toast(`${set.length > 1 ? `${set.length} bookings` : 'Booking'} cancelled. The time is free again.${sentTo(ids)}`);
        go('bookings');
      }));
    });
  }

  function downloadIcs(b) {
    const it = itemById(b.itemId);
    const stamp = (ms) => { const d = new Date(ms); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`; };
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Campus Booking//v3//EN', 'BEGIN:VEVENT',
      `UID:${b.id}@campus-booking`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(ts(b.date, b.start))}`, `DTEND:${stamp(ts(b.date, endOf(b)))}`,
      `SUMMARY:${it.name}${b.title ? ` – ${b.title}` : ''}`, `LOCATION:${it.where}`, `DESCRIPTION:Booked with ID ${b.owner}. Check in from ${fmt(b.start - HANDOVER)}.`,
      'BEGIN:VALARM', `TRIGGER:-PT${HANDOVER}M`, 'ACTION:DISPLAY', 'DESCRIPTION:Check-in is open', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = `${it.name.replace(/\s+/g, '-')}-${b.date}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------------------------------------------------------------------------
  // My bookings
  // ---------------------------------------------------------------------------
  function bookingRow(b) {
    const it = itemById(b.itemId);
    const p = phase(b);
    const [t, c] = PHASE_TAG[p];
    const d = dateOf(b.date);
    const quick = p === 'checkin' ? `<button class="mini" data-go="checkin/${b.id}">Check in</button>` : p === 'active' || p === 'overtime' ? `<button class="mini" data-go="session/${b.id}">Timer</button>` : `<span class="go">${I.chev}</span>`;
    const extra = [b.whole && `Whole ${it.unit}`, (b.members || []).length && `+${b.members.length} ${b.members.length === 1 ? 'person' : 'people'}`, b.owner !== me && `From ${b.owner}`, b.series && 'Weekly'].filter(Boolean);
    return `<div class="bk">
      <button class="bk-main" data-go="booked/${b.id}" aria-label="${esc(it.name)}, ${dayLabel(b.date, true)} ${fmt(b.start)} to ${fmt(endOf(b))}, ${t}. View booking">
        <span class="when"><b>${d.getDate()}</b><small>${d.toLocaleDateString('en-GB', { month: 'short' })}</small></span>
        <span class="main"><b>${esc(it.name)}</b><span class="muted small">${fmt(b.start)}–${fmt(endOf(b))} · ${dayLabel(b.date)}${b.title ? ` · ${esc(b.title)}` : ''}</span>
          <span class="tags"><span class="tag ${c}">${t}</span>${extra.map((x) => `<span class="tag soft">${esc(x)}</span>`).join('')}</span></span>
      </button>${quick}</div>`;
  }

  function viewBookings() {
    const all = sorted(mine());
    const open = all.filter((b) => OPEN_PHASES.includes(phase(b)));
    const today = open.filter((b) => b.date === todayKey());
    const later = open.filter((b) => b.date !== todayKey());
    const past = all.filter((b) => !open.includes(b)).reverse();
    const inbox = state.inbox[me] || [];
    const fresh = inbox.filter((m) => !m.read);
    app.innerHTML = `
      ${topbar('My bookings', { right: `<button class="iconbtn" data-go="calendar" aria-label="Show in calendar">${I.cal}</button>` })}
      ${fresh.length ? `<section class="updates"><h2>${I.bell} ${fresh.length} new update${fresh.length > 1 ? 's' : ''}</h2>
        ${fresh.slice(0, 5).map((m) => `<button class="upd" data-go="booked/${m.bid}">${esc(m.text)}<span>${new Date(m.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></button>`).join('')}
        <button class="linkbtn" id="read">Mark all as read</button></section>` : ''}
      <h2 class="section-h">Today <span>${today.length || ''}</span></h2>
      <div class="panel">${today.length ? today.map(bookingRow).join('') : `<p class="empty">Nothing booked for today. <button class="linkbtn" data-go="home">Book a space</button></p>`}</div>
      <h2 class="section-h">Coming up <span>${later.length || ''}</span></h2>
      <div class="panel">${later.length ? later.map(bookingRow).join('') : `<p class="empty">No upcoming bookings. <button class="linkbtn" data-go="calendar">Plan ahead in the calendar</button></p>`}</div>
      ${past.length ? `<h2 class="section-h">Earlier <span>${past.length}</span></h2><div class="panel">${(ui.showPast ? past : past.slice(0, 3)).map(bookingRow).join('')}
        ${past.length > 3 ? `<button class="btn ghost flat" id="past">${ui.showPast ? 'Show fewer' : `Show all ${past.length}`}</button>` : ''}</div>` : ''}`;
    $('#read')?.addEventListener('click', () => { inbox.forEach((m) => { m.read = true; }); save(); render(); });
    $('#past')?.addEventListener('click', () => { ui.showPast = !ui.showPast; viewBookings(); });
  }

  // ---------------------------------------------------------------------------
  // Calendar tab: a month of your bookings
  // ---------------------------------------------------------------------------
  function viewCalendar() {
    if (!ui.calDay) ui.calDay = todayKey();
    if (!ui.calMonth) ui.calMonth = monthOf(ui.calDay);
    const all = mine().filter((b) => live(b));
    const on = (key) => sorted(all.filter((b) => b.date === key));
    const sel = ui.calDay;
    const day = on(sel);
    const pd = problemDay(sel);
    app.innerHTML = `
      ${topbar('Calendar')}
      ${monthGrid(ui.calMonth, sel, (key) => {
        const n = on(key).filter((b) => b.status !== 'cancelled').length;
        const past = key < todayKey();
        const closed = !hoursOf(key);
        return { cls: `${past ? 'past' : ''} ${closed ? 'closed' : ''} ${key === todayKey() ? 'today' : ''}`, off: key > lastDay(), label: n ? `${n} booking${n > 1 ? 's' : ''}` : closed ? 'closed' : 'nothing booked',
          mark: n ? `<span class="cd-count">${n > 3 ? '3+' : '•'.repeat(n)}</span>` : '' };
      })}
      <h2 class="section-h">${dayLabel(sel, true)} <span>${pd === 'closed' ? 'closed' : hoursOf(sel) ? `open ${fmt(hoursOf(sel).open)}–${fmt(hoursOf(sel).close)}` : ''}</span></h2>
      ${day.length ? `<div class="agenda">${day.map((b) => {
        const it = itemById(b.itemId);
        return `<button class="ag" data-go="booked/${b.id}"><span class="ag-t">${fmt(b.start)}<small>${fmt(endOf(b))}</small></span>
          <span class="ag-b"><b>${esc(it.name)}</b><small>${esc(b.title || it.where)}${b.whole ? ` · whole ${it.unit}` : ''}</small><span class="tag ${PHASE_TAG[phase(b)][1]}">${PHASE_TAG[phase(b)][0]}</span></span>${I.chev}</button>`;
      }).join('')}</div>` : `<div class="panel empty">${pd === 'closed' ? 'Campus is closed on Sundays.' : 'Nothing booked on this day.'}</div>`}
      ${!pd ? `<button class="btn" id="bookday" style="margin-top:14px">${I.plus} Book something on ${dayLabel(sel)}</button>` : ''}`;
    $$('[data-month]').forEach((b) => b.addEventListener('click', () => { ui.calMonth = shiftMonth(ui.calMonth, Number(b.dataset.month)); viewCalendar(); }));
    $$('.cal [data-date]').forEach((b) => b.addEventListener('click', () => { ui.calDay = b.dataset.date; viewCalendar(); }));
    $('#bookday')?.addEventListener('click', () => { ui.prefDate = sel; draft = null; ui.month = null; go('home'); toast(`Pick what you want to book on ${dayLabel(sel, true)}.`); });
  }

  // ---------------------------------------------------------------------------
  // Account
  // ---------------------------------------------------------------------------
  function viewAccount() {
    const n = mine().filter((b) => OPEN_PHASES.includes(phase(b))).length;
    const knownIds = state.known.filter((x) => x !== me);
    app.innerHTML = `
      ${topbar('Account')}
      <div class="profile"><span class="avatar">${esc(me.replace(/[^A-Z0-9]/g, '').slice(0, 2))}</span><div><b>${esc(me)}</b><span class="muted small">${n} open booking${n === 1 ? '' : 's'}</span></div></div>
      <h2 class="section-h">Notifications</h2>
      <div class="panel">
        <label class="toggle"><span>Remind me when check-in opens</span><span class="switch"><input type="checkbox" id="r1" ${state.prefs.remindStart ? 'checked' : ''}><i></i></span></label>
        <label class="toggle"><span>Warn me ${WARN} min before the end</span><span class="switch"><input type="checkbox" id="r2" ${state.prefs.warnEnd ? 'checked' : ''}><i></i></span></label>
      </div>
      <h2 class="section-h">Switch person <span>for testing sharing</span></h2>
      <p class="how">Log in as a friend to see what they see: bookings they were added to, and rooms you booked showing as taken. Two browser tabs also work side by side.</p>
      <div class="chips wrap">${[...new Set([...knownIds, ...FRIENDS])].filter((x) => x !== me).slice(0, 5).map((x) => `<button class="chip outline" data-as="${x}">${I.user} ${x}</button>`).join('')}</div>
      <h2 class="section-h">House rules</h2>
      <div class="rules">
        <p class="rule">${I.info}<span>Bookings run in 30-minute sessions, back to back. Book as many sessions in a row as you need, up to each space's limit.</span></p>
        <p class="rule">${I.info}<span>5 minutes before your end you get a warning to pack up. That's when the next person can check in.</span></p>
        <p class="rule">${I.info}<span>Report anything broken when you check in, so it isn't put on you.</span></p>
      </div>
      <button class="btn ghost" id="out" style="margin-top:18px">Log out</button>
      <button class="btn danger" id="wipe">Reset all demo data</button>`;
    $('#r1').addEventListener('change', (e) => { state.prefs.remindStart = e.target.checked; save(); });
    $('#r2').addEventListener('change', (e) => { state.prefs.warnEnd = e.target.checked; save(); });
    $$('[data-as]').forEach((b) => b.addEventListener('click', () => { logIn(b.dataset.as); toast(`Now logged in as ${b.dataset.as}.`); }));
    $('#out').addEventListener('click', () => { setMe(null); draft = null; go('home'); });
    $('#wipe').addEventListener('click', () => {
      sheet(`<h2>Reset all demo data?</h2><p class="muted sheet-p">Deletes every booking, report and update on this device, for all IDs.</p>
        <button class="btn danger" id="y">Reset everything</button><button class="btn ghost" id="n">Keep it</button>`, (el, close) => {
        $('#n', el).onclick = close; $('#y', el).onclick = () => { close(); resetAll(); };
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Check in + report damage
  // ---------------------------------------------------------------------------
  function viewCheckin(id) {
    const b = state.bookings.find((x) => x.id === id);
    if (!b || !isMine(b)) { go('home'); return; }
    const it = itemById(b.itemId);
    const p = phase(b);
    if (p === 'active' || p === 'overtime') { go(`session/${id}`); return; }
    if (p !== 'checkin') {
      app.innerHTML = `${topbar('Check in', { back: `booked/${id}` })}
        <div class="banner calm"><b>${p === 'upcoming' ? `Check-in opens at ${fmt(b.start - HANDOVER)}` : 'This booking is over'}</b>${esc(it.name)}, ${dayLabel(b.date, true)}, ${fmt(b.start)}–${fmt(endOf(b))}</div>`;
      return;
    }
    const sibs = state.bookings.filter((x) => x.group && x.group === b.group && x.id !== b.id && phase(x) === 'checkin');
    let photo = null;
    app.innerHTML = `
      ${topbar('Check in', { back: `booked/${id}` })}
      <p class="lead2">${esc(it.name)} · ${fmt(b.start)}–${fmt(endOf(b))}${(b.members || []).length ? ` · for you and ${b.members.length} other${b.members.length > 1 ? 's' : ''}` : ''}</p>
      <p class="muted" style="margin:0 2px 14px">Is everything OK before you start?</p>
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
        <p class="muted small" style="margin-top:8px">Saved under your ID, so the last person is asked about it, not you.</p>
      </div>
      ${sibs.length ? `<h2 class="section-h">Booked together</h2><div class="checks">${sibs.map((s) => `<label class="check"><input type="checkbox" class="sib" value="${s.id}" checked> Also check in to ${esc(itemById(s.itemId).name)} (${fmt(s.start)}–${fmt(endOf(s))})</label>`).join('')}</div>` : ''}
      <div class="dock"><div class="dock-in"><button class="btn" id="start">Start my session</button></div></div>`;

    $('#c3').addEventListener('change', () => { $('#dmg').hidden = !$('#c3').checked; });
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
        (state.reports[it.id] = state.reports[it.id] || []).unshift({ date: todayKey(), at: Math.floor(nowMin()), text, photo, by: me });
      }
      b.status = 'active'; b.checkedIn = Date.now();
      $$('.sib:checked').forEach((c) => { const s = state.bookings.find((x) => x.id === c.value); if (s) { s.status = 'active'; s.checkedIn = Date.now(); } });
      if ((b.members || []).length || b.owner !== me) notify(b, `checked in to ${it.name}`);
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
  // In use: countdown, more time, hand over
  // ---------------------------------------------------------------------------
  const R = 92, CIRC = 2 * Math.PI * R;

  function canExtend(b, mins) {
    const it = itemById(b.itemId);
    const e = endOf(b);
    const h = hoursOf(b.date);
    if (e + mins > h.close) return { ok: false, why: `Closes at ${fmt(h.close)}` };
    if (e + mins - b.start > it.max) return { ok: false, why: `${durLabel(it.max)} is the limit` };
    const p = problem(it, b.date, e, e + mins, { whole: !!b.whole, need: weight(it, b), excl: new Set([b.id]) });
    if (p) return { ok: false, why: 'Next session is booked' };
    return { ok: true, why: `until ${fmt(e + mins)}` };
  }
  const joinable = (b) => state.bookings.find((x) => x.id !== b.id && x.itemId === b.itemId && x.date === b.date && isMine(x) && x.status === 'booked' && x.start === endOf(b) && !!x.whole === !!b.whole);

  function viewSession(id) {
    const b = state.bookings.find((x) => x.id === id);
    if (!b || !isMine(b)) { go('home'); return; }
    const p = phase(b);
    if (p === 'checkin' || p === 'upcoming') { go(`checkin/${id}`); return; }
    if (p !== 'active' && p !== 'overtime') { go(`booked/${id}`); return; }
    const it = itemById(b.itemId);
    const j = joinable(b);
    const opts = [30, 60].map((m) => ({ m, ...canExtend(b, m) }));
    const people = [...new Set([b.owner, ...(b.members || [])])];
    app.innerHTML = `
      ${topbar('In use', { back: 'home', right: `<span class="idchip">${esc(me)}</span>` })}
      <p class="ends">${esc(it.name)} · ends at <b>${fmt(endOf(b))}</b></p>
      <div class="ring-wrap" id="ring">
        <svg viewBox="0 0 212 212" aria-hidden="true"><circle class="ring-bg" cx="106" cy="106" r="${R}" fill="none" stroke-width="14"/>
          <circle class="ring-fg" id="arc" cx="106" cy="106" r="${R}" fill="none" stroke-width="14" stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="0"/></svg>
        <div class="ring-label"><div><b id="left">--:--</b><span id="leftlbl">left</span></div></div>
      </div>
      <div id="banner"></div>
      <h2 class="section-h">Need more time? <span>adds the next sessions</span></h2>
      ${j ? `<button class="btn ghost" id="join">${I.link} Join with your ${fmt(j.start)}–${fmt(j.end)} booking</button>` : ''}
      <div class="ext">${opts.map((o) => `<button class="extb" data-ext="${o.m}" ${o.ok ? '' : 'disabled'}><b>+${durLabel(o.m)}</b><small>${esc(o.why)}</small></button>`).join('')}</div>
      ${people.length > 1 ? `<p class="note ok">${I.people}<span>On this booking: ${esc(list(people.map((x) => (x === me ? 'you' : x))))}. They get any change straight away.</span></p>` : ''}
      <div class="dock"><div class="dock-in"><button class="btn" id="fin">Finish and check out</button></div></div>`;

    $$('[data-ext]').forEach((btn) => btn.addEventListener('click', () => {
      const m = Number(btn.dataset.ext);
      const e2 = canExtend(b, m);
      if (!e2.ok) { toast(e2.why); return; }
      b.end = endOf(b) + m; delete b.endedMin; b.warned = false;
      const ids = notify(b, `extended ${it.name} until ${fmt(b.end)}`);
      save();
      toast(`Done, you now have until ${fmt(b.end)}.${sentTo(ids)}`);
      viewSession(id);
    }));
    $('#join')?.addEventListener('click', () => {
      b.end = j.end; b.warned = false; j.status = 'cancelled'; j.mergedInto = b.id;
      b.members = [...new Set([...(b.members || []), ...(j.members || [])])];
      const ids = notify(b, `joined two bookings: ${it.name} now ${fmt(b.start)}–${fmt(b.end)}`);
      save();
      toast(`Joined. You now have until ${fmt(b.end)}.${sentTo(ids)}`);
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
    el.textContent = a >= 3600 ? `${over ? '+' : ''}${Math.floor(a / 3600)}:${pad(Math.floor((a % 3600) / 60))}:${pad(a % 60)}` : `${over ? '+' : ''}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
    el.classList.toggle('long', a >= 3600);
    $('#leftlbl').textContent = over ? 'over your time' : 'left';
    const frac = Math.max(0, Math.min(1, (e - n) / (e - s)));
    $('#arc').setAttribute('stroke-dashoffset', String(CIRC * (1 - frac)));
    const ring = $('#ring');
    ring.classList.toggle('soon', !over && rem <= WARN * 60);
    ring.classList.toggle('over', over);
    const it = itemById(b.itemId);
    const nextUsed = usedAt(it, b.date, endOf(b), new Set([b.id]));
    const nextLine = nextUsed ? `Someone's booking starts at ${fmt(endOf(b))}. They can check in from ${fmt(endOf(b) - HANDOVER)}.` : 'Nobody is booked right after you.';
    const html = over
      ? `<div class="banner red"><b>Your time ended at ${fmt(endOf(b))}</b>${nextUsed ? 'The next person is waiting. Please check out now.' : 'Please check out now.'}</div>`
      : rem <= WARN * 60
        ? `<div class="banner"><b>${Math.ceil(rem / 60)} min left · pack up now</b>Save your work and log out of any computers. ${nextLine}</div>`
        : `<div class="banner calm"><b>5-minute warning at ${fmt(endOf(b) - WARN)}</b>${nextLine}</div>`;
    const ban = $('#banner');
    if (ban.dataset.k !== html) { ban.innerHTML = html; ban.dataset.k = html; }
  }

  // ---------------------------------------------------------------------------
  // Check out
  // ---------------------------------------------------------------------------
  function viewCheckout(id) {
    const b = state.bookings.find((x) => x.id === id);
    if (!b || !['active', 'overtime'].includes(phase(b))) { go('home'); return; }
    const it = itemById(b.itemId);
    const rem = Math.round((ts(b.date, endOf(b)) - now().getTime()) / 60000);
    const nextUsed = usedAt(it, b.date, endOf(b), new Set([b.id]));
    const items = it.cat === 'Makerspace'
      ? ['I switched the machine off or left it ready', 'I took my things and prints with me', 'The space is tidy for the next person']
      : ['I logged out of any computers', 'I took all my things with me', 'The space is tidy for the next person'];
    app.innerHTML = `
      ${topbar('Before you leave', { back: `session/${id}` })}
      <div class="banner ${rem <= WARN ? '' : 'calm'}"><b>${rem > 0 ? `${rem} min left` : rem === 0 ? 'Your time is up' : `${-rem} min over`}</b>${nextUsed ? `Next booking starts at ${fmt(endOf(b))}.` : 'Nobody is booked right after you.'}</div>
      <h2 class="section-h">Quick check</h2>
      <div class="checks">${items.map((t, i) => `<label class="check"><input type="checkbox" class="co" id="co${i}"> ${t}</label>`).join('')}</div>
      <div class="dock"><div class="dock-in"><button class="btn" id="out" disabled>Tick all three to check out</button></div></div>`;
    const sync = () => {
      const all = $$('.co').every((c) => c.checked);
      $('#out').disabled = !all;
      $('#out').textContent = all ? `Check out of ${it.name}` : 'Tick all three to check out';
    };
    $$('.co').forEach((c) => c.addEventListener('change', sync));
    $('#out').addEventListener('click', () => {
      const nm = Math.ceil(nowMin() / 5) * 5;
      const early = b.date === todayKey() && nm < endOf(b);
      if (early) b.endedMin = Math.max(b.start + 5, nm);
      b.status = 'done';
      if ((b.members || []).length || b.owner !== me) notify(b, `checked out of ${it.name}`);
      save();
      toast(early ? `Checked out early. ${it.name} is free again from ${fmt(b.endedMin)}.` : 'Checked out. Thanks for handing over on time.');
      go('home');
    });
  }

  // ---------------------------------------------------------------------------
  // Sheet + toast
  // ---------------------------------------------------------------------------
  function sheet(html, wire) {
    const root = $('#sheet-root');
    root.innerHTML = `<div class="scrim"><div class="sheet" role="dialog" aria-modal="true"><div class="grip"></div>${html}</div></div>`;
    const close = () => closeSheet();
    $('.scrim', root).addEventListener('click', (e) => { if (e.target.classList.contains('scrim')) close(); });
    wire?.($('.sheet', root), close);
    $('.sheet button', root)?.focus();
    return close;
  }
  function closeSheet() {
    const root = $('#sheet-root');
    const s = root && $('.scrim', root);
    if (!s) return;
    if (reduced()) { root.innerHTML = ''; return; }
    s.classList.add('out');
    setTimeout(() => { if (s.isConnected) s.remove(); }, 180);
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  let tt;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove('show'), 4200);
  }

  // ---------------------------------------------------------------------------
  // Reminders and the 5-minute warning (run every second)
  // ---------------------------------------------------------------------------
  const sheetOpen = () => !!$('#sheet-root .scrim:not(.out)');
  function alerts() {
    if (!me || sheetOpen()) return;
    const [r, rid] = route();
    for (const b of mine()) {
      const p = phase(b);
      const it = itemById(b.itemId);
      const n = now().getTime();
      if (p === 'checkin' && state.prefs.remindStart && !b.reminded && n < ts(b.date, b.start) + 5 * 60000) {
        b.reminded = true; save();
        buzz();
        sheet(`<h2>${esc(it.name)} starts at ${fmt(b.start)}</h2><p class="muted sheet-p">Check-in is open. Check the space and report anything broken before you start.</p>
          <button class="btn" id="a">Check in now</button><button class="btn ghost" id="b">Later</button>`, (el, close) => {
          $('#a', el).onclick = () => { close(); go(`checkin/${b.id}`); };
          $('#b', el).onclick = close;
        });
        return;
      }
      if (p === 'active' && state.prefs.warnEnd && !b.warned && ts(b.date, endOf(b)) - n <= WARN * 60000) {
        b.warned = true; save();
        buzz();
        if (r === 'session' && rid === b.id) render();
        sheet(`<h2>${WARN} minutes left</h2><p class="muted sheet-p">${esc(it.name)} ends at ${fmt(endOf(b))}. Pack up, log out of any computers and get ready to hand over. The next person can check in now.</p>
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
    if (me && r === 'session') {
      const b = state.bookings.find((x) => x.id === id);
      if (b) {
        tickSession(b);
        if (b.status === 'active' && ts(b.date, endOf(b)) <= now().getTime() && $('#ring') && !$('#ring').classList.contains('over')) render();
      }
    }
    $$('.live-clock').forEach((c) => { c.textContent = fmt(Math.floor(nowMin())); });
    alerts();
  }, 1000);
  // Refresh live statuses on overview screens every 30 s
  setInterval(() => { const [r] = route(); if (me && !sheetOpen() && TAB_ROUTES.includes(r) && r !== 'account' && document.activeElement?.id !== 'q') render(); }, 30000);

  // Another tab (another person on this device) changed something: update now
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    state = Object.assign(fresh(), load(KEY, {}));
    seedCache.clear();
    const [r] = route();
    if (!['confirm', 'checkin', 'checkout'].includes(r) && document.activeElement?.tagName !== 'INPUT') render();
    if (me && unread()) renderTabs(TAB_ROUTES.includes(r) ? r : null);
  });

  // ---------------------------------------------------------------------------
  // Demo controls (side panel on laptops, sheet on phones)
  // ---------------------------------------------------------------------------
  function resetAll() {
    const known = state.known;
    state = fresh(); state.known = known; state.lastId = me || ''; save();
    draft = null; seedCache.clear(); ui.prefDate = null; ui.flash = null;
    setOffset(0);
    toast('Demo data reset.');
    go('home');
  }

  function demoActions() {
    const b = me && nextBooking();
    const it = b && itemById(b.itemId);
    return [
      b && ['upcoming', 'checkin'].includes(phase(b)) && { label: `Jump to check-in for ${it.name}`, run: () => setOffset(ts(b.date, b.start) - 3 * 60000 - Date.now()) },
      b && ['active', 'overtime'].includes(phase(b)) && { label: 'Jump to 5½ min before the end', run: () => { b.warned = false; save(); setOffset(ts(b.date, endOf(b)) - 330000 - Date.now()); } },
      b && phase(b) === 'active' && { label: 'Jump to 1 min after the end', run: () => setOffset(ts(b.date, endOf(b)) + 60000 - Date.now()) },
      offset && { label: 'Back to real time', run: () => setOffset(0) },
      me && { label: `Log in as a friend (${me === 'S-1033' ? 'S-2210' : 'S-1033'})`, run: () => logIn(me === 'S-1033' ? 'S-2210' : 'S-1033') },
      { label: 'Reset demo data', run: resetAll },
    ].filter(Boolean);
  }

  function renderDemo() {
    const box = $('#side-demo');
    if (!box) return;
    const acts = demoActions();
    box.innerHTML = `<div class="demo-box"><h3>Demo controls</h3>
      <p>Skip ahead in time to show check-in, the countdown and the 5-minute warning without waiting. App time: <b class="live-clock">${fmt(Math.floor(nowMin()))}</b>${offset ? ' (shifted)' : ''}${me ? ` · logged in as <b>${esc(me)}</b>` : ''}.</p>
      ${acts.map((a, i) => `<button class="btn" data-demo="${i}">${esc(a.label)}</button>`).join('')}</div>`;
    $$('[data-demo]', box).forEach((btn) => btn.addEventListener('click', () => acts[Number(btn.dataset.demo)].run()));
  }

  function openDemoSheet() {
    const acts = demoActions();
    sheet(`<h2>Demo controls</h2><p class="muted small sheet-p">Skip ahead in time to show check-in, the countdown and the 5-minute warning. App time: ${fmt(Math.floor(nowMin()))}${offset ? ' (shifted)' : ''}.</p>
      ${acts.map((a, i) => `<button class="btn ${i ? 'ghost' : ''}" data-d="${i}">${esc(a.label)}</button>`).join('')}`, (el) => {
      $$('[data-d]', el).forEach((btn) => btn.addEventListener('click', () => { closeSheet(); acts[Number(btn.dataset.d)].run(); }));
    });
  }

  // QR code for testers (laptop view)
  window.addEventListener('load', () => {
    try {
      if (window.QRCode) new window.QRCode($('#qr'), { text: location.origin + location.pathname, width: 96, height: 96, colorDark: '#16203a', colorLight: '#ffffff' });
    } catch { /* QR is optional */ }
  });

  render();
})();
