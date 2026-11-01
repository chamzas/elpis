/* core.js: shared interactions for both sites. Each site's app.js calls Core.init(config). */
(function () {
  'use strict';

  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const mqFine = matchMedia('(hover: hover) and (pointer: fine)');
  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const ICON = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
  };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  const listeners = { lang: [], theme: [], scroll: [] };
  let keys = { lang: 'lang', theme: 'theme' };

  const Core = {
    $, $$, root, esc, clamp, ICON,
    get reduced() { return mqReduce.matches; },
    get fine() { return mqFine.matches; },
    lang: () => (root.lang === 'el' ? 'el' : 'en'),
    t: (en, el) => '<span class="en">' + en + '</span><span class="el">' + el + '</span>',
    tx: (en, el) => (root.lang === 'el' ? el : en),
    norm: s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ'),
    onLang: fn => listeners.lang.push(fn),
    onTheme: fn => listeners.theme.push(fn),
    onScroll: fn => { listeners.scroll.push(fn); fn(); },
    isDark: () => root.dataset.theme === 'dark',
    cssVar: name => getComputedStyle(root).getPropertyValue(name).trim(),
    toast, copy, animate, fitCanvas, scrollToEl, palette: null
  };
  window.Core = Core;

  /* ---------- small utilities ---------- */

  let toastEl, toastTimer;
  function toast(html) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.innerHTML = html;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  function copy(text, okHtml) {
    const done = () => toast(okHtml || Core.t('Copied', 'Αντιγράφηκε'));
    const legacy = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* nothing else to try */ }
      ta.remove();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, legacy);
    else legacy();
  }

  function scrollToEl(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: Core.reduced ? 'auto' : 'smooth', block: 'start' });
  }

  // Size a canvas to its CSS box with DPR capped at 2. Returns the 2D context already scaled.
  function fitCanvas(canvas, ctxType) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext(ctxType || '2d');
    if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h, dpr };
  }

  // rAF loop that only runs while `el` is on screen and the tab is visible.
  // With reduced motion it renders single frames on demand via kick().
  function animate(el, draw) {
    let visible = false, raf = 0, last = 0;
    const tick = now => {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      const keep = draw(now, dt);
      if (!Core.reduced || keep === true) raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
    new IntersectionObserver(es => {
      visible = es[es.length - 1].isIntersecting;
      if (visible) kick(); else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }).observe(el);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && visible) kick(); });
    return { kick, get visible() { return visible; } };
  }

  /* ---------- theme and language with view transitions ---------- */

  function withTransition(kind, origin, apply) {
    if (!document.startViewTransition || Core.reduced) { apply(); return; }
    root.dataset.vt = kind;
    const vt = document.startViewTransition(apply);
    vt.ready.then(() => {
      if (kind !== 'theme') return;
      const r = origin.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      root.animate(
        { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + end + 'px at ' + x + 'px ' + y + 'px)'] },
        { duration: 700, easing: 'cubic-bezier(.2,.75,.2,1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => {});
    vt.finished.finally(() => { delete root.dataset.vt; });
  }

  function applyLangAttrs() {
    const el = Core.lang() === 'el';
    $$('[data-label-en]').forEach(n => {
      const v = el ? n.dataset.labelEl : n.dataset.labelEn;
      n.setAttribute('aria-label', v);
      n.title = v;
    });
    $$('[data-ph-en]').forEach(n => { n.placeholder = el ? n.dataset.phEl : n.dataset.phEn; });
  }

  function setLang(lang) {
    root.lang = lang;
    localStorage.setItem(keys.lang, lang);
    applyLangAttrs();
    listeners.lang.forEach(f => f(lang));
  }
  function setTheme(theme, persist) {
    root.dataset.theme = theme;
    if (persist) localStorage.setItem(keys.theme, theme);
    listeners.theme.forEach(f => f(theme));
  }
  Core.toggleLang = origin => withTransition('lang', origin, () => setLang(Core.lang() === 'el' ? 'en' : 'el'));
  Core.toggleTheme = origin => withTransition('theme', origin, () => setTheme(Core.isDark() ? 'light' : 'dark', true));

  /* ---------- navigation: menu, scroll spy, sliding pill, progress ---------- */

  function initNav() {
    const topbar = $('.topbar'), links = $('.links'), menuBtn = $('.menu-btn');
    const navLinks = $$('.links a');
    const sections = navLinks.map(a => $(a.getAttribute('href'))).filter(Boolean);

    menuBtn.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open);
    });
    const closeMenu = () => { links.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); };
    navLinks.forEach(a => a.addEventListener('click', closeMenu));
    document.addEventListener('click', e => { if (!e.target.closest('.nav')) closeMenu(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

    const pill = document.createElement('li');
    pill.className = 'nav-pill';
    pill.setAttribute('role', 'presentation');
    pill.setAttribute('aria-hidden', 'true');
    links.prepend(pill);
    let current = null;
    const movePill = a => {
      if (!a || !a.offsetWidth) { pill.style.opacity = '0'; return; }
      pill.style.width = a.offsetWidth + 'px';
      pill.style.transform = 'translateX(' + a.offsetLeft + 'px)';
      pill.style.opacity = '1';
    };
    navLinks.forEach(a => {
      a.addEventListener('pointerenter', () => movePill(a));
      a.addEventListener('pointerleave', () => movePill(current));
    });
    window.addEventListener('resize', () => movePill(current));
    listeners.lang.push(() => requestAnimationFrame(() => movePill(current)));

    const cssProgress = CSS.supports('animation-timeline: scroll()');
    const progress = document.createElement('div');
    progress.className = 'progress';
    progress.setAttribute('aria-hidden', 'true');
    document.body.prepend(progress);

    Core.onScroll(() => {
      topbar.classList.toggle('scrolled', scrollY > 8);
      if (!cssProgress) {
        const max = document.documentElement.scrollHeight - innerHeight;
        progress.style.setProperty('--p', max > 0 ? clamp(scrollY / max, 0, 1) : 0);
      }
      const line = Math.min(innerHeight * 0.35, 320);
      let cur = null;
      sections.forEach(s => { if (s.getBoundingClientRect().top <= line) cur = s; });
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = sections[sections.length - 1];
      const a = cur ? navLinks.find(l => l.getAttribute('href') === '#' + cur.id) : null;
      if (a !== current) {
        navLinks.forEach(l => {
          l.classList.toggle('current', l === a);
          if (l === a) l.setAttribute('aria-current', 'location'); else l.removeAttribute('aria-current');
        });
        current = a;
        movePill(a);
      }
    });
  }

  let scrollQueued = false;
  window.addEventListener('scroll', () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => { scrollQueued = false; listeners.scroll.forEach(f => f()); });
  }, { passive: true });
  window.addEventListener('resize', () => listeners.scroll.forEach(f => f()));

  /* ---------- reveal, counters, headline split ---------- */

  function initReveal(selector) {
    const els = $$(selector);
    els.forEach(el => {
      el.classList.add('reveal');
      const sibs = Array.from(el.parentElement.children).filter(c => c.matches(selector));
      el.style.setProperty('--i', Math.min(sibs.indexOf(el), 6));
    });
    if (CSS.supports('animation-timeline: view()')) return;
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });
    els.forEach(el => io.observe(el));
  }

  function initCounters() {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      countUp(e.target);
    }), { threshold: 0.4 });
    $$('[data-count]').forEach(el => io.observe(el));
  }
  function countUp(el) {
    const final = el.textContent, target = parseInt(el.dataset.count, 10), prefix = el.dataset.prefix || '';
    if (Core.reduced || !target) return;
    const dur = 1600, t0 = performance.now();
    const step = now => {
      const k = clamp((now - t0) / dur, 0, 1);
      const eased = 1 - Math.pow(2, -10 * k);
      el.textContent = prefix + Math.round(target * eased);
      if (k < 1) requestAnimationFrame(step); else el.textContent = final;
    };
    requestAnimationFrame(step);
  }

  function splitHeadline() {
    $$('h1 > span').forEach(span => {
      let wi = 0;
      span.innerHTML = span.textContent.trim().split(/(\s+)/).map(tok =>
        /^\s+$/.test(tok) ? ' ' : '<span class="w"><span style="--wi:' + (wi++) + '">' + esc(tok) + '</span></span>'
      ).join('');
    });
  }

  /* ---------- pointer effects: spotlight, tilt, magnetic ---------- */

  function initPointerFx() {
    let active = null;
    const reset = card => { card.style.removeProperty('--rx'); card.style.removeProperty('--ry'); card.classList.remove('tilting'); };
    document.addEventListener('pointermove', e => {
      if (!Core.fine || e.pointerType !== 'mouse') return;
      const card = e.target.closest('.fx-card');
      if (active && active !== card) reset(active);
      active = card;
      if (!card) return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      if (card.classList.contains('tilt') && !Core.reduced) {
        card.classList.add('tilting');
        card.style.setProperty('--rx', ((0.5 - py) * 5).toFixed(2) + 'deg');
        card.style.setProperty('--ry', ((px - 0.5) * 7).toFixed(2) + 'deg');
      }
    }, { passive: true });
    document.addEventListener('pointerleave', () => { if (active) reset(active); active = null; });
    $$('.magnetic').forEach(magnetize);
  }
  function magnetize(el) {
    el.addEventListener('pointermove', e => {
      if (!Core.fine || Core.reduced) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      el.classList.add('pulling');
      el.style.translate = (dx * 0.22).toFixed(1) + 'px ' + (dy * 0.32).toFixed(1) + 'px';
    });
    el.addEventListener('pointerleave', () => { el.classList.remove('pulling'); el.style.translate = ''; });
  }
  Core.magnetize = magnetize;

  /* ---------- timeline: scroll fill and expandable nodes ---------- */

  function initTimelines() {
    $$('.timeline').forEach(tl => {
      const items = $$(':scope > li', tl);
      items.forEach((li, i) => {
        const card = $(':scope > div', li);
        if (!card) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tl-toggle';
        btn.dataset.labelEn = 'Show details';
        btn.dataset.labelEl = 'Λεπτομέρειες';
        card.appendChild(btn);
        const set = (open, pin) => {
          li.classList.toggle('open', open);
          if (pin !== undefined) li.dataset.pinned = pin ? '1' : '';
          btn.setAttribute('aria-expanded', open);
        };
        set(i === 0, i === 0);
        card.addEventListener('click', e => {
          if (e.target.closest('a')) return;
          const pinned = li.dataset.pinned === '1';
          set(!pinned, !pinned);
        });
        li.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') set(true); });
        li.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && li.dataset.pinned !== '1') set(false); });
      });
      Core.onScroll(() => {
        const r = tl.getBoundingClientRect();
        const pos = Math.min(innerHeight * 0.62, innerHeight - 80) - r.top;
        tl.style.setProperty('--fill', clamp(pos / r.height, 0, 1).toFixed(4));
        items.forEach(li => li.classList.toggle('passed', pos >= li.offsetTop + 28));
      });
    });
  }

  /* ---------- command palette ---------- */

  function initPalette(cfg) {
    const t = Core.t;
    const dlg = document.createElement('dialog');
    dlg.className = 'cmdk';
    dlg.dataset.labelEn = 'Command palette';
    dlg.dataset.labelEl = 'Παλέτα εντολών';
    dlg.innerHTML =
      '<div class="cmdk-head">' + ICON.search +
      '<input type="text" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list" autocomplete="off" spellcheck="false"' +
      ' data-ph-en="' + esc(cfg.placeholder[0]) + '" data-ph-el="' + esc(cfg.placeholder[1]) + '" data-label-en="Search" data-label-el="Αναζήτηση">' +
      '<kbd>Esc</kbd></div>' +
      '<ul id="cmdk-list" role="listbox"></ul>' +
      '<div class="cmdk-foot"><span><kbd>&uarr;</kbd><kbd>&darr;</kbd> ' + t('navigate', 'πλοήγηση') + '</span>' +
      '<span><kbd>&crarr;</kbd> ' + t('select', 'επιλογή') + '</span><span><kbd>Esc</kbd> ' + t('close', 'κλείσιμο') + '</span></div>';
    document.body.appendChild(dlg);
    const input = $('input', dlg), list = $('ul', dlg);

    const hint = document.createElement('button');
    hint.type = 'button';
    hint.className = 'cmdk-hint';
    hint.dataset.labelEn = 'Open command palette (' + (isMac ? '⌘' : 'Ctrl') + ' K)';
    hint.dataset.labelEl = 'Άνοιγμα παλέτας εντολών (' + (isMac ? '⌘' : 'Ctrl') + ' K)';
    hint.innerHTML = ICON.search + '<span class="k"><kbd>' + (isMac ? '⌘' : 'Ctrl') + '</kbd> <kbd>K</kbd></span>';
    document.body.appendChild(hint);

    const G_JUMP = ['Jump to', 'Μετάβαση'], G_ACT = ['Actions', 'Ενέργειες'];
    const statics = () => {
      const jump = $$('.links a').map(a => ({
        group: G_JUMP, icon: '#', html: a.innerHTML, hay: a.textContent, run: () => scrollToEl($(a.getAttribute('href')))
      })).concat((cfg.extraSections || []).map(s => Object.assign({ group: G_JUMP, icon: '#' }, s)));
      const acts = [
        { group: G_ACT, icon: '◐', html: t('Toggle dark / light theme', 'Εναλλαγή σκούρου / φωτεινού θέματος'), hay: 'theme dark light mode θεμα σκουρο', run: () => Core.toggleTheme(hint) },
        { group: G_ACT, icon: 'Α', html: t('Ελληνικά (switch language)', 'English (αλλαγή γλώσσας)'), hay: 'language greek english γλωσσα ελληνικα', run: () => Core.toggleLang(hint) }
      ].concat(cfg.actions || []).concat([
        { group: G_ACT, icon: '⎙', html: t('Print / save as PDF', 'Εκτύπωση / αποθήκευση ως PDF'), hay: 'print pdf cv εκτυπωση', run: () => setTimeout(() => window.print(), 50) }
      ]);
      return jump.concat(acts);
    };

    let items = [], sel = 0;
    function render() {
      const q = Core.norm(input.value.trim());
      const terms = q.split(/\s+/).filter(Boolean);
      items = statics().filter(it => terms.every(tm => Core.norm((it.hay || '') + ' ' + it.html.replace(/<[^>]+>/g, ' ')).includes(tm)));
      if (cfg.search && q.length >= 2) items = items.concat(cfg.search(q, terms));
      sel = clamp(sel, 0, Math.max(0, items.length - 1));
      let html = '', lastGroup = null;
      items.forEach((it, i) => {
        if (it.group[0] !== lastGroup) { html += '<li class="grp" role="presentation">' + t(it.group[0], it.group[1]) + '</li>'; lastGroup = it.group[0]; }
        html += '<li class="opt" role="option" id="cmdk-o' + i + '" data-i="' + i + '" aria-selected="' + (i === sel) + '">' +
          '<span class="ic" aria-hidden="true">' + esc(it.icon) + '</span><span class="lbl">' + it.html + '</span>' +
          (it.hint ? '<span class="hint">' + it.hint + '</span>' : '') + '</li>';
      });
      list.innerHTML = html || '<li class="none" role="presentation">' + t('No results', 'Δεν βρέθηκαν αποτελέσματα') + '</li>';
      input.setAttribute('aria-activedescendant', items.length ? 'cmdk-o' + sel : '');
    }
    function select(i) {
      sel = clamp(i, 0, items.length - 1);
      $$('.opt', list).forEach(o => o.setAttribute('aria-selected', +o.dataset.i === sel));
      const o = $('#cmdk-o' + sel, list);
      if (o) { o.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', o.id); }
    }
    function run(i) {
      const it = items[i];
      if (!it) return;
      dlg.close();
      requestAnimationFrame(() => it.run());
    }
    function open() {
      if (dlg.open) return;
      input.value = ''; sel = 0; render();
      dlg.showModal();
      input.focus();
    }

    input.addEventListener('input', () => { sel = 0; render(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); select(sel + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); select(sel - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    });
    list.addEventListener('pointermove', e => { const o = e.target.closest('.opt'); if (o && +o.dataset.i !== sel) select(+o.dataset.i); });
    list.addEventListener('click', e => { const o = e.target.closest('.opt'); if (o) run(+o.dataset.i); });
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    hint.addEventListener('click', open);
    document.addEventListener('keydown', e => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); dlg.open ? dlg.close() : open(); }
      else if (e.key === '/' && !typing && !dlg.open) { e.preventDefault(); open(); }
    });
    Core.palette = { open };
  }

  /* ---------- init ---------- */

  Core.init = function (cfg) {
    keys = cfg.keys || keys;
    if (!root.dataset.theme) root.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

    const themeBtn = $('#theme-btn'), langBtn = $('#lang-btn');
    themeBtn.innerHTML = '<span class="ic-moon">' + ICON.moon + '</span><span class="ic-sun">' + ICON.sun + '</span>';
    themeBtn.addEventListener('click', () => Core.toggleTheme(themeBtn));
    langBtn.addEventListener('click', () => Core.toggleLang(langBtn));

    splitHeadline();
    initNav();
    initReveal(cfg.reveal);
    initCounters();
    initPointerFx();
    initTimelines();
    initPalette(cfg.palette);
    applyLangAttrs();
  };
})();
