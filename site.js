/* ==========================================================
   Shared site behaviors: nav toggle, scroll reveal, ripple,
   year stamp, typewriter. Loaded on every page.
   ========================================================== */
(function () {
  'use strict';

  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Year stamp ---------- */
  function stampYear() {
    const y = qs('#year');
    if (y) y.textContent = new Date().getFullYear();
  }

  /* ---------- Mobile nav ---------- */
  function initNav() {
    const toggle = qs('.nav-toggle');
    const menu = qs('#primary-nav');
    if (!toggle || !menu) return;

    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      menu.classList.toggle('is-open', open);
      document.body.classList.toggle('nav-open', open);
    };

    on(toggle, 'click', () => setOpen(menu.classList.contains('is-open') ? false : true));
    on(document, 'keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    qsa('a', menu).forEach((a) => on(a, 'click', () => setOpen(false)));
  }

  /* ---------- Scroll reveal ---------- */
  function initReveal() {
    const targets = qsa('[data-reveal]');
    if (!targets.length) return;

    if (!('IntersectionObserver' in window) ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    targets.forEach((el, idx) => {
      el.style.setProperty('--reveal-delay', (idx % 6) * 60 + 'ms');
      io.observe(el);
    });
  }

  /* ---------- Button ripple ---------- */
  function initRipple() {
    on(document, 'pointerdown', (e) => {
      const btn = e.target.closest('.btn, .ripple');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple-ink';
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 650);
    });
  }

  /* ---------- Typewriter ---------- */
  function initTypewriter() {
    const el = qs('[data-typewriter]');
    if (!el) return;
    const phrases = (el.dataset.typewriter || '').split('|').filter(Boolean);
    if (!phrases.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = phrases[0];
      return;
    }
    let pIdx = 0, cIdx = 0, deleting = false;
    const cursor = document.createElement('span');
    cursor.className = 'tw-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    el.after(cursor);

    const tick = () => {
      const phrase = phrases[pIdx];
      if (!deleting) {
        cIdx++;
        el.textContent = phrase.slice(0, cIdx);
        if (cIdx === phrase.length) { deleting = true; return setTimeout(tick, 1600); }
        setTimeout(tick, 55 + Math.random() * 40);
      } else {
        cIdx--;
        el.textContent = phrase.slice(0, cIdx);
        if (cIdx === 0) { deleting = false; pIdx = (pIdx + 1) % phrases.length; return setTimeout(tick, 350); }
        setTimeout(tick, 28);
      }
    };
    setTimeout(tick, 600);
  }

  /* ---------- Boot ---------- */
  function boot() {
    stampYear();
    initNav();
    initReveal();
    initRipple();
    initTypewriter();
  }

  if (document.readyState === 'loading') {
    on(document, 'DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
