/* ==========================================================
   TFT Team Search
   ========================================================== */
(function () {
  'use strict';

  const DATA_URL = './best_levels_2_5.json';
  const LS_OWNED = 'tft.owned.v1';
  const LS_LEVEL = 'tft.level.v1';

  /* ---------- State ---------- */
  let rawData = null;
  let currentLevel = null;
  let allChamps = [];
  let owned = new Set();

  /* ---------- DOM ---------- */
  const $ = (sel) => document.getElementById(sel);
  const levelSelect = $('levelSelect');
  const champSearch = $('champSearch');
  const champList = $('champList');
  const selectedChamps = $('selectedChamps');
  const minOverlap = $('minOverlap');
  const minOverlapLabel = $('minOverlapLabel');
  const sortMode = $('sortMode');
  const clearOwned = $('clearOwned');
  const showAll = $('showAll');
  const resultsEl = $('results');
  const resultCount = $('resultCount');
  const resultsSummary = $('resultsSummary');
  const champCount = $('champCount');

  /* ---------- Helpers ---------- */
  const uniq = (arr) => Array.from(new Set(arr));
  const normalize = (s) => (s || '').toLowerCase().trim();

  const toLevelKeys = (obj) => Object.keys(obj).sort((a, b) => Number(a) - Number(b));

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const k in attrs) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'on') for (const ev in attrs[k]) node.addEventListener(ev, attrs[k][ev]);
      else if (k in node) node[k] = attrs[k];
      else node.setAttribute(k, attrs[k]);
    }
    (Array.isArray(children) ? children : [children]).forEach(c => c != null && node.append(c));
    return node;
  }

  function loadState() {
    try {
      const rawOwned = localStorage.getItem(LS_OWNED);
      if (rawOwned) {
        const arr = JSON.parse(rawOwned);
        if (Array.isArray(arr)) owned = new Set(arr);
      }
    } catch (_) { /* ignore */ }
  }

  function saveOwned() {
    try { localStorage.setItem(LS_OWNED, JSON.stringify(Array.from(owned))); } catch (_) {}
  }
  function saveLevel() {
    try { if (currentLevel != null) localStorage.setItem(LS_LEVEL, String(currentLevel)); } catch (_) {}
  }

  function chip(text, onRemove) {
    const btn = el('button', { type: 'button', 'aria-label': `Remove ${text}`, textContent: '×',
      on: { click: onRemove } });
    return el('span', { class: 'chip', textContent: text }, btn);
  }

  function badge(text, cls = '') {
    return el('span', { class: `badge ${cls}`.trim(), textContent: text });
  }

  function getChampsForLevel(level) {
    if (!rawData || !rawData.levels || level == null) return [];
    const comps = rawData.levels[level] || [];
    const names = [];
    for (const c of comps) if (Array.isArray(c.team)) names.push(...c.team);
    return uniq(names).sort((a, b) => a.localeCompare(b));
  }

  /* ---------- Skeleton loader ---------- */
  function renderSkeleton() {
    const skeletonCard = () => `
      <div class="skeleton-card">
        <div class="skeleton-bar w-40"></div>
        <div class="skeleton-bar h-8 w-80"></div>
        <div class="skeleton-row">
          <div class="skeleton-pill"></div><div class="skeleton-pill"></div>
          <div class="skeleton-pill"></div><div class="skeleton-pill"></div>
          <div class="skeleton-pill"></div>
        </div>
        <div class="skeleton-bar w-60"></div>
      </div>`;
    resultsEl.innerHTML = skeletonCard() + skeletonCard() + skeletonCard();
    resultsSummary.innerHTML = '<span class="skeleton-bar w-40" style="display:inline-block;width:140px;"></span>';
  }

  /* ---------- Renders ---------- */
  function renderLevels() {
    const keys = toLevelKeys(rawData.levels);
    levelSelect.innerHTML = '';
    keys.forEach(k => levelSelect.append(el('option', { value: k, textContent: `Level ${k}` })));

    const saved = (() => { try { return localStorage.getItem(LS_LEVEL); } catch (_) { return null; } })();
    currentLevel = (saved && keys.includes(saved)) ? saved : (keys[0] ?? null);
    levelSelect.value = currentLevel ?? '';
    updateChampCount();
  }

  function updateChampCount() {
    if (!champCount) return;
    champCount.innerHTML = `<strong>${allChamps.length}</strong> champions available at this level`;
  }

  function renderChampionPicker() {
    const q = normalize(champSearch.value);
    const filtered = allChamps.filter(c => normalize(c).includes(q));
    const sorted = filtered.slice().sort((a, b) => {
      const ao = owned.has(a) ? 0 : 1;
      const bo = owned.has(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return a.localeCompare(b);
    });

    champList.innerHTML = '';
    sorted.forEach(name => {
      const cb = el('input', { type: 'checkbox', checked: owned.has(name),
        on: { change: () => {
          if (cb.checked) owned.add(name); else owned.delete(name);
          saveOwned();
          renderSelected();
          renderChampionPicker();
          renderResults();
        }}});
      champList.append(el('label', { class: 'pick' + (owned.has(name) ? ' selected-champ' : '') },
        [cb, el('span', { textContent: name })]));
    });
  }

  function renderSelected() {
    selectedChamps.innerHTML = '';
    const items = Array.from(owned).sort((a, b) => a.localeCompare(b));
    items.forEach(name => selectedChamps.append(chip(name, () => {
      owned.delete(name);
      saveOwned();
      renderSelected();
      renderChampionPicker();
      renderResults();
    })));
  }

  /* ---------- Scoring ---------- */
  function scoreComp(comp) {
    const team = Array.isArray(comp.team) ? comp.team : [];
    const missing = team.filter(u => !owned.has(u));
    const ownedCount = team.length - missing.length;
    const bronzeCount = Number(
      comp.bronze_count ?? (Array.isArray(comp.bronze_traits) ? comp.bronze_traits.length : 0)
    ) || 0;
    return {
      comp, team, ownedCount, missing,
      missingCount: missing.length,
      teamSize: team.length,
      ratio: team.length ? ownedCount / team.length : 0,
      bronzeCount
    };
  }

  function sortScored(scored, mode) {
    const arr = scored.slice();
    const cmp = {
      bronze:  (a, b) => (b.bronzeCount - a.bronzeCount) || (b.ownedCount - a.ownedCount) || (a.missingCount - b.missingCount),
      missing: (a, b) => (a.missingCount - b.missingCount) || (b.ownedCount - a.ownedCount) || (b.bronzeCount - a.bronzeCount),
      closest: (a, b) => (b.ownedCount - a.ownedCount) || (a.missingCount - b.missingCount) || (b.bronzeCount - a.bronzeCount)
    }[mode] || ((a, b) => 0);
    return arr.sort(cmp);
  }

  /* ---------- Comp card builder ---------- */
  function buildCompCard(s) {
    const c = s.comp;
    const card = el('div', { class: 'card' });

    const title = el('div', { class: 'card-title',
      textContent: `Level ${currentLevel} — ${s.ownedCount}/${s.teamSize} owned` });

    const subParts = [];
    if (c.team_size != null) subParts.push(`Team size: ${c.team_size}`);
    if (c.max_cost_allowed != null) subParts.push(`Max cost: ${c.max_cost_allowed}`);
    const sub = el('div', { class: 'card-sub', textContent: subParts.join(' • ') });

    // Copy button
    const copyBtn = el('button', {
      type: 'button', class: 'copy-btn', textContent: 'Copy team',
      'aria-label': `Copy team for Level ${currentLevel} comp`,
      on: { click: () => copyTeamToClipboard(s.team, copyBtn) }
    });

    const head = el('div', { class: 'card-head' }, [
      el('div', {}, [title, sub]),
      el('div', { class: 'card-actions' }, copyBtn)
    ]);

    // Progress bar
    const pct = Math.round(s.ratio * 100);
    const fill = el('span', { class: 'progress-bar__fill' + (s.ownedCount === s.teamSize && s.teamSize > 0 ? ' progress-bar__fill--complete' : '') });
    // Apply after appending so the transition triggers
    requestAnimationFrame(() => { fill.style.width = pct + '%'; });
    const progress = el('div', { class: 'progress', 'aria-label': `${pct}% of team owned` }, [
      el('div', { class: 'progress-bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, fill),
      el('span', { class: 'progress-label', textContent: `${pct}%` })
    ]);

    const kv = el('div', { class: 'kv' });
    const addKV = (label, badges, bold) => {
      kv.append(el('div', { class: 'k' + (bold ? ' bold' : ''), textContent: label }));
      kv.append(el('div', { class: 'v' }, badges));
    };

    addKV('Team', s.team.map(u => badge(u)));
    addKV(`Owned (${s.ownedCount})`, s.team.filter(u => owned.has(u)).map(u => badge(u, 'good')), true);
    addKV(`Missing (${s.missingCount})`, s.missing.map(u => badge(u, 'miss')));
    const bronze = Array.isArray(c.bronze_traits) ? c.bronze_traits : [];
    addKV('Bronze traits', bronze.length ? bronze.map(t => badge(t)) : [badge('—')]);

    card.append(head, progress, kv);
    return card;
  }

  async function copyTeamToClipboard(team, btn) {
    const text = team.join(', ');
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.append(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      const original = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('is-copied');
      setTimeout(() => { btn.textContent = original; btn.classList.remove('is-copied'); }, 1500);
    } catch (err) {
      console.error('Copy failed', err);
      btn.textContent = 'Copy failed';
      setTimeout(() => { btn.textContent = 'Copy team'; }, 1500);
    }
  }

  /* ---------- Results ---------- */
  function renderResults() {
    if (!rawData || !currentLevel) return;

    const comps = rawData.levels[currentLevel] || [];
    const min = Number(minOverlap.value) || 0;

    const maxTeamSize = comps.reduce((m, c) => Math.max(m, (c.team || []).length), 0);
    minOverlap.max = String(Math.max(0, maxTeamSize));
    if (Number(minOverlap.value) > Number(minOverlap.max)) minOverlap.value = minOverlap.max;
    minOverlapLabel.textContent = minOverlap.value;

    const scored = comps.map(scoreComp).filter(s => s.ownedCount >= min);
    const sorted = sortScored(scored, sortMode.value);

    resultsEl.innerHTML = '';
    resultsSummary.innerHTML = `<strong>${sorted.length}</strong> comp${sorted.length !== 1 ? 's' : ''} found`;

    if (sorted.length === 0) {
      resultsEl.innerHTML = `
        <div class="empty-state">
          <p>No comps match your current filters</p>
        </div>`;
      resultCount.textContent = '0';
      return;
    }

    const frag = document.createDocumentFragment();
    sorted.forEach(s => frag.append(buildCompCard(s)));
    resultsEl.append(frag);
    resultCount.textContent = String(sorted.length);
  }

  /* ---------- Events ---------- */
  function wireEvents() {
    levelSelect.addEventListener('change', () => {
      currentLevel = levelSelect.value;
      saveLevel();
      minOverlap.value = '0';
      minOverlapLabel.textContent = '0';

      allChamps = getChampsForLevel(currentLevel);
      updateChampCount();

      // Drop owned that don't exist at this level
      const valid = new Set(allChamps);
      for (const name of Array.from(owned)) if (!valid.has(name)) owned.delete(name);
      saveOwned();

      renderSelected();
      renderChampionPicker();
      renderResults();
    });

    champSearch.addEventListener('input', debounce(renderChampionPicker, 150));

    minOverlap.addEventListener('input', () => {
      minOverlapLabel.textContent = minOverlap.value;
      renderResults();
    });

    sortMode.addEventListener('change', renderResults);

    clearOwned.addEventListener('click', () => {
      owned = new Set();
      saveOwned();
      champSearch.value = '';
      renderSelected();
      renderChampionPicker();
      renderResults();
    });

    showAll.addEventListener('click', () => {
      owned = new Set();
      saveOwned();
      champSearch.value = '';
      minOverlap.value = '0';
      minOverlapLabel.textContent = '0';
      sortMode.value = 'closest';
      renderSelected();
      renderChampionPicker();
      renderResults();
    });
  }

  /* ---------- Error state ---------- */
  function renderError(err) {
    resultsEl.innerHTML = `
      <div class="card">
        <div class="card-title" style="margin-bottom:8px;">Could not load data</div>
        <div class="card-sub">${String(err.message || err)}</div>
        <div class="card-sub" style="margin-top:10px;">
          If you opened this via <code>file://</code>, run a local server and open <code>http://...</code> instead.
        </div>
      </div>`;
    resultsSummary.textContent = '';
    resultCount.textContent = '0';
  }

  /* ---------- Init ---------- */
  async function init() {
    loadState();
    renderSkeleton();

    try {
      const res = await fetch(DATA_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load JSON: ${res.status} ${res.statusText}`);
      rawData = await res.json();
      if (!rawData || typeof rawData !== 'object' || !rawData.levels) {
        throw new Error('Unexpected JSON structure. Expected { levels: { ... } }.');
      }

      renderLevels();
      allChamps = getChampsForLevel(currentLevel);
      updateChampCount();

      // Drop any persisted owned that isn't valid for this level
      const valid = new Set(allChamps);
      for (const name of Array.from(owned)) if (!valid.has(name)) owned.delete(name);
      saveOwned();

      renderSelected();
      renderChampionPicker();
      wireEvents();
      renderResults();
    } catch (err) {
      console.error('[tft-team-search]', err);
      renderError(err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
