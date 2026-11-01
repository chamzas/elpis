/* app.js: Antonopoulou site. Shared behaviour lives in core.js. */
(function () {
  'use strict';

  const { $, $$, esc, clamp, t } = Core;
  const TAU = Math.PI * 2;

  const colorCtx = document.createElement('canvas').getContext('2d');
  function rgb(css) {
    colorCtx.fillStyle = '#000';
    colorCtx.fillStyle = css;
    const v = colorCtx.fillStyle;
    if (v[0] === '#') return [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16));
    return v.match(/[\d.]+/g).slice(0, 3).map(Number);
  }
  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const themeColors = () => ({ bg: rgb(Core.cssVar('--bg')), surface: rgb(Core.cssVar('--surface')), ink: rgb(Core.cssVar('--ink')),
    muted: rgb(Core.cssVar('--muted')), brand: rgb(Core.cssVar('--brand')), accent: rgb(Core.cssVar('--accent')) });

  // One heartbeat as a sum of Gaussians (P, QRS, T), phase in [0, 1)
  const g = (x, m, s) => Math.exp(-((x - m) / s) * ((x - m) / s));
  const ecg = p => 0.12 * g(p, 0.18, 0.035) - 0.1 * g(p, 0.36, 0.009) + g(p, 0.39, 0.011) - 0.24 * g(p, 0.42, 0.011) + 0.26 * g(p, 0.64, 0.055);

  /* ---------- hero: flowing nerve fibres and a calm ECG trace ---------- */

  (function hero() {
    const canvas = $('#hero-canvas');
    const heroEl = canvas.parentElement;
    const fib = document.createElement('canvas');
    const fctx = fib.getContext('2d');
    let W = 0, H = 0, dpr = 1, parts = [], accent = [0, 0, 0], brand = [0, 0, 0], head = 0, trace = null, ecgY = 0;
    const ptr = { x: -1e4, y: -1e4 };

    function setup(f) {
      W = f.w; H = f.h; dpr = f.dpr;
      fib.width = Math.round(W * dpr); fib.height = Math.round(H * dpr);
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = W < 700 ? 38 : 80;
      parts = Array.from({ length: n }, () => spawn(true));
      trace = new Float32Array(Math.ceil(W) + 2).fill(NaN);
      const bento = $('.bento', heroEl);
      ecgY = bento ? bento.offsetTop - 30 : H * 0.8;
      if (W < 700) ecgY = Math.min(ecgY, $('.portrait-frame').offsetTop + $('.portrait-frame').offsetHeight * 0.5);
    }
    function spawn(initial) {
      return { x: initial ? Math.random() * W : -10 - Math.random() * 60, y: Math.random() * H, life: 200 + Math.random() * 400, w: 0.6 + Math.random() * 0.9 };
    }
    function recolor() {
      accent = rgb(Core.cssVar('--accent'));
      brand = rgb(Core.cssVar('--brand'));
      fctx.clearRect(0, 0, W, H);
    }
    heroEl.addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; });
    heroEl.addEventListener('pointerleave', () => { ptr.x = ptr.y = -1e4; });

    function draw(now, dt) {
      const f = Core.fitCanvas(canvas);
      if (f.w !== W || f.h !== H || !trace) { setup(f); recolor(); }
      const ctx = f.ctx;
      const tt = now * 0.001, k = dt / 16;
      const steps = Core.reduced ? 260 : 1;
      for (let s = 0; s < steps; s++) {
        // Fade the fibre buffer to leave soft trails
        fctx.globalCompositeOperation = 'destination-out';
        fctx.fillStyle = 'rgba(0,0,0,0.022)';
        fctx.fillRect(0, 0, W, H);
        fctx.globalCompositeOperation = 'source-over';
        fctx.lineCap = 'round';
        parts.forEach((p, i) => {
          const a = 0.75 * Math.sin(p.y * 0.008 + p.x * 0.002 + tt * 0.3) + 0.45 * Math.cos(p.x * 0.005 - tt * 0.22);
          let vx = Math.cos(a) * 1.1 + 0.5, vy = Math.sin(a) * 0.9;
          const dx = p.x - ptr.x, dy = p.y - ptr.y, d2 = dx * dx + dy * dy;
          if (d2 < 14400) { const f2 = (1 - d2 / 14400) * 2.2; vx += dx / Math.sqrt(d2 + 1) * f2; vy += dy / Math.sqrt(d2 + 1) * f2; }
          const nx = p.x + vx * k, ny = p.y + vy * k;
          const alpha = Math.min(1, p.life / 80) * 0.26;
          fctx.strokeStyle = rgba(i % 5 ? accent : brand, alpha);
          fctx.lineWidth = p.w;
          fctx.beginPath(); fctx.moveTo(p.x, p.y); fctx.lineTo(nx, ny); fctx.stroke();
          p.x = nx; p.y = ny; p.life -= k;
          if (p.x > W + 10 || p.y < -20 || p.y > H + 20 || p.life <= 0) parts[i] = spawn(false);
        });
      }
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(fib, 0, 0, W, H);

      // ECG sweep: the trace is rewritten column by column, with a gap ahead of the head
      const speed = 0.13, beat = 190, amp = W < 700 ? 18 : 26;
      const prev = head;
      head = Core.reduced ? W * 0.72 : (head + speed * dt) % W;
      const fillTo = Core.reduced ? Math.floor(W) : Math.floor(head);
      const from = Core.reduced ? 0 : Math.floor(prev);
      for (let x = from; x !== fillTo; x = (x + 1) % (trace.length - 1)) {
        trace[x] = ecgY - amp * ecg(((x + 1000 * beat) % beat) / beat);
        if (Core.reduced && x >= trace.length - 2) break;
      }
      const gap = 46;
      const seg = 24;
      ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
      for (let x0 = 0; x0 < W; x0 += seg) {
        const age = ((head - x0 - seg + W) % W) / W;
        if (!Core.reduced && ((x0 - head + W) % W) < gap) continue;
        const a = Core.reduced ? 0.45 : 0.75 * (1 - age);
        ctx.strokeStyle = rgba(accent, a);
        ctx.beginPath();
        let started = false;
        for (let x = x0; x <= Math.min(W, x0 + seg); x++) {
          const y = trace[x];
          if (isNaN(y) || (!Core.reduced && ((x - head + W) % W) < gap && x !== x0)) { started = false; continue; }
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      if (!Core.reduced) {
        const hy = trace[Math.floor(head)];
        if (!isNaN(hy)) {
          ctx.fillStyle = rgba(accent, 0.25); ctx.beginPath(); ctx.arc(head, hy, 7, 0, TAU); ctx.fill();
          ctx.fillStyle = rgba(accent, 1); ctx.beginPath(); ctx.arc(head, hy, 2.6, 0, TAU); ctx.fill();
        }
      }
    }
    const loop = Core.animate(canvas, draw);
    Core.onTheme(() => { recolor(); loop.kick(); });
    window.addEventListener('resize', () => { trace = null; loop.kick(); });
  })();

  /* ---------- bento tile art ---------- */

  (function tileArt() {
    let d = '';
    for (let x = 0; x <= 400; x += 2) d += (x ? 'L' : 'M') + x + ' ' + (60 - 46 * ecg((x % 133) / 133)).toFixed(1);
    $('#art-ecg').innerHTML = '<svg viewBox="0 0 400 100" preserveAspectRatio="none"><path class="ecg-glow" d="' + d + '"/>' +
      '<path d="' + d + '" fill="none" stroke="var(--line)" stroke-width="1.5"/><path class="ecg-line" pathLength="1" d="' + d + '"/></svg>';

    let ticks = '';
    for (let y = 1995; y <= 2026; y++) {
      const x = ((y - 1995) / 31) * 300;
      ticks += '<line x1="' + x + '" x2="' + x + '" y1="' + (y % 5 ? 13 : 9) + '" y2="21" stroke="var(--muted)" stroke-opacity="' + (y % 5 ? 0.3 : 0.6) + '"/>';
    }
    $('#art-years').innerHTML = '<svg viewBox="-6 0 312 30" preserveAspectRatio="none"><line x1="0" x2="300" y1="21" y2="21" stroke="var(--accent)" stroke-width="2"/>' +
      ticks + '<circle cx="0" cy="21" r="4" fill="var(--accent)"/><circle cx="300" cy="21" r="4" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"/></svg>';

    $('#art-edra').innerHTML = '<svg viewBox="0 0 60 60" preserveAspectRatio="xMaxYMid meet" fill="none" stroke="var(--accent)" stroke-width="2" opacity=".28">' +
      '<circle cx="34" cy="24" r="13"/><circle cx="34" cy="24" r="8"/><path d="M26 34l-4 18 8-5 4 7 3-17M42 34l4 18-8-5"/></svg>';

    let dots = '';
    [0, 1, 2, 3].forEach(i => { dots += '<circle cx="' + (12 + i * 14) + '" cy="30" r="4.5" fill="var(--accent)" opacity="' + (0.25 + i * 0.12) + '"/>'; });
    $('#art-vp').innerHTML = '<svg viewBox="0 0 60 60" preserveAspectRatio="xMaxYMid meet"><line x1="12" x2="54" y1="30" y2="30" stroke="var(--accent)" stroke-opacity=".3" stroke-width="2"/>' + dots + '</svg>';
  })();

  /* ---------- congress map and year scrubber ---------- */

  const congress = (function () {
    const LON0 = 19.2, LAT0 = 41.85, KX = 0.7826 * 60, KY = 60;
    const P = (lon, lat) => [(lon - LON0) * KX, (LAT0 - lat) * KY];
    // Hand-authored simplified outlines (lon, lat)
    const MAINLAND = [[20.01, 39.69], [20.31, 39.99], [20.67, 40.1], [20.95, 40.47], [21.03, 40.85], [21.6, 40.9], [22.0, 41.13], [22.6, 41.13], [22.95, 41.34],
      [23.6, 41.4], [24.3, 41.55], [25.1, 41.33], [25.9, 41.32], [26.21, 41.72], [26.52, 41.35], [26.32, 41.15], [26.18, 40.88], [26.04, 40.74],
      [25.87, 40.85], [25.55, 40.88], [25.13, 40.96], [24.98, 40.95], [24.78, 40.86], [24.55, 40.95], [24.4, 40.93], [24.18, 40.8], [23.88, 40.78],
      [23.72, 40.66], [23.85, 40.48], [23.88, 40.4], [24.13, 40.31], [24.4, 40.15], [24.3, 40.12], [24.05, 40.24], [23.93, 40.3], [23.8, 40.3],
      [23.75, 40.27], [23.95, 40.1], [23.85, 39.96], [23.7, 40.06], [23.62, 40.22], [23.4, 40.25], [23.45, 40.1], [23.68, 39.93], [23.55, 39.92],
      [23.35, 39.97], [23.3, 40.1], [23.28, 40.24], [23.0, 40.38], [22.94, 40.62], [22.75, 40.52], [22.6, 40.28], [22.62, 40.0], [22.73, 39.88],
      [22.95, 39.62], [23.12, 39.45], [23.25, 39.28], [23.33, 39.16], [23.15, 39.12], [23.05, 39.15], [22.95, 39.36], [22.82, 39.25], [22.88, 39.05],
      [22.62, 38.92], [22.45, 38.86], [22.78, 38.78], [23.05, 38.65], [23.25, 38.55], [23.6, 38.46], [23.75, 38.35], [23.95, 38.25], [24.02, 38.12],
      [24.01, 37.95], [24.03, 37.65], [23.9, 37.72], [23.77, 37.8], [23.62, 37.94], [23.53, 38.04], [23.35, 37.98], [23.15, 37.93], [22.99, 37.88],
      [23.15, 37.63], [23.38, 37.6], [23.48, 37.45], [23.3, 37.35], [23.15, 37.32], [22.95, 37.47], [22.8, 37.57], [22.75, 37.4], [22.88, 37.17],
      [22.98, 36.95], [23.05, 36.69], [23.19, 36.44], [22.95, 36.52], [22.8, 36.7], [22.57, 36.76], [22.48, 36.6], [22.48, 36.39], [22.38, 36.65],
      [22.25, 36.9], [22.11, 37.03], [21.96, 36.79], [21.88, 36.72], [21.7, 36.81], [21.68, 36.92], [21.65, 37.1], [21.67, 37.25], [21.55, 37.5],
      [21.32, 37.65], [21.32, 37.8], [21.12, 37.93], [21.38, 38.12], [21.73, 38.25], [21.78, 38.31], [22.08, 38.25], [22.45, 38.1], [22.75, 37.98],
      [22.88, 37.94], [22.97, 38.0], [22.95, 38.05], [22.75, 38.2], [22.42, 38.43], [22.15, 38.37], [21.83, 38.39], [21.77, 38.34], [21.42, 38.36],
      [21.15, 38.3], [21.08, 38.53], [20.85, 38.65], [20.78, 38.8], [20.73, 38.96], [20.4, 39.28], [20.25, 39.45], [20.26, 39.51], [20.15, 39.62]];
    const ISLANDS = [
      [[22.83, 38.88], [23.1, 39.02], [23.35, 38.95], [23.6, 38.75], [23.85, 38.65], [24.12, 38.62], [24.25, 38.4], [24.55, 38.15], [24.6, 37.98],
        [24.45, 37.97], [24.1, 38.2], [23.8, 38.4], [23.6, 38.47], [23.3, 38.65], [23.05, 38.78]],
      [[23.52, 35.3], [23.58, 35.55], [24.02, 35.52], [24.3, 35.36], [24.47, 35.37], [25.13, 35.34], [25.75, 35.28], [26.1, 35.2], [26.32, 35.28],
        [26.25, 35.0], [25.73, 35.0], [25.3, 34.98], [24.75, 34.93], [24.3, 35.18], [23.9, 35.23], [23.55, 35.22]],
      [[19.65, 39.75], [19.95, 39.8], [20.12, 39.62], [19.92, 39.45], [19.85, 39.6]],
      [[20.6, 38.85], [20.72, 38.85], [20.7, 38.6], [20.6, 38.65]],
      [[20.4, 38.35], [20.65, 38.48], [20.8, 38.2], [20.55, 38.1], [20.45, 38.2]],
      [[20.65, 37.85], [20.95, 37.9], [20.9, 37.7], [20.75, 37.65]],
      [[25.85, 39.3], [26.2, 39.38], [26.6, 39.05], [26.4, 38.97], [26.1, 39.1], [25.85, 39.15]],
      [[27.75, 36.2], [28.0, 36.35], [28.23, 36.45], [28.25, 36.3], [28.1, 36.05], [27.75, 35.9], [27.7, 36.05]]
    ];
    const DOTS = [[24.7, 40.68, 0.13, 0.1], [25.55, 40.47, 0.08, 0.05], [25.25, 39.9, 0.2, 0.1], [26.0, 38.38, 0.1, 0.2], [26.85, 37.75, 0.22, 0.07],
      [26.2, 37.6, 0.18, 0.05], [27.15, 36.85, 0.18, 0.05], [27.15, 35.6, 0.06, 0.25], [25.48, 37.05, 0.1, 0.13], [25.15, 37.07, 0.08, 0.08],
      [24.85, 37.85, 0.07, 0.15], [25.15, 37.6, 0.08, 0.06], [25.35, 37.45, 0.06, 0.04], [25.43, 36.4, 0.05, 0.06], [24.42, 36.7, 0.12, 0.07],
      [24.55, 38.85, 0.1, 0.07], [23.5, 37.73, 0.06, 0.05], [23.48, 37.95, 0.06, 0.04], [22.98, 36.25, 0.07, 0.1], [23.47, 39.16, 0.05, 0.03],
      [23.7, 39.12, 0.06, 0.04], [23.85, 39.17, 0.05, 0.03]];
    // Cyprus is drawn in an inset in the lower right corner
    const CYPRUS = [[32.3, 35.05], [32.4, 34.75], [32.95, 34.57], [33.63, 34.9], [34.08, 34.97], [33.95, 35.13], [34.59, 35.69], [34.0, 35.4],
      [33.3, 35.35], [32.92, 35.4], [32.95, 35.18], [32.42, 35.05]];
    const IN = { x: 344, y: 346, k: 0.72 };
    const CP = (lon, lat) => [IN.x + 6 + (lon - 32.2) * KX * IN.k, IN.y + 8 + (35.75 - lat) * KY * IN.k];

    const PLACES = [
      { id: 'xanthi', at: P(24.88, 41.14), en: 'Xanthi', el: 'Ξάνθη', kind: 'home', dx: 9, dy: -7, anchor: 'start' },
      { id: 'thessaloniki', at: P(22.94, 40.64), en: 'Thessaloniki', el: 'Θεσσαλονίκη', groups: ['2024', '2020'], dx: -9, dy: -6, anchor: 'end' },
      { id: 'kalambaka', at: P(21.63, 39.71), en: 'Kalambaka', el: 'Καλαμπάκα', groups: ['2014'], dx: 9, dy: 4, anchor: 'start' },
      { id: 'lefkada', at: P(20.66, 38.74), en: 'Lefkada', el: 'Λευκάδα', groups: ['2024'], dx: -9, dy: 4, anchor: 'end' },
      { id: 'athens', at: P(23.73, 37.98), en: 'Athens', el: 'Αθήνα', kind: 'training', dx: 9, dy: 4, anchor: 'start' },
      { id: 'rhodes', at: P(28.05, 36.28), en: 'Rhodes', el: 'Ρόδος', groups: ['2025'], dx: -8, dy: -8, anchor: 'end' },
      { id: 'nicosia', at: CP(33.36, 35.17), en: 'Nicosia', el: 'Λευκωσία', groups: ['2007–2013'], dx: 0, dy: -10, anchor: 'middle' }
    ];
    const NOTES = {
      nicosia: t('2008, EDRA commendation', '2008, έπαινος EDRA'),
      athens: t('studies and training', 'σπουδές και ειδίκευση')
    };

    const path = pts => 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
    const svg = $('#gr-map');
    let s = '<g class="land-g">';
    s += '<path class="land" d="' + path(MAINLAND.map(p => P(p[0], p[1]))) + '"/>';
    ISLANDS.forEach(isl => { s += '<path class="land" d="' + path(isl.map(p => P(p[0], p[1]))) + '"/>'; });
    DOTS.forEach(dd => {
      const c = P(dd[0], dd[1]);
      s += '<ellipse class="land" cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" rx="' + (dd[2] * KX).toFixed(1) + '" ry="' + (dd[3] * KY).toFixed(1) + '"/>';
    });
    s += '<rect class="inset" x="' + IN.x + '" y="' + IN.y + '" width="94" height="74" rx="8"/>';
    s += '<text class="inset-label" x="' + (IN.x + 47) + '" y="' + (IN.y + 68) + '" text-anchor="middle"><tspan class="en">Cyprus</tspan><tspan class="el">Κύπρος</tspan></text>';
    s += '<path class="land" d="' + path(CYPRUS.map(p => CP(p[0], p[1]))) + '"/></g><g id="routes"></g>';
    PLACES.forEach(pl => {
      s += '<g class="place ' + (pl.kind || '') + '" data-id="' + pl.id + '"><circle class="halo" cx="' + pl.at[0].toFixed(1) + '" cy="' + pl.at[1].toFixed(1) + '" r="6"/>' +
        '<circle class="dot" cx="' + pl.at[0].toFixed(1) + '" cy="' + pl.at[1].toFixed(1) + '" r="4.5"/>' +
        '<text x="' + (pl.at[0] + pl.dx).toFixed(1) + '" y="' + (pl.at[1] + pl.dy).toFixed(1) + '" text-anchor="' + pl.anchor + '"><tspan class="en">' + pl.en + '</tspan><tspan class="el">' + pl.el + '</tspan></text></g>';
    });
    svg.innerHTML = s;

    // Year groups and scrubber
    const groups = $$('#teaching .congress-list .year-group').map(el => {
      const key = $('h3', el).textContent.trim();
      const ys = key.split('–').map(Number);
      return { key, el, y0: ys[0], y1: ys[1] || ys[0] };
    });
    const YA = 2007, YB = 2026;
    const xPct = y => ((y - YA) / (YB - YA)) * 100;
    const mid = gr => (gr.y0 + gr.y1) / 2;
    const track = $('#scrub-track'), chips = $('#scrub-chips');
    let tk = '';
    for (let y = YA; y <= YB; y++) {
      const has = groups.some(gr => y >= gr.y0 && y <= gr.y1 && gr.y0 === gr.y1);
      tk += '<span class="tick' + (has ? ' has' : '') + '" style="left:' + xPct(y) + '%"></span>';
    }
    groups.filter(gr => gr.y1 > gr.y0).forEach(gr => {
      tk += '<span class="range" style="left:' + xPct(gr.y0) + '%;width:' + (xPct(gr.y1) - xPct(gr.y0)) + '%"></span>';
    });
    track.insertAdjacentHTML('afterbegin', tk);
    chips.innerHTML = groups.map((gr, i) => '<button type="button" data-i="' + i + '">' + esc(gr.key) + '</button>').join('');
    groups.forEach(gr => { gr.el.id = 'congress-' + gr.y0; });

    let active = -1, lockUntil = 0;
    function setActive(i, scroll) {
      if (i === active && !scroll) return;
      active = i;
      const gr = groups[i];
      groups.forEach((x, j) => x.el.classList.toggle('active', j === i));
      $$('button', chips).forEach((b, j) => b.setAttribute('aria-current', j === i));
      const btn = $('button[data-i="' + i + '"]', chips);
      if (btn && chips.scrollWidth > chips.clientWidth) chips.scrollTo({ left: btn.offsetLeft - chips.clientWidth / 2 + btn.offsetWidth / 2, behavior: Core.reduced ? 'auto' : 'smooth' });
      track.style.setProperty('--x', xPct(mid(gr)) + '%');
      $$('.place', svg).forEach(n => {
        const pl = PLACES.find(p => p.id === n.dataset.id);
        n.classList.toggle('on', !!(pl.groups && pl.groups.includes(gr.key)));
      });
      const on = PLACES.filter(p => p.groups && p.groups.includes(gr.key));
      const home = PLACES[0].at;
      $('#routes', svg).innerHTML = on.map(p => {
        const mx = (home[0] + p.at[0]) / 2, my = (home[1] + p.at[1]) / 2, dx = p.at[0] - home[0], dy = p.at[1] - home[1];
        return '<path class="route" d="M' + home[0] + ' ' + home[1] + 'Q' + (mx - dy * 0.25) + ' ' + (my + dx * 0.25) + ' ' + p.at[0] + ' ' + p.at[1] + '"/>';
      }).join('');
      $('#map-cap').innerHTML = '<b>' + esc(gr.key) + '</b>' + (on.length
        ? on.map(p => t(p.en, p.el) + (NOTES[p.id] ? ' <span class="muted">(' + NOTES[p.id] + ')</span>' : '')).join(' &middot; ')
        : '<span class="muted">' + t('No location listed for this year', 'Δεν αναφέρεται τόπος για αυτό το έτος') + '</span>');
      if (scroll) {
        lockUntil = performance.now() + 900;
        Core.scrollToEl(gr.el);
      }
    }
    chips.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setActive(+b.dataset.i, true); });
    function nearest(clientX) {
      const r = track.getBoundingClientRect();
      const y = YA + clamp((clientX - r.left) / r.width, 0, 1) * (YB - YA);
      let best = 0, bd = 1e9;
      groups.forEach((gr, i) => { const d = y < gr.y0 ? gr.y0 - y : y > gr.y1 ? y - gr.y1 : 0; if (d < bd) { bd = d; best = i; } });
      return best;
    }
    let dragging = false;
    track.addEventListener('pointerdown', e => { dragging = true; track.classList.add('dragging'); track.setPointerCapture(e.pointerId); setActive(nearest(e.clientX)); });
    track.addEventListener('pointermove', e => { if (dragging) setActive(nearest(e.clientX)); });
    const endDrag = () => { if (!dragging) return; dragging = false; track.classList.remove('dragging'); setActive(active, true); };
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    chips.addEventListener('keydown', e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const i = clamp(active + d, 0, groups.length - 1);
      setActive(i, true);
      $('button[data-i="' + i + '"]', chips).focus();
    });

    Core.onScroll(() => {
      if (dragging || performance.now() < lockUntil) return;
      const line = innerHeight * 0.42;
      let cur = 0;
      groups.forEach((gr, i) => { if (gr.el.getBoundingClientRect().top <= line) cur = i; });
      setActive(cur);
    });
    Core.onLang(() => { const a = active; active = -1; setActive(a); });

    return { groups, select: i => setActive(i, true), outlines: [MAINLAND].concat(ISLANDS, [CYPRUS]) };
  })();

  /* ---------- publications data ---------- */

  const GROUP_OF = p => (p.kind === 'journal' || p.kind === 'full' ? p.kind : 'abstract');
  const PUBS = (window.PUBS || []).map(p => {
    p.group = GROUP_OF(p);
    p.hay = Core.norm([p.title, p.authors, p.venue, p.year].join(' '));
    return p;
  });
  const YEARS = PUBS.map(p => p.year).filter(Boolean);
  const Y0 = Math.min.apply(null, YEARS), Y1 = Math.max.apply(null, YEARS);
  const state = { kind: 'all', q: '', y0: null, y1: null };

  const LABELS = {
    en: { journal: 'Journal', full: 'Full paper', abstract: 'Abstract', award: 'Award', undated: 'Undated', scholar: 'Find on Scholar',
          copy: 'Copy citation', copied: 'Copied', none: 'No publications match your search.',
          showing: (n, tt) => 'Showing ' + n + ' of ' + tt + ' publications and presentations', years: 'Years',
          papers: n => n + (n === 1 ? ' item' : ' items') },
    el: { journal: 'Περιοδικό', full: 'Πλήρης', abstract: 'Περίληψη', award: 'Βραβείο', undated: 'Χωρίς έτος', scholar: 'Αναζήτηση στο Scholar',
          copy: 'Αντιγραφή αναφοράς', copied: 'Αντιγράφηκε', none: 'Δεν βρέθηκαν δημοσιεύσεις.',
          showing: (n, tt) => n + ' από ' + tt + ' δημοσιεύσεις και ανακοινώσεις', years: 'Έτη',
          papers: n => n + (n === 1 ? ' εργασία' : ' εργασίες') }
  };
  const L = () => LABELS[Core.lang()];

  function highlight(text, terms) {
    let out = esc(text);
    terms.forEach(tm => {
      const re = new RegExp('(' + tm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }
  const boldSelf = html => html.replace(/((?:Ε\.|E\.|Ελπίδα|Elpida)\s*(?:Αντωνοπούλου|Antonopoulou)|(?:Αντωνοπούλου|Antonopoulou),?\s*(?:Ε\.|E\.?)?)/g, '<b>$1</b>');
  const citation = p => p.authors + ', "' + p.title + '", ' + p.venue + '.';

  const termsOf = () => Core.norm(state.q).split(/\s+/).filter(Boolean);
  const okQ = (p, terms) => terms.every(tm => p.hay.includes(tm));
  const okYear = p => state.y0 === null || (p.year >= state.y0 && p.year <= state.y1);
  const okKind = p => state.kind === 'all' || (state.kind === 'award' ? !!p.award : p.group === state.kind);

  /* ---------- publication list ---------- */

  function renderPubs() {
    const lab = L();
    const terms = termsOf();
    const hlTerms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = PUBS.filter(p => okKind(p) && okQ(p, terms) && okYear(p));

    const groups = {}, order = [];
    shown.forEach(p => {
      const y = p.year || lab.undated;
      if (!groups[y]) { groups[y] = []; order.push(y); }
      groups[y].push(p);
    });
    order.sort((a, b) => (typeof b === 'number' ? b : -1) - (typeof a === 'number' ? a : -1));

    $('#pub-list').innerHTML = order.length ? order.map(y =>
      '<div class="year-group"><h3>' + y + '</h3><div>' + groups[y].map(p => {
        const q = encodeURIComponent('"' + p.title + '"');
        const links = '<a href="https://scholar.google.com/scholar?q=' + q + '" target="_blank" rel="noopener">' + lab.scholar + '</a>' +
          (p.doi ? '<a href="https://doi.org/' + esc(p.doi) + '" target="_blank" rel="noopener">DOI</a>' : '') +
          '<a href="#" data-cite="' + p.n + '">' + lab.copy + '</a>';
        return '<div class="pub' + (p.award ? ' awarded' : '') + '" id="pub-' + p.n + '">' +
          '<div class="title"><span class="badge ' + p.group + '">' + lab[p.group] + '</span>' +
          (p.award ? '<span class="badge award" title="' + esc(p.award) + '">★ ' + lab.award + '</span>' : '') + highlight(p.title, hlTerms) + '</div>' +
          '<div class="authors">' + boldSelf(highlight(p.authors, hlTerms)) + '</div>' +
          '<div class="venue">' + highlight(p.venue, hlTerms) + (p.award ? ' <span class="award-note">· ' + esc(p.award) + '</span>' : '') + '</div>' +
          '<div class="actions">' + links + '</div></div>';
      }).join('') + '</div></div>'
    ).join('') : '<p class="empty">' + lab.none + '</p>';

    $('#pub-count').textContent = lab.showing(shown.length, PUBS.length);
    const c = { all: 0, journal: 0, full: 0, abstract: 0, award: 0 };
    PUBS.forEach(p => { if (okQ(p, terms) && okYear(p)) { c.all++; c[p.group]++; if (p.award) c.award++; } });
    $$('.chip').forEach(b => { $('em', b).textContent = c[b.dataset.kind]; });
    $('#pub-filters').innerHTML = state.y0 === null ? '' :
      '<button type="button" class="fchip" data-clear="year">' + lab.years + ' ' + (state.y0 === state.y1 ? state.y0 : state.y0 + '–' + state.y1) + '</button>';
    hist.render();
  }

  $('#pub-filters').addEventListener('click', e => {
    if (!e.target.closest('[data-clear]')) return;
    state.y0 = state.y1 = null;
    renderPubs();
  });
  $('#pub-list').addEventListener('click', e => {
    const a = e.target.closest('[data-cite]');
    if (!a) return;
    e.preventDefault();
    Core.copy(citation(PUBS.find(x => x.n === +a.dataset.cite)), t('Citation copied', 'Η αναφορά αντιγράφηκε'));
    a.textContent = L().copied;
    setTimeout(() => { a.textContent = L().copy; }, 1400);
  });
  $$('.chip').forEach(b => b.addEventListener('click', () => {
    $$('.chip').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b); });
    state.kind = b.dataset.kind;
    renderPubs();
  }));
  $$('.chip').forEach(b => b.setAttribute('aria-pressed', b.classList.contains('active')));
  let debounce;
  $('#pub-search').addEventListener('input', e => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.q = e.target.value.trim(); renderPubs(); }, 120);
  });
  function jumpToPub(p) {
    if (!$('#pub-' + p.n)) {
      state.kind = 'all'; state.q = ''; state.y0 = state.y1 = null;
      $('#pub-search').value = '';
      $$('.chip').forEach(x => { x.classList.toggle('active', x.dataset.kind === 'all'); x.setAttribute('aria-pressed', x.dataset.kind === 'all'); });
      renderPubs();
    }
    const el = $('#pub-' + p.n);
    el.scrollIntoView({ behavior: Core.reduced ? 'auto' : 'smooth', block: 'center' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  /* ---------- year histogram with brushing ---------- */

  const hist = (function () {
    const svg = $('#hist');
    const years = [];
    for (let y = Y0; y <= Y1; y++) years.push(y);
    const perYear = {};
    PUBS.forEach(p => { perYear[p.year] = (perYear[p.year] || 0) + 1; });
    const maxAll = Math.max.apply(null, Object.values(perYear));
    const pad = { l: 24, r: 6, t: 26, b: 22 };
    const KINDS = ['journal', 'full', 'abstract'];
    let W = 0, bw = 0, drag = null, hoverY = null, cursor = null, anchor = null;
    svg.classList.add('intro');
    setTimeout(() => svg.classList.remove('intro'), 2000);

    const xOf = y => pad.l + (y - Y0) * bw;
    const yearAt = clientX => years[clamp(Math.floor((clientX - svg.getBoundingClientRect().left - pad.l) / bw), 0, years.length - 1)];
    function setRange(a, b, commit) {
      state.y0 = Math.min(a, b); state.y1 = Math.max(a, b);
      if (commit) renderPubs(); else render();
    }

    function render() {
      const r = svg.getBoundingClientRect();
      W = Math.max(200, r.width);
      const H = Math.max(120, r.height);
      bw = (W - pad.l - pad.r) / years.length;
      const ih = H - pad.t - pad.b;
      const terms = termsOf();
      const cnt = {};
      PUBS.filter(p => okQ(p, terms)).forEach(p => { (cnt[p.year] = cnt[p.year] || { journal: 0, full: 0, abstract: 0 })[p.group]++; });
      const sy = v => (v / maxAll) * ih;
      let s = '';
      [5, 10].forEach(v => {
        if (v > maxAll) return;
        const y = pad.t + ih - sy(v);
        s += '<line class="grid" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y + '" y2="' + y + '"/>' +
          '<text class="axis" x="' + (pad.l - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + v + '</text>';
      });
      if (state.y0 !== null) {
        s += '<rect class="brush" rx="4" x="' + (xOf(state.y0) - 1) + '" y="' + (pad.t - 8) + '" width="' + ((state.y1 - state.y0 + 1) * bw + 2) + '" height="' + (ih + 8) + '"/>';
      }
      years.forEach((y, i) => {
        const c = cnt[y];
        if (!c) return;
        let acc = 0;
        const outside = state.y0 !== null && (y < state.y0 || y > state.y1);
        KINDS.forEach(g => {
          if (!c[g]) return;
          const h = sy(c[g]);
          const dim = outside || (state.kind !== 'all' && state.kind !== 'award' && state.kind !== g);
          s += '<rect class="bar b-' + g + (dim ? ' dim' : '') + '" style="--k:' + i + '" x="' + (xOf(y) + bw * 0.14).toFixed(1) +
            '" y="' + (pad.t + ih - acc - h).toFixed(1) + '" width="' + Math.max(1, bw * 0.72).toFixed(1) + '" height="' + Math.max(0.5, h - 1).toFixed(1) + '" rx="1.5"/>';
          acc += h;
        });
      });
      years.forEach(y => {
        if (y % 5) return;
        s += '<text class="axis" x="' + (xOf(y) + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + y + '</text>';
      });
      if (cursor !== null && document.activeElement === svg) {
        s += '<rect class="cursor" rx="3" x="' + (xOf(cursor) + 0.5) + '" y="' + (pad.t - 6) + '" width="' + (bw - 1) + '" height="' + (ih + 6) + '"/>';
      }
      const tipY = hoverY !== null ? hoverY : (document.activeElement === svg ? cursor : null);
      if (tipY !== null) {
        const c = cnt[tipY], n = c ? c.journal + c.full + c.abstract : 0;
        const label = tipY + ' · ' + L().papers(n);
        const tw = label.length * 6.3 + 14;
        const tx = clamp(xOf(tipY) + bw / 2 - tw / 2, 2, W - tw - 2);
        s += '<g class="tip"><rect x="' + tx + '" y="2" width="' + tw + '" height="20" rx="10"/><text x="' + (tx + tw / 2) + '" y="16" text-anchor="middle">' + label + '</text></g>';
      }
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.innerHTML = s;
    }

    svg.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      svg.setPointerCapture(e.pointerId);
      const y = yearAt(e.clientX);
      drag = { start: y, moved: false, prev: [state.y0, state.y1] };
      setRange(y, y);
    });
    svg.addEventListener('pointermove', e => {
      const y = yearAt(e.clientX);
      if (drag) { if (y !== drag.start) drag.moved = true; hoverY = y; setRange(drag.start, y); }
      else if (hoverY !== y) { hoverY = y; render(); }
    });
    svg.addEventListener('pointerup', () => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (!d.moved && d.prev[0] === d.start && d.prev[1] === d.start) state.y0 = state.y1 = null;
      renderPubs();
    });
    svg.addEventListener('pointerleave', () => { if (!drag) { hoverY = null; render(); } });
    svg.addEventListener('focus', () => { if (cursor === null) cursor = state.y0 !== null ? state.y0 : Y1; render(); });
    svg.addEventListener('blur', render);
    svg.addEventListener('keydown', e => {
      if (cursor === null) cursor = state.y0 !== null ? state.y0 : Y1;
      const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (dir) {
        e.preventDefault();
        if (e.shiftKey) {
          if (anchor === null) anchor = state.y0 !== null ? state.y0 : cursor;
          cursor = clamp(cursor + dir, Y0, Y1);
          setRange(anchor, cursor, true);
        } else { cursor = clamp(cursor + dir, Y0, Y1); anchor = null; render(); }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); anchor = cursor; setRange(cursor, cursor, true);
      } else if (e.key === 'Escape' && state.y0 !== null) {
        e.preventDefault(); e.stopPropagation(); state.y0 = state.y1 = null; anchor = null; renderPubs();
      }
    });
    let rz;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(render, 80); });
    return { render };
  })();

  /* ---------- travels globe ---------- */

  const travels = (function () {
    const D = window.TRAVEL;
    const COUNTRY = { Cambridge: 'UK', Glasgow: 'UK', Liverpool: 'UK', Tunis: 'TN', Nicosia: 'CY', Warsaw: 'PL', Prague: 'CZ', Nice: 'FR', Monaco: 'MC',
      Valencia: 'ES', Seville: 'ES', Bilbao: 'ES', Istanbul: 'TR', Genoa: 'IT', Dresden: 'DE', Vienna: 'AT', Klagenfurt: 'AT', Copenhagen: 'DK', Dublin: 'IE' };
    const places = D.places.map(p => Object.assign(p, { country: COUNTRY[p.en] || 'GR', first: Math.min.apply(null, p.visits.map(v => v.year)) }));
    const canvas = $('#globe'), tip = $('#globe-tip'), list = $('#travel-list');
    const slider = $('#tv-year'), out = $('#tv-year-out'), playBtn = $('#tv-play');
    const RAD = Math.PI / 180;
    // Outlines borrowed from the congress map so Greece is recognisable on the globe
    const OUTLINES = congress.outlines;

    const LON_C = 14, LAT_C = 43;
    let zoom = 2.5, rotLon = LON_C, rotLat = LAT_C, targetLon = null, targetLat = null, velLon = 0, dragging = null, hover = null, selected = null;
    let year = 2025, playing = false, lastStep = 0, idleT = 0;
    let W = 0, H = 0, R = 0, cx = 0, cy = 0, col = null;

    const visible = p => p.first <= year;
    const tripsUpTo = p => p.visits.filter(v => v.year <= year);

    function project(lon, lat) {
      const l = (lon - rotLon) * RAD, f = lat * RAD, f0 = rotLat * RAD;
      const cosc = Math.sin(f0) * Math.sin(f) + Math.cos(f0) * Math.cos(f) * Math.cos(l);
      return { x: cx + R * Math.cos(f) * Math.sin(l), y: cy - R * (Math.cos(f0) * Math.sin(f) - Math.sin(f0) * Math.cos(f) * Math.cos(l)), z: cosc };
    }
    // Great-circle interpolation, lifted off the surface toward the middle
    function arcPoints(a, b, n) {
      const v = (lon, lat) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
      const A = v(a.lon, a.lat), B = v(b.lon, b.lat);
      const d = Math.acos(clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const k = i / n, s1 = d ? Math.sin((1 - k) * d) / Math.sin(d) : 1 - k, s2 = d ? Math.sin(k * d) / Math.sin(d) : k;
        const x = A[0] * s1 + B[0] * s2, y = A[1] * s1 + B[1] * s2, z = A[2] * s1 + B[2] * s2;
        const lift = 1 + Math.sin(k * Math.PI) * Math.min(0.18, d * 0.5);
        const lon = Math.atan2(y, x) / RAD, lat = Math.atan2(z, Math.hypot(x, y)) / RAD;
        const pp = project(lon, lat);
        pts.push({ x: cx + (pp.x - cx) * lift, y: cy + (pp.y - cy) * lift, z: pp.z });
      }
      return pts;
    }

    function draw(now, dt) {
      const f = Core.fitCanvas(canvas);
      const ctx = f.ctx;
      if (f.w !== W || f.h !== H || !col) { W = f.w; H = f.h; col = themeColors(); }
      R = Math.min(W, H) * 0.44 * zoom; cx = W / 2; cy = H / 2;

      // Motion: easing to a selected city, inertia after drag, slow idle drift
      if (targetLon !== null) {
        let dl = ((targetLon - rotLon + 540) % 360) - 180;
        rotLon += dl * Math.min(1, dt * 0.006);
        rotLat += (targetLat - rotLat) * Math.min(1, dt * 0.006);
        if (Math.abs(dl) < 0.05 && Math.abs(targetLat - rotLat) < 0.05) targetLon = targetLat = null;
      } else if (!dragging) {
        rotLon += velLon * dt * 0.06;
        velLon *= 0.94;
        idleT += dt;
        // Sway gently around Europe rather than spinning the destinations out of view
        if (!Core.reduced && idleT > 2500 && Math.abs(velLon) < 0.01 && !selected) {
          const k = Math.min(1, dt * 0.0006);
          rotLon += (LON_C + 9 * Math.sin(now * 0.00022) - rotLon) * k;
          rotLat += (LAT_C + 3 * Math.cos(now * 0.00017) - rotLat) * k;
        }
      }
      if (playing && now - lastStep > 260) { lastStep = now; setYear(year + 1); if (year >= 2025) stop(); }

      ctx.clearRect(0, 0, W, H);
      const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.05);
      g.addColorStop(0, rgba(col.surface, 1)); g.addColorStop(1, rgba(mix(col.surface, col.bg, 0.6), 1));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(col.accent, 0.35); ctx.lineWidth = 1.2; ctx.stroke();
      const halo = ctx.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.12);
      halo.addColorStop(0, rgba(col.accent, 0.18)); halo.addColorStop(1, rgba(col.accent, 0));
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, TAU); ctx.fill();

      // Graticule as dotted lines
      ctx.fillStyle = rgba(col.muted, 0.32);
      for (let lat = -60; lat <= 75; lat += 5) for (let lon = -180; lon < 180; lon += 0.5) { const p = project(lon, lat); if (p.z > 0 && p.x > 0 && p.x < W && p.y > 0 && p.y < H) ctx.fillRect(p.x - 0.6, p.y - 0.6, 1.2, 1.2); }
      for (let lon = -180; lon < 180; lon += 5) for (let lat = -80; lat <= 80; lat += 0.5) { const p = project(lon, lat); if (p.z > 0 && p.x > 0 && p.x < W && p.y > 0 && p.y < H) ctx.fillRect(p.x - 0.6, p.y - 0.6, 1.2, 1.2); }

      // Greece and Cyprus outlines
      ctx.fillStyle = rgba(col.accent, 0.22); ctx.strokeStyle = rgba(col.accent, 0.55); ctx.lineWidth = 0.8;
      OUTLINES.forEach(poly => {
        ctx.beginPath();
        let on = true;
        poly.forEach((q, i) => { const p = project(q[0], q[1]); if (p.z <= 0) on = false; if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
        if (on) { ctx.closePath(); ctx.fill(); ctx.stroke(); }
      });

      // Arcs from home
      const home = D.home;
      const t0 = now * 0.001;
      places.filter(visible).forEach((p, i) => {
        const pts = arcPoints(home, p, 40);
        const hot = hover === p || selected === p;
        ctx.lineWidth = hot ? 2 : 1.1;
        ctx.strokeStyle = rgba(hot ? col.accent : col.brand, hot ? 0.95 : 0.4);
        ctx.beginPath();
        let pen = false;
        pts.forEach(q => { if (q.z > -0.05) { if (pen) ctx.lineTo(q.x, q.y); else { ctx.moveTo(q.x, q.y); pen = true; } } else pen = false; });
        ctx.stroke();
        if (!Core.reduced) {
          const k = ((t0 * 0.35 + i * 0.137) % 1), q = pts[Math.floor(k * (pts.length - 1))];
          if (q.z > 0) { ctx.fillStyle = rgba(col.accent, 0.9); ctx.beginPath(); ctx.arc(q.x, q.y, 1.6, 0, TAU); ctx.fill(); }
        }
      });

      // City dots sized by trips; labels placed afterwards, skipping collisions
      const labels = [];
      places.forEach(p => {
        const q = project(p.lon, p.lat);
        p._s = q;
        if (q.z <= 0 || !visible(p)) return;
        const n = tripsUpTo(p).length, r = 2.4 + Math.sqrt(n) * 1.8, hot = hover === p || selected === p;
        ctx.fillStyle = rgba(col.accent, hot ? 0.3 : 0.16); ctx.beginPath(); ctx.arc(q.x, q.y, r + 4, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba(hot ? col.accent : col.brand, 1); ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU); ctx.fill();
        labels.push({ p, q, r, n, hot });
      });
      const hq = project(home.lon, home.lat);
      const taken = hq.z > 0 ? [[hq.x - 6, hq.y - 20, hq.x + 70, hq.y + 6]] : [];
      labels.sort((a, b) => b.hot - a.hot || b.n - a.n).forEach(l => {
        ctx.font = (l.hot ? '600 ' : '500 ') + (W < 500 ? 10 : 11) + 'px system-ui, sans-serif';
        const txt = Core.tx(l.p.en, l.p.el), x = l.q.x + l.r + 4, y = l.q.y + 3.5, w = ctx.measureText(txt).width;
        const box = [x - 2, y - 11, x + w + 2, y + 3];
        if (!l.hot && taken.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return;
        taken.push(box);
        ctx.fillStyle = rgba(col.ink, l.hot ? 1 : 0.72);
        ctx.fillText(txt, x, y);
      });
      if (hq.z > 0) {
        const pulse = Core.reduced ? 0 : (t0 % 2) / 2;
        ctx.strokeStyle = rgba(col.accent, 0.8 * (1 - pulse)); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(hq.x, hq.y, 5 + pulse * 14, 0, TAU); ctx.stroke();
        ctx.fillStyle = rgba(col.accent, 1); ctx.beginPath(); ctx.arc(hq.x, hq.y, 4.5, 0, TAU); ctx.fill();
        ctx.font = '700 12px system-ui, sans-serif'; ctx.fillStyle = rgba(col.ink, 1);
        ctx.fillText(Core.tx(home.en, home.el), hq.x + 9, hq.y - 7);
      }
      return targetLon !== null || playing;
    }
    const loop = Core.animate(canvas, draw);

    function showTip(p) {
      if (!p) { tip.classList.remove('show'); return; }
      tip.innerHTML = '<b>' + t(p.en, p.el) + '</b>' + p.visits.map(v => '<div><time>' + v.year + '</time><p>' + t(esc(v.en), esc(v.el)) + '</p></div>').join('');
      tip.classList.add('show');
    }
    function focusPlace(p) {
      selected = p;
      targetLon = p.lon; targetLat = clamp(p.lat, -30, 60);
      showTip(p);
      $$('li', list).forEach(li => li.classList.toggle('on', li.dataset.id === p.en));
      loop.kick();
    }
    function pick(clientX, clientY) {
      const r = canvas.getBoundingClientRect(), x = clientX - r.left, y = clientY - r.top;
      let best = null, bd = 196;
      places.forEach(p => { if (!p._s || p._s.z <= 0 || !visible(p)) return; const d = (p._s.x - x) ** 2 + (p._s.y - y) ** 2; if (d < bd) { bd = d; best = p; } });
      return best;
    }

    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      dragging = { x: e.clientX, y: e.clientY, lon: rotLon, lat: rotLat, moved: false, t: performance.now() };
      targetLon = targetLat = null; idleT = 0; loop.kick();
    });
    canvas.addEventListener('pointermove', e => {
      if (dragging) {
        const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) dragging.moved = true;
        const k = 160 / R;
        const nl = dragging.lon - dx * k * 0.5;
        velLon = (nl - rotLon) * 0.6;
        rotLon = nl; rotLat = clamp(dragging.lat + dy * k * 0.5, -70, 80);
        loop.kick();
        return;
      }
      const p = pick(e.clientX, e.clientY);
      if (p !== hover) { hover = p; canvas.style.cursor = p ? 'pointer' : 'grab'; if (!selected) showTip(p); loop.kick(); }
    });
    canvas.addEventListener('pointerup', e => {
      const d = dragging; dragging = null; idleT = 0;
      if (d && !d.moved) { const p = pick(e.clientX, e.clientY); if (p) focusPlace(p); else { selected = null; showTip(null); $$('li', list).forEach(li => li.classList.remove('on')); } }
      loop.kick();
    });
    canvas.addEventListener('wheel', e => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault(); zoom = clamp(zoom * Math.exp(-e.deltaY * 0.002), 1, 5); idleT = 0; loop.kick();
    }, { passive: false });
    canvas.addEventListener('pointerleave', () => { hover = null; if (!selected) showTip(null); loop.kick(); });
    canvas.addEventListener('keydown', e => {
      if (e.key === '+' || e.key === '=' || e.key === '-') { zoom = clamp(zoom * (e.key === '-' ? 0.8 : 1.25), 1, 5); loop.kick(); return; }
      const k = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, 6], ArrowDown: [0, -6] }[e.key];
      if (!k) return;
      e.preventDefault(); targetLon = rotLon + k[0] / zoom; targetLat = clamp(rotLat + k[1] / zoom, -70, 80); idleT = 0; loop.kick();
    });

    function renderList() {
      const vis = places.filter(visible).sort((a, b) => tripsUpTo(b).length - tripsUpTo(a).length || a.first - b.first);
      list.innerHTML = vis.map(p => {
        const n = tripsUpTo(p).length;
        return '<li data-id="' + esc(p.en) + '"' + (selected === p ? ' class="on"' : '') + '><button type="button">' +
          '<span class="tl-name">' + t(p.en, p.el) + '</span><span class="tl-years">' + tripsUpTo(p).map(v => v.year).join(' · ') + '</span>' +
          '<span class="tl-n" aria-label="' + n + '">' + '●'.repeat(Math.min(n, 4)) + '</span></button></li>';
      }).join('');
      const trips = vis.reduce((a, p) => a + tripsUpTo(p).length, 0);
      $('#tv-places').textContent = vis.length;
      $('#tv-trips').textContent = trips;
      $('#tv-countries').textContent = new Set(vis.map(p => p.country)).size;
    }
    list.addEventListener('click', e => {
      const li = e.target.closest('li');
      if (li) focusPlace(places.find(p => p.en === li.dataset.id));
    });
    list.addEventListener('mouseover', e => {
      const li = e.target.closest('li');
      const p = li && places.find(x => x.en === li.dataset.id);
      if (p !== hover) { hover = p || null; loop.kick(); }
    });

    function setYear(y) {
      year = clamp(y, 1987, 2025);
      slider.value = year; out.textContent = year;
      slider.style.setProperty('--p', ((year - 1987) / (2025 - 1987)) * 100 + '%');
      if (selected && !visible(selected)) { selected = null; showTip(null); }
      renderList(); loop.kick();
    }
    function stop() { playing = false; playBtn.classList.remove('on'); }
    slider.addEventListener('input', () => { stop(); setYear(+slider.value); });
    playBtn.addEventListener('click', () => {
      if (playing) { stop(); return; }
      selected = null; showTip(null);
      playing = true; playBtn.classList.add('on'); lastStep = 0;
      setYear(1987);
      if (Core.reduced) { setYear(2025); stop(); }
    });
    Core.onTheme(() => { col = null; loop.kick(); });
    Core.onLang(() => { renderList(); if (selected) showTip(selected); loop.kick(); });
    setYear(2025);
    return { focus: name => { const p = places.find(x => Core.norm(x.en + ' ' + x.el).includes(name)); if (p) { Core.scrollToEl($('#travels')); focusPlace(p); } }, places };
  })();

  /* ---------- init ---------- */

  // Text in the current language, without the badge
  const visibleText = node => Array.from(node.childNodes).map(n => {
    if (n.nodeType === 3) return n.textContent;
    if (n.nodeType !== 1 || n.classList.contains('badge')) return '';
    if (n.classList.contains('en') || n.classList.contains('el')) return n.classList.contains(Core.lang()) ? n.textContent : '';
    return visibleText(n);
  }).join('').trim();
  const flash = el => { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); };
  const entries = $$('#teaching .pub');

  Core.init({
    keys: { lang: 'ea-lang', theme: 'ea-theme' },
    reveal: '.bento .tile, .section > .wrap > h2, .two-col > h2, .prose p, .timeline li, .cards .card, .congress-aside, ' +
      '.section > .wrap > p.muted, .explorer-card, .globe-card, .travel-panel, .contact',
    palette: {
      placeholder: ['Search sections, congresses and publications', 'Αναζήτηση ενοτήτων, συνεδρίων και δημοσιεύσεων'],
      extraSections: congress.groups.map((gr, i) => ({
        group: ['Congress years', 'Έτη συνεδρίων'], icon: gr.key.slice(2, 4), html: esc(gr.key), hay: gr.key + ' congress συνεδρια',
        run: () => congress.select(i)
      })),
      actions: [
        { group: ['Actions', 'Ενέργειες'], icon: '↗', html: t('Open the General Hospital of Xanthi website', 'Άνοιγμα ιστοσελίδας Γ.Ν. Ξάνθης'), hay: 'hospital xanthi appointment νοσοκομειο ραντεβου', run: () => window.open('https://hosp-xanthi.gr/', '_blank', 'noopener') },
        { group: ['Actions', 'Ενέργειες'], icon: '↗', html: t('Open the ESRA Hellas profile', 'Άνοιγμα προφίλ ESRA Hellas'), hay: 'esra hellas profile', run: () => window.open($('.hero-links a').href, '_blank', 'noopener') },
        { group: ['Actions', 'Ενέργειες'], icon: '▶', html: t('Play the travels timeline', 'Αναπαραγωγή χρονολογίου ταξιδιών'), hay: 'travels play map globe ταξιδια χαρτης', run: () => { Core.scrollToEl($('#travels')); $('#tv-play').click(); } },
        { group: ['Actions', 'Ενέργειες'], icon: '★', html: t('Show awarded papers', 'Βραβευμένες εργασίες'), hay: 'award prize βραβειο', run: () => { $('.chip[data-kind="award"]').click(); Core.scrollToEl($('#publications')); } }
      ],
      search: (q, terms) => travels.places.filter(p => terms.every(tm => Core.norm(p.en + ' ' + p.el + ' ' + p.visits.map(v => v.en + ' ' + v.el).join(' ')).includes(tm))).slice(0, 4).map(p => ({
        group: ['Travels', 'Ταξίδια'], icon: '✈', html: t(p.en, p.el), hint: p.visits.map(v => v.year).join(', '),
        run: () => { Core.scrollToEl($('#travels')); travels.focus(Core.norm(p.en)); }
      })).concat(PUBS.filter(p => okQ(p, terms)).slice(0, 6).map(p => ({
        group: ['Publications', 'Δημοσιεύσεις'], icon: '¶', html: esc(p.title), hint: p.year || '', run: () => jumpToPub(p)
      })), entries.filter(el => terms.every(tm => Core.norm(el.innerText).includes(tm))).slice(0, 4).map(el => {
        const yg = el.closest('.year-group');
        const inCongress = !!el.closest('#teaching');
        return {
          group: inCongress ? ['Congresses', 'Συνέδρια'] : ['Publications', 'Δημοσιεύσεις'],
          icon: inCongress ? '◆' : '¶',
          html: esc(visibleText($('.title', el))),
          hint: yg ? esc($('h3', yg).textContent) : '',
          run: () => { el.scrollIntoView({ behavior: Core.reduced ? 'auto' : 'smooth', block: 'center' }); flash(el); }
        };
      }))
    }
  });
  $('#stat-pubs').dataset.count = PUBS.length;
  renderPubs();
  Core.onLang(renderPubs);
  Core.onTheme(() => hist.render());
})();
