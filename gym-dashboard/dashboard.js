(function () {
  'use strict';

  const CSV_URL = 'https://raw.githubusercontent.com/Streetlight321/pull_gym_data/refs/heads/main/output.csv';
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  /* ============ CSV PARSING (RFC 4180) ============ */
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
      headers.forEach((h, idx) => { row[h] = (vals[idx] || ''); });
      rows.push(row);
    }
    return rows;
  }

  /* ============ DATA CLEANING ============ */
  const num = (val) => { const n = parseFloat(val); return isNaN(n) ? 0 : n; };

  function cleanRows(raw) {
    return raw.map(r => {
      const dateStr = r['Date'] || '';
      const date = parseDate(dateStr);
      const dayType = (r['Day'] || '').trim();
      const exercise = normalizeExercise(r['Exercises'] || '');
      const set = num(r['Set #'] || '');
      const weight = parseWeight(r['Weight'] || '');
      const reps = parseReps(r['# of Reps'] || '');
      const volume = parseVolume(r['Volume'] || '', weight, reps);
      const isBodyweight = weight === 0;
      return { date, dateStr, dayType, exercise, set, weight, reps, volume, isBodyweight };
    }).filter(r => r.date !== null)
      .sort((a, b) => a.date - b.date);
  }

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

  function normalizeExercise(s) {
    return s.trim().replace(/\s+/g, ' ');
  }

  function parseWeight(s) {
    if (!s || /body\s*weight/i.test(s)) return 0;
    return num(s);
  }

  function parseReps(s) {
    if (!s || /failure/i.test(s) || /min/i.test(s)) return 0;
    return num(s);
  }

  function parseVolume(s, weight, reps) {
    if (!s || s === '#VALUE!') return weight * reps;
    return num(s);
  }

  /* ============ COMPUTATIONS ============ */
  function uniqueDates(rows) {
    const set = new Set();
    rows.forEach(r => set.add(r.date.toDateString()));
    return Array.from(set).sort((a, b) => new Date(a) - new Date(b));
  }

  function calcStreak(dates) {
    if (!dates.length) return 0;
    const sorted = dates.map(d => new Date(d)).sort((a, b) => b - a);
    let streak = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      const diff = (sorted[i] - sorted[i + 1]) / (1000 * 60 * 60 * 24);
      if (Math.round(diff) === 1) streak++;
      else break;
    }
    return streak;
  }

  function groupByDay(rows) {
    const dayMap = {};   // dateString -> { date, Push, Pull, Leg }
    rows.forEach(r => {
      const dt = r.dayType.charAt(0).toUpperCase() + r.dayType.slice(1).toLowerCase();
      const group = dt === 'Legs' ? 'Leg' : dt;
      if (!['Push', 'Pull', 'Leg'].includes(group)) return;
      const key = r.date.toDateString();
      if (!dayMap[key]) dayMap[key] = { date: r.date, Push: 0, Pull: 0, Leg: 0 };
      dayMap[key][group] += r.isBodyweight ? r.reps : r.volume;
    });
    const entries = Object.values(dayMap).sort((a, b) => a.date - b.date);
    const dates = entries.map(e => e.date);
    const map = {};
    entries.forEach(e => { map[e.date.toDateString()] = e; });
    return { dates, map };
  }

  function groupByMuscle(rows) {
    const groups = { Push: 0, Pull: 0, Leg: 0 };
    rows.forEach(r => {
      const dt = r.dayType.charAt(0).toUpperCase() + r.dayType.slice(1).toLowerCase();
      if (dt === 'Push' || dt === 'Pull' || dt === 'Leg' || dt === 'Legs') {
        const key = dt === 'Legs' ? 'Leg' : dt;
        groups[key] += r.isBodyweight ? r.reps : r.volume;
      }
    });
    return groups;
  }

  function muscleSessionCount(rows) {
    const map = {};
    const dateType = new Set();
    rows.forEach(r => {
      const dt = r.dayType.charAt(0).toUpperCase() + r.dayType.slice(1).toLowerCase();
      const key = dt === 'Legs' ? 'Leg' : dt;
      const sig = r.date.toDateString() + key;
      if (['Push','Pull','Leg'].includes(key) && !dateType.has(sig)) {
        dateType.add(sig);
        map[key] = (map[key] || 0) + 1;
      }
    });
    let best = '';
    let max = 0;
    for (const k in map) { if (map[k] > max) { max = map[k]; best = k; } }
    return best || 'N/A';
  }

  function exerciseHistory(rows, name) {
    const matched = rows.filter(r => r.exercise.toLowerCase() === name.toLowerCase());
    const isBW = matched.length > 0 && matched.every(r => r.isBodyweight);
    if (isBW) {
      // Group by date, compute average reps per session
      const byDate = {};
      matched.forEach(r => {
        if (r.reps <= 0) return;
        const key = r.date.toDateString();
        if (!byDate[key]) byDate[key] = { date: r.date, total: 0, count: 0 };
        byDate[key].total += r.reps;
        byDate[key].count++;
      });
      return Object.values(byDate)
        .sort((a, b) => a.date - b.date)
        .map(d => ({ date: d.date, value: Math.round(d.total / d.count), isBodyweight: true }));
    }
    return rows.filter(r => r.exercise.toLowerCase() === name.toLowerCase() && r.weight > 0)
                .map(r => ({ date: r.date, value: r.weight, isBodyweight: false }));
  }

  function sessionsGrouped(rows) {
    const map = {};
    rows.forEach(r => {
      const key = r.date.toDateString();
      if (!map[key]) map[key] = { date: r.date, dayType: r.dayType, exercises: [], volume: 0, sets: 0 };
      map[key].exercises.push(r);
      map[key].volume += r.volume;
      const setCount = (typeof r.set === 'number' && r.set > 0) ? r.set : 1;
      map[key].sets = (map[key].sets || 0) + setCount;
    });
    return Object.values(map).sort((a, b) => b.date - a.date);
  }

  /* ============ SVG HELPERS ============ */
  function makeSVG(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function fmt(n) {
    return n.toLocaleString('en-US');
  }

  /* ============ RENDER FUNCTIONS ============ */

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
      { value: heaviest.weight + ' lbs', label: 'Heaviest Lift — ' + heaviest.exercise },
    ];
    const wrap = $('#hero-stats');
    wrap.innerHTML = stats.map(s =>
      `<div class="stat-card">
        <p class="stat-card__value">${s.value}</p>
        <p class="stat-card__label">${s.label}</p>
      </div>`
    ).join('');
  }

  function renderDailySessionDetail(session) {
    const detailWrap = $('#daily-session-detail');
    if (!session) { detailWrap.innerHTML = ''; return; }
    const exNames = [...new Set(session.exercises.map(e => e.exercise))];
    const tableRows = session.exercises.map(e =>
      `<tr><td>${e.exercise}</td><td>${e.set}</td><td>${e.weight ? e.weight + ' lbs' : 'BW'}</td><td>${e.reps || '-'}</td><td>${fmt(Math.round(e.volume))} lbs</td></tr>`
    ).join('');
    detailWrap.innerHTML = `<div class="session-card">
      <button onclick="this.closest('.session-card').parentElement.innerHTML=''" style="float:right;background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--muted);">\u2715</button>
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
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>`;
    detailWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function renderWeeklyChart(rows) {
    const { dates, map } = groupByDay(rows);
    if (!dates.length) return;

    // Build session lookup by date
    const sessionsByDate = {};
    sessionsGrouped(rows).forEach(s => { sessionsByDate[s.date.toDateString()] = s; });

    const W = 900, H = 340, pad = { t: 20, r: 30, b: 60, l: 70 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const groups = ['Push', 'Pull', 'Leg'];
    const colors = { Push: '#6c63ff', Pull: '#ff7ac0', Leg: '#5ed0bd' };

    // Compute maxV across all individual day/group values
    let maxV = 0;
    dates.forEach(d => {
      const entry = map[d.toDateString()];
      groups.forEach(g => { if (entry[g] > maxV) maxV = entry[g]; });
    });
    maxV *= 1.1;
    if (maxV === 0) maxV = 1;

    // X position for each date index
    const xPos = (i) => pad.l + (plotW * i / (dates.length - 1 || 1));

    const svg = makeSVG('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
    const wrap = $('#weekly-chart-wrap');
    const tooltip = $('#tooltip');

    // Track all dot circles for selection reset
    const allDots = [];
    let selectedDot = null;

    // Grid lines
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + plotH - (plotH * i / 4);
      svg.appendChild(makeSVG('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: '#f0f0f0', 'stroke-width': 1 }));
      const txt = makeSVG('text', { x: pad.l - 10, y: y + 4, 'text-anchor': 'end', fill: '#676788', 'font-size': '11' });
      txt.textContent = fmt(Math.round(maxV * i / 4));
      svg.appendChild(txt);
    }

    // For each group, collect points where volume > 0, draw polyline + dots
    groups.forEach(g => {
      const color = colors[g];
      const pts = [];
      dates.forEach((d, i) => {
        const val = map[d.toDateString()][g];
        if (val > 0) {
          const x = xPos(i);
          const y = pad.t + plotH - (plotH * val / maxV);
          pts.push({ x, y, val, date: d, group: g });
        }
      });

      // Draw one polyline connecting all of this group's points in order
      if (pts.length >= 2) {
        svg.appendChild(makeSVG('polyline', {
          points: pts.map(p => p.x + ',' + p.y).join(' '),
          fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round'
        }));
      }

      // Draw dots with tooltips and click
      pts.forEach(p => {
        const circle = makeSVG('circle', { cx: p.x, cy: p.y, r: 4, fill: color, style: 'cursor:pointer' });
        allDots.push(circle);
        const label = g + ' \u00b7 ' + formatDate(p.date) + ': ' + fmt(Math.round(p.val));
        circle.addEventListener('mouseenter', () => {
          tooltip.style.display = 'block';
          tooltip.textContent = label;
        });
        circle.addEventListener('mousemove', (e) => {
          tooltip.style.left = e.pageX + 10 + 'px';
          tooltip.style.top = e.pageY - 30 + 'px';
        });
        circle.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
        circle.addEventListener('click', () => {
          if (selectedDot === circle) {
            // Toggle off
            circle.setAttribute('r', '4');
            circle.removeAttribute('stroke');
            circle.removeAttribute('stroke-width');
            selectedDot = null;
            $('#daily-session-detail').innerHTML = '';
            return;
          }
          // Reset previous selection
          allDots.forEach(dot => {
            dot.setAttribute('r', '4');
            dot.removeAttribute('stroke');
            dot.removeAttribute('stroke-width');
          });
          // Highlight this dot
          circle.setAttribute('r', '7');
          circle.setAttribute('stroke', '#fff');
          circle.setAttribute('stroke-width', '2');
          selectedDot = circle;
          // Show session detail
          const session = sessionsByDate[p.date.toDateString()];
          renderDailySessionDetail(session);
        });
        svg.appendChild(circle);
      });
    });

    // X-axis labels
    const step = Math.max(1, Math.floor(dates.length / 12));
    dates.forEach((d, i) => {
      if (i % step !== 0 && i !== dates.length - 1) return;
      const x = xPos(i);
      const txt = makeSVG('text', {
        x: x, y: H - pad.b + 18, 'text-anchor': 'middle', fill: '#676788', 'font-size': '10',
        transform: `rotate(-35, ${x}, ${H - pad.b + 18})`
      });
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      txt.textContent = months[d.getMonth()] + ' ' + d.getDate();
      svg.appendChild(txt);
    });

    // Legend (top-right corner inside plot area)
    const legendX = W - pad.r - 10;
    const legendY = pad.t + 10;
    groups.forEach((g, i) => {
      const y = legendY + i * 22;
      svg.appendChild(makeSVG('rect', { x: legendX - 50, y: y - 10, width: 12, height: 12, rx: 4, fill: colors[g] }));
      const txt = makeSVG('text', { x: legendX - 34, y: y, fill: '#676788', 'font-size': '12', 'font-weight': '600' });
      txt.textContent = g;
      svg.appendChild(txt);
    });

    wrap.appendChild(svg);
  }

  function renderExerciseTracker(rows) {
    const muscleSelect = $('#muscle-group-select');
    const exerciseSelect = $('#exercise-select');

    // Build a map: normalized dayType -> Set of exercise names
    // "Leg" and "Legs" both map to the "Leg" group
    const groupExercises = { All: new Set(), Push: new Set(), Pull: new Set(), Leg: new Set() };
    rows.forEach(r => {
      groupExercises.All.add(r.exercise);
      const dt = r.dayType.charAt(0).toUpperCase() + r.dayType.slice(1).toLowerCase();
      if (dt === 'Push') groupExercises.Push.add(r.exercise);
      else if (dt === 'Pull') groupExercises.Pull.add(r.exercise);
      else if (dt === 'Leg' || dt === 'Legs') groupExercises.Leg.add(r.exercise);
    });

    function populateExercises(group) {
      const names = [...groupExercises[group]].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      exerciseSelect.innerHTML = '<option value="">Select an exercise...</option>';
      names.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        exerciseSelect.appendChild(opt);
      });
    }

    // Initial population
    populateExercises('All');

    muscleSelect.addEventListener('change', () => {
      populateExercises(muscleSelect.value);
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
    const tooltip = $('#tooltip');
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
    const maxW = Math.max(...hist.map(h => h.value)) * 1.15;
    const minW = Math.min(...hist.map(h => h.value)) * 0.85;
    const range = maxW - minW || 1;

    const svg = makeSVG('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });

    // Grid
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + plotH - (plotH * i / 4);
      svg.appendChild(makeSVG('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: '#f0f0f0', 'stroke-width': 1 }));
      const txt = makeSVG('text', { x: pad.l - 10, y: y + 4, 'text-anchor': 'end', fill: '#676788', 'font-size': '11' });
      txt.textContent = Math.round(minW + range * i / 4);
      svg.appendChild(txt);
    }

    const points = hist.map((h, i) => {
      const x = pad.l + (plotW * i / (hist.length - 1 || 1));
      const y = pad.t + plotH - (plotH * (h.value - minW) / range);
      return { x, y, h };
    });

    svg.appendChild(makeSVG('polyline', {
      points: points.map(p => p.x + ',' + p.y).join(' '),
      fill: 'none', stroke: '#ff7ac0', 'stroke-width': 2.5, 'stroke-linejoin': 'round'
    }));

    points.forEach(p => {
      const circle = makeSVG('circle', { cx: p.x, cy: p.y, r: 4, fill: '#ff7ac0', style: 'cursor:pointer' });
      circle.addEventListener('mouseenter', () => {
        tooltip.style.display = 'block';
        tooltip.textContent = formatDate(p.h.date) + ': ' + p.h.value + unit;
      });
      circle.addEventListener('mousemove', (e) => {
        tooltip.style.left = e.pageX + 10 + 'px';
        tooltip.style.top = e.pageY - 30 + 'px';
      });
      circle.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
      svg.appendChild(circle);
    });

    wrap.appendChild(svg);
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
    let trend = '&rarr;';
    let cls = 'trend-flat';
    if (hist.length >= 3) {
      const last3 = hist.slice(-3).map(h => h.value);
      const avg = (last3[0] + last3[1] + last3[2]) / 3;
      if (last3[2] > avg * 1.02) { trend = '&uarr;'; cls = 'trend-up'; }
      else if (last3[2] < avg * 0.98) { trend = '&darr;'; cls = 'trend-down'; }
    }
    wrap.innerHTML =
      `<div class="exercise-meta__item"><strong>${maxLabel}:</strong> ${maxV}${unit}</div>
       <div class="exercise-meta__item"><strong>${recentLabel}:</strong> ${recent}${unit}</div>
       <div class="exercise-meta__item"><strong>Trend:</strong> <span class="${cls}">${trend}</span></div>`;
  }

  function renderMuscleChart(rows) {
    const groups = groupByMuscle(rows);
    const maxV = Math.max(groups.Push, groups.Pull, groups.Leg) || 1;
    const W = 700, H = 180, pad = { t: 10, r: 120, b: 10, l: 60 };
    const plotW = W - pad.l - pad.r;
    const barH = 36;
    const gap = 16;

    const svg = makeSVG('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
    const colors = { Push: '#6c63ff', Pull: '#ff7ac0', Leg: '#5ed0bd' };

    ['Push', 'Pull', 'Leg'].forEach((g, i) => {
      const y = pad.t + i * (barH + gap);
      const barW = (groups[g] / maxV) * plotW;

      // Label
      const label = makeSVG('text', { x: pad.l - 10, y: y + barH / 2 + 5, 'text-anchor': 'end', 'font-size': '14', 'font-weight': '700', fill: '#232336' });
      label.textContent = g;
      svg.appendChild(label);

      // Bar
      svg.appendChild(makeSVG('rect', { x: pad.l, y: y, width: Math.max(barW, 2), height: barH, rx: 8, fill: colors[g] }));

      // Value
      const val = makeSVG('text', { x: pad.l + barW + 10, y: y + barH / 2 + 5, 'font-size': '13', 'font-weight': '600', fill: '#676788' });
      val.textContent = fmt(Math.round(groups[g]));
      svg.appendChild(val);
    });

    $('#muscle-chart-wrap').appendChild(svg);
  }

  function renderSessions(rows) {
    const sessions = sessionsGrouped(rows).slice(0, 7);
    const wrap = $('#sessions-log');
    wrap.innerHTML = sessions.map((s, idx) => {
      const exNames = [...new Set(s.exercises.map(e => e.exercise))];
      const tableRows = s.exercises.map(e =>
        `<tr><td>${e.exercise}</td><td>${e.set}</td><td>${e.weight ? e.weight + ' lbs' : 'BW'}</td><td>${e.reps || '-'}</td><td>${fmt(Math.round(e.volume))} lbs</td></tr>`
      ).join('');
      return `<div class="session-card" onclick="this.querySelector('.session-card__details').classList.toggle('open')">
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
  }

  function formatDate(d) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  /* ============ INIT ============ */
  async function init() {
    try {
      const resp = await fetch(CSV_URL);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const text = await resp.text();
      const raw = parseCSV(text);
      const rows = cleanRows(raw);
      const exercises = [...new Set(rows.map(r => r.exercise))];
      console.log('Parsed rows:', rows.length, 'Unique exercises:', exercises.length);

      // Include rows that have weight OR reps (so bodyweight exercises are kept)
      const chartRows = rows.filter(r => r.weight > 0 || r.reps > 0);

      $('#loading').style.display = 'none';
      $('#dashboard').style.display = 'block';

      renderHeroStats(chartRows);
      renderWeeklyChart(chartRows);
      renderExerciseTracker(chartRows);
      renderMuscleChart(chartRows);
      renderSessions(rows);
    } catch (err) {
      $('#loading').style.display = 'none';
      $('#error').style.display = 'block';
      $('#error').innerHTML = '<p><strong>Failed to load workout data.</strong></p><p>' + err.message +
        '</p><code>' + CSV_URL + '</code>';
    }
  }

  init();
})();
