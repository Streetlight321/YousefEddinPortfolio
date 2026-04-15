/* ==========================================================
   Gym Dashboard
   ========================================================== */
(function () {
  'use strict';

  const CSV_URL = 'https://raw.githubusercontent.com/Streetlight321/pull_gym_data/refs/heads/main/output.csv';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const GROUP_COLORS = { Push: '#6c63ff', Pull: '#ff7ac0', Leg: '#5ed0bd' };

  /* ---------- tiny DOM helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const k in attrs) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k === 'on') for (const ev in attrs[k]) node.addEventListener(ev, attrs[k][ev]);
      else if (k in node) node[k] = attrs[k];
      else node.setAttribute(k, attrs[k]);
    }
    (Array.isArray(children) ? children : [children]).forEach(c => c != null && node.append(c));
    return node;
  };

  const svg = (tag, attrs = {}) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  };

  const fmt = (n) => Number(n).toLocaleString('en-US');
  const formatDate = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

  /* ---------- CSV parsing (RFC 4180) ---------- */
  function parseCSVLine(line) {
    const fields = [];
    let i = 0, field = '', inQuotes = false;
    while (i < line.length) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { field += '"'; i += 2; }
        else if (ch === '"') { inQuotes = false; i++; }
        else { field += ch; i++; }
      } else {
        if (ch === '"') { inQuotes = true; i++; }
        else if (ch === ',') { fields.push(field.trim()); field = ''; i++; }
        else { field += ch; i++; }
      }
    }
    fields.push(field.trim());
    return fields;
  }

  function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const vals = parseCSVLine(line);
      if (vals.length < headers.length) continue;
      const row = {};
      headers.forEach((h, idx) => row[h] = (vals[idx] || ''));
      rows.push(row);
    }
    return rows;
  }

  /* ---------- Cleaning ---------- */
  function parseDate(s) {
    if (!s) return null;
    const parts = s.split('/');
    if (parts.length === 3) {
      const m = parseInt(parts[0], 10) - 1;
      const d = parseInt(parts[1], 10);
      let y = parseInt(parts[2], 10);
      if (y < 100) y += 2000;
      return new Date(y, m, d);
    }
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function parseWeight(s) {
    if (!s || /body\s*weight/i.test(s)) return 0;
    return num(s);
  }
  function parseReps(s) {
    if (!s || /failure/i.test(s) || /min/i.test(s)) return 0;
    return num(s);
  }
  function parseVolume(s, w, r) {
    if (!s || s === '#VALUE!') return w * r;
    return num(s);
  }

  function normalizeGroup(dayType) {
    const dt = titleCase((dayType || '').trim());
    if (dt === 'Legs') return 'Leg';
    if (['Push', 'Pull', 'Leg'].includes(dt)) return dt;
    return null;
  }

  function cleanRows(raw) {
    return raw.map(r => {
      const date = parseDate(r['Date'] || '');
      const weight = parseWeight(r['Weight'] || '');
      const reps = parseReps(r['# of Reps'] || '');
      return {
        date,
        dateStr: r['Date'] || '',
        dayType: (r['Day'] || '').trim(),
        exercise: (r['Exercises'] || '').trim().replace(/\s+/g, ' '),
        set: num(r['Set #']),
        weight,
        reps,
        volume: parseVolume(r['Volume'] || '', weight, reps),
        isBodyweight: weight === 0
      };
    })
      .filter(r => r.date !== null)
      .sort((a, b) => a.date - b.date);
  }

  /* ---------- Computations ---------- */
  function uniqueDates(rows) {
    const set = new Set();
    rows.forEach(r => set.add(r.date.toDateString()));
    return Array.from(set).sort((a, b) => new Date(a) - new Date(b));
  }

  function calcStreak(dateStrs) {
    if (!dateStrs.length) return 0;
    const days = new Set(dateStrs);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cursor = new Date(today);
    // Allow streak to count even if today is a rest day — start from most recent workout
    let streak = 0;
    // Advance cursor back to most recent workout within last 2 days
    let lookback = 0;
    while (lookback < 2 && !days.has(cursor.toDateString())) {
      cursor.setDate(cursor.getDate() - 1);
      lookback++;
    }
    while (days.has(cursor.toDateString())) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function groupByDay(rows) {
    const dayMap = {};
    rows.forEach(r => {
      const group = normalizeGroup(r.dayType);
      if (!group) return;
      const key = r.date.toDateString();
      if (!dayMap[key]) dayMap[key] = { date: r.date, Push: 0, Pull: 0, Leg: 0 };
      dayMap[key][group] += r.isBodyweight ? r.reps : r.volume;
    });
    const entries = Object.values(dayMap).sort((a, b) => a.date - b.date);
    return {
      dates: entries.map(e => e.date),
      map: Object.fromEntries(entries.map(e => [e.date.toDateString(), e]))
    };
  }

  function groupByMuscle(rows) {
    const groups = { Push: 0, Pull: 0, Leg: 0 };
    rows.forEach(r => {
      const g = normalizeGroup(r.dayType);
      if (g) groups[g] += r.isBodyweight ? r.reps : r.volume;
    });
    return groups;
  }

  function muscleSessionCount(rows) {
    const count = { Push: 0, Pull: 0, Leg: 0 };
    const seen = new Set();
    rows.forEach(r => {
      const g = normalizeGroup(r.dayType);
      if (!g) return;
      const sig = r.date.toDateString() + g;
      if (seen.has(sig)) return;
      seen.add(sig);
      count[g]++;
    });
    let best = 'N/A', max = 0;
    for (const k in count) if (count[k] > max) { max = count[k]; best = k; }
    return best;
  }

  function exerciseHistory(rows, name) {
    const key = name.toLowerCase();
    const matched = rows.filter(r => r.exercise.toLowerCase() === key);
    const isBW = matched.length > 0 && matched.every(r => r.isBodyweight);
    if (isBW) {
      const byDate = {};
      matched.forEach(r => {
        if (r.reps <= 0) return;
        const k = r.date.toDateString();
        if (!byDate[k]) byDate[k] = { date: r.date, total: 0, count: 0 };
        byDate[k].total += r.reps;
        byDate[k].count++;
      });
      return Object.values(byDate)
        .sort((a, b) => a.date - b.date)
        .map(d => ({ date: d.date, value: Math.round(d.total / d.count), isBodyweight: true }));
    }
    return matched
      .filter(r => r.weight > 0)
      .map(r => ({ date: r.date, value: r.weight, isBodyweight: false }));
  }

  function sessionsGrouped(rows) {
    const map = {};
    rows.forEach(r => {
      const key = r.date.toDateString();
      if (!map[key]) map[key] = { date: r.date, dayType: r.dayType, exercises: [], volume: 0, sets: 0 };
      map[key].exercises.push(r);
      map[key].volume += r.volume;
      map[key].sets += (typeof r.set === 'number' && r.set > 0) ? r.set : 1;
    });
    return Object.values(map).sort((a, b) => b.date - a.date);
  }

  /* ---------- Tooltip helpers ---------- */
  const tip = {
    el: null,
    get node() { return this.el || (this.el = $('#tooltip')); },
    show(text) { this.node.style.display = 'block'; this.node.textContent = text; },
    move(e) {
      this.node.style.left = (e.pageX + 12) + 'px';
      this.node.style.top = (e.pageY - 32) + 'px';
    },
    hide() { this.node.style.display = 'none'; }
  };

  function attachTip(node, label) {
    node.addEventListener('mouseenter', () => tip.show(label));
    node.addEventListener('mousemove', (e) => tip.move(e));
    node.addEventListener('mouseleave', () => tip.hide());
  }

  /* ---------- Render: Hero ---------- */
  function renderHeroStats(rows) {
    const dates = uniqueDates(rows);
    const totalSessions = dates.length;
    const totalVolume = rows.reduce((s, r) => s + r.volume, 0);
    const mostTrained = muscleSessionCount(rows);
    const heaviest = rows.reduce((best, r) => r.weight > best.weight ? r : best, { weight: 0, exercise: 'N/A' });

    const stats = [
      { value: fmt(totalSessions), label: 'Workout Sessions' },
      { value: fmt(Math.round(totalVolume)) + ' lbs', label: 'Total Volume' },
      { value: mostTrained, label: 'Most Trained Group' },
      { value: (heaviest.weight || 0) + ' lbs', label: 'Heaviest — ' + heaviest.exercise }
    ];

    const wrap = $('#hero-stats');
    wrap.innerHTML = '';
    stats.forEach(s => wrap.append(
      el('div', { class: 'stat-card' + (s.modifier ? ' stat-card--' + s.modifier : '') }, [
        el('p', { class: 'stat-card__value', textContent: s.value }),
        el('p', { class: 'stat-card__label', textContent: s.label })
      ])
    ));
  }

  /* ---------- Render: Daily session detail ---------- */
  function renderDailySessionDetail(session) {
    const wrap = $('#daily-session-detail');
    if (!session) { wrap.innerHTML = ''; return; }
    const exNames = [...new Set(session.exercises.map(e => e.exercise))];
    const rows = session.exercises.map(e =>
      `<tr><td>${e.exercise}</td><td>${e.set}</td><td>${e.weight ? e.weight + ' lbs' : 'BW'}</td><td>${e.reps || '-'}</td><td>${fmt(Math.round(e.volume))} lbs</td></tr>`
    ).join('');
    wrap.innerHTML = `
      <div class="session-card">
        <button type="button" aria-label="Close" class="session-close" style="float:right;background:none;border:0;font-size:1.1rem;cursor:pointer;color:var(--muted);">✕</button>
        <div class="session-card__header">
          <span class="session-card__date">${formatDate(session.date)}</span>
          <span class="session-card__type">${session.dayType}</span>
        </div>
        <div class="session-card__stats">
          <span>Volume: ${fmt(Math.round(session.volume))} lbs</span>
          <span>${exNames.length} exercises</span>
          <span>${session.sets} sets</span>
        </div>
        <div class="session-card__details open">
          <table>
            <thead><tr><th>Exercise</th><th>Set #</th><th>Weight</th><th>Reps</th><th>Volume</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
    wrap.querySelector('.session-close').addEventListener('click', () => { wrap.innerHTML = ''; });
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- Render: Daily volume chart ---------- */
  function renderWeeklyChart(rows) {
    const wrap = $('#weekly-chart-wrap');
    wrap.innerHTML = '';

    const { dates, map } = groupByDay(rows);
    if (!dates.length) {
      wrap.innerHTML = '<p style="color:var(--muted);">No workout data for this range.</p>';
      return;
    }

    const sessionsByDate = {};
    sessionsGrouped(rows).forEach(s => sessionsByDate[s.date.toDateString()] = s);

    const W = 900, H = 340, pad = { t: 20, r: 30, b: 60, l: 70 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const groups = ['Push', 'Pull', 'Leg'];

    let maxV = 0;
    dates.forEach(d => {
      const entry = map[d.toDateString()];
      groups.forEach(g => { if (entry[g] > maxV) maxV = entry[g]; });
    });
    maxV = (maxV * 1.1) || 1;

    const xPos = (i) => pad.l + (plotW * i / (dates.length - 1 || 1));

    const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Daily volume chart' });

    // Grid
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + plotH - (plotH * i / 4);
      chart.appendChild(svg('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: '#f0f0f0', 'stroke-width': 1 }));
      const t = svg('text', { x: pad.l - 10, y: y + 4, 'text-anchor': 'end', fill: '#676788', 'font-size': '11' });
      t.textContent = fmt(Math.round(maxV * i / 4));
      chart.appendChild(t);
    }

    const allDots = [];
    let selectedDot = null;

    groups.forEach(g => {
      const color = GROUP_COLORS[g];
      const pts = [];
      dates.forEach((d, i) => {
        const val = map[d.toDateString()][g];
        if (val > 0) pts.push({ x: xPos(i), y: pad.t + plotH - (plotH * val / maxV), val, date: d, group: g });
      });

      if (pts.length >= 2) {
        const poly = svg('polyline', {
          points: pts.map(p => p.x + ',' + p.y).join(' '),
          fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round'
        });
        // Approximate path length for the draw animation
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        poly.style.setProperty('--dash', Math.ceil(len));
        chart.appendChild(poly);
      }

      pts.forEach((p, idx) => {
        const c = svg('circle', { cx: p.x, cy: p.y, r: 4, fill: color, style: `cursor:pointer; animation-delay: ${Math.min(idx * 30, 800)}ms;`, class: 'dot' });
        allDots.push(c);
        attachTip(c, `${g} · ${formatDate(p.date)}: ${fmt(Math.round(p.val))}`);
        c.addEventListener('click', () => {
          if (selectedDot === c) {
            c.setAttribute('r', '4');
            c.removeAttribute('stroke');
            selectedDot = null;
            $('#daily-session-detail').innerHTML = '';
            return;
          }
          allDots.forEach(d => { d.setAttribute('r', '4'); d.removeAttribute('stroke'); d.removeAttribute('stroke-width'); });
          c.setAttribute('r', '7'); c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', '2');
          selectedDot = c;
          renderDailySessionDetail(sessionsByDate[p.date.toDateString()]);
        });
        chart.appendChild(c);
      });
    });

    // X-axis labels
    const step = Math.max(1, Math.floor(dates.length / 12));
    dates.forEach((d, i) => {
      if (i % step !== 0 && i !== dates.length - 1) return;
      const x = xPos(i);
      const t = svg('text', {
        x, y: H - pad.b + 18, 'text-anchor': 'middle', fill: '#676788', 'font-size': '10',
        transform: `rotate(-35, ${x}, ${H - pad.b + 18})`
      });
      t.textContent = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
      chart.appendChild(t);
    });

    // Legend
    const legX = W - pad.r - 10, legY = pad.t + 10;
    groups.forEach((g, i) => {
      const y = legY + i * 22;
      chart.appendChild(svg('rect', { x: legX - 50, y: y - 10, width: 12, height: 12, rx: 4, fill: GROUP_COLORS[g] }));
      const t = svg('text', { x: legX - 34, y, fill: '#676788', 'font-size': '12', 'font-weight': '600' });
      t.textContent = g;
      chart.appendChild(t);
    });

    wrap.appendChild(chart);
  }

  /* ---------- Render: Exercise tracker ---------- */
  function renderExerciseTracker(rows) {
    const muscleSelect = $('#muscle-group-select');
    const exerciseSelect = $('#exercise-select');

    const groupEx = { All: new Set(), Push: new Set(), Pull: new Set(), Leg: new Set() };
    rows.forEach(r => {
      groupEx.All.add(r.exercise);
      const g = normalizeGroup(r.dayType);
      if (g) groupEx[g].add(r.exercise);
    });

    const populate = (group) => {
      const names = [...groupEx[group]].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      exerciseSelect.innerHTML = '<option value="">Select an exercise…</option>';
      names.forEach(n => exerciseSelect.append(el('option', { value: n, textContent: n })));
    };
    populate('All');

    muscleSelect.addEventListener('change', () => {
      populate(muscleSelect.value);
      $('#exercise-chart-wrap').innerHTML = '';
      $('#exercise-meta').innerHTML = '';
    });

    exerciseSelect.addEventListener('change', () => {
      const name = exerciseSelect.value;
      if (!name) { $('#exercise-chart-wrap').innerHTML = ''; $('#exercise-meta').innerHTML = ''; return; }
      const hist = exerciseHistory(rows, name);
      renderExerciseChart(hist);
      renderExerciseMeta(hist);
    });
  }

  function renderExerciseChart(hist) {
    const wrap = $('#exercise-chart-wrap');
    wrap.innerHTML = '';
    if (hist.length < 2) {
      wrap.innerHTML = '<p style="color:var(--muted);font-size:0.9rem;">Not enough data points to chart.</p>';
      return;
    }
    const isBW = hist[0].isBodyweight;
    const unit = isBW ? ' reps' : ' lbs';

    const W = 900, H = 260, pad = { t: 20, r: 30, b: 50, l: 60 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const values = hist.map(h => h.value);
    const maxV = Math.max(...values) * 1.15;
    const minV = Math.min(...values) * 0.85;
    const range = (maxV - minV) || 1;

    const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });

    for (let i = 0; i <= 4; i++) {
      const y = pad.t + plotH - (plotH * i / 4);
      chart.appendChild(svg('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: '#f0f0f0', 'stroke-width': 1 }));
      const t = svg('text', { x: pad.l - 10, y: y + 4, 'text-anchor': 'end', fill: '#676788', 'font-size': '11' });
      t.textContent = Math.round(minV + range * i / 4);
      chart.appendChild(t);
    }

    const points = hist.map((h, i) => ({
      x: pad.l + (plotW * i / (hist.length - 1 || 1)),
      y: pad.t + plotH - (plotH * (h.value - minV) / range),
      h
    }));

    const poly = svg('polyline', {
      points: points.map(p => p.x + ',' + p.y).join(' '),
      fill: 'none', stroke: '#ff7ac0', 'stroke-width': 2.5, 'stroke-linejoin': 'round'
    });
    let len = 0;
    for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    poly.style.setProperty('--dash', Math.ceil(len));
    chart.appendChild(poly);

    points.forEach((p, idx) => {
      const c = svg('circle', { cx: p.x, cy: p.y, r: 4, fill: '#ff7ac0', style: `cursor:pointer; animation-delay: ${Math.min(idx * 30, 800)}ms;`, class: 'dot' });
      attachTip(c, `${formatDate(p.h.date)}: ${p.h.value}${unit}`);
      chart.appendChild(c);
    });

    wrap.appendChild(chart);
  }

  function renderExerciseMeta(hist) {
    const wrap = $('#exercise-meta');
    if (!hist.length) { wrap.innerHTML = ''; return; }
    const isBW = hist[0].isBodyweight;
    const unit = isBW ? ' reps' : ' lbs';
    const maxLabel = isBW ? 'Max Reps' : 'Max';
    const recentLabel = isBW ? 'Recent Reps' : 'Recent';
    const maxV = Math.max(...hist.map(h => h.value));
    const recent = hist[hist.length - 1].value;
    const isPR = recent === maxV && hist.length > 1;

    let trend = '→', cls = 'trend-flat';
    if (hist.length >= 3) {
      const last3 = hist.slice(-3).map(h => h.value);
      const avg = (last3[0] + last3[1] + last3[2]) / 3;
      if (last3[2] > avg * 1.02) { trend = '↑'; cls = 'trend-up'; }
      else if (last3[2] < avg * 0.98) { trend = '↓'; cls = 'trend-down'; }
    }

    wrap.innerHTML =
      `<div class="exercise-meta__item"><strong>${maxLabel}:</strong> ${maxV}${unit}</div>
       <div class="exercise-meta__item"><strong>${recentLabel}:</strong> ${recent}${unit}</div>
       <div class="exercise-meta__item"><strong>Trend:</strong> <span class="${cls}">${trend}</span></div>` +
      (isPR ? `<span class="pr-badge" title="Most recent session ties the all-time max">🏆 PR</span>` : '');
  }

  /* ---------- Render: Muscle chart ---------- */
  function renderMuscleChart(rows) {
    const wrap = $('#muscle-chart-wrap');
    wrap.innerHTML = '';

    const groups = groupByMuscle(rows);
    const maxV = Math.max(groups.Push, groups.Pull, groups.Leg) || 1;
    const W = 700, H = 180, pad = { t: 10, r: 120, b: 10, l: 60 };
    const plotW = W - pad.l - pad.r;
    const barH = 36, gap = 16;

    const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });

    ['Push', 'Pull', 'Leg'].forEach((g, i) => {
      const y = pad.t + i * (barH + gap);
      const barW = (groups[g] / maxV) * plotW;

      const label = svg('text', { x: pad.l - 10, y: y + barH / 2 + 5, 'text-anchor': 'end', 'font-size': '14', 'font-weight': '700', fill: '#232336' });
      label.textContent = g;
      chart.appendChild(label);

      const bar = svg('rect', { x: pad.l, y, width: Math.max(barW, 2), height: barH, rx: 8, fill: GROUP_COLORS[g], class: 'bar', style: `animation-delay: ${i * 120}ms;` });
      chart.appendChild(bar);

      const val = svg('text', { x: pad.l + barW + 10, y: y + barH / 2 + 5, 'font-size': '13', 'font-weight': '600', fill: '#676788' });
      val.textContent = fmt(Math.round(groups[g]));
      chart.appendChild(val);
    });

    wrap.appendChild(chart);
  }

  /* ---------- Render: Sessions ---------- */
  function renderSessions(rows) {
    const wrap = $('#sessions-log');
    const sessions = sessionsGrouped(rows).slice(0, 7);
    wrap.innerHTML = sessions.map(s => {
      const exNames = [...new Set(s.exercises.map(e => e.exercise))];
      const tableRows = s.exercises.map(e =>
        `<tr><td>${e.exercise}</td><td>${e.set}</td><td>${e.weight ? e.weight + ' lbs' : 'BW'}</td><td>${e.reps || '-'}</td><td>${fmt(Math.round(e.volume))} lbs</td></tr>`
      ).join('');
      return `<div class="session-card" role="button" tabindex="0" aria-expanded="false">
        <div class="session-card__header">
          <span class="session-card__date">${formatDate(s.date)}</span>
          <span class="session-card__type">${s.dayType}</span>
        </div>
        <div class="session-card__stats">
          <span>Volume: ${fmt(Math.round(s.volume))} lbs</span>
          <span>${exNames.length} exercises</span>
          <span>${s.sets} sets</span>
        </div>
        <div class="session-card__details">
          <table>
            <thead><tr><th>Exercise</th><th>Set #</th><th>Weight</th><th>Reps</th><th>Volume</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>`;
    }).join('');

    // Click / keyboard to expand
    wrap.querySelectorAll('.session-card').forEach(card => {
      const toggle = () => {
        const details = card.querySelector('.session-card__details');
        const open = details.classList.toggle('open');
        card.setAttribute('aria-expanded', String(open));
      };
      card.addEventListener('click', toggle);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });
  }

  /* ---------- Range filter ---------- */
  function filterByRange(rows, rangeDays) {
    if (rangeDays === 'all') return rows;
    const days = Number(rangeDays);
    if (!days) return rows;
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - days);
    return rows.filter(r => r.date >= cutoff);
  }

  /* ---------- Init ---------- */
  async function init() {
    try {
      const resp = await fetch(CSV_URL, { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' — data feed unreachable');
      const text = await resp.text();
      const raw = parseCSV(text);
      if (!raw.length) throw new Error('Workout log is empty.');

      const allRows = cleanRows(raw);
      const chartRows = allRows.filter(r => r.weight > 0 || r.reps > 0);

      $('#loading').style.display = 'none';
      $('#dashboard').style.display = 'block';

      // Hero stats reflect all-time data
      renderHeroStats(chartRows);

      // Initial range = 30d
      let currentRange = '30';
      const rangeButtons = document.querySelectorAll('.range-btn');

      const applyRange = (range) => {
        currentRange = range;
        rangeButtons.forEach(b => {
          const active = b.dataset.range === range;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-selected', String(active));
        });
        const filtered = filterByRange(chartRows, range);
        renderWeeklyChart(filtered);
      };

      rangeButtons.forEach(b => b.addEventListener('click', () => applyRange(b.dataset.range)));

      applyRange(currentRange);
      renderExerciseTracker(chartRows);
      renderMuscleChart(chartRows);
      renderSessions(allRows);

    } catch (err) {
      console.error('[gym-dashboard] init failed', err);
      $('#loading').style.display = 'none';
      const errBox = $('#error');
      errBox.style.display = 'block';
      errBox.innerHTML = `
        <p><strong>Couldn't load workout data.</strong></p>
        <p>${err.message}</p>
        <code>${CSV_URL}</code>
      `;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
