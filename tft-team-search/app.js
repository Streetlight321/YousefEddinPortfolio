// ---- Config ----
const DATA_URL = "./best_levels_2_5.json";

// ---- State ----
let rawData = null;
let currentLevel = null;
let allChamps = [];
let owned = new Set();

// ---- DOM ----
const levelSelect = document.getElementById("levelSelect");
const champSearch = document.getElementById("champSearch");
const champList = document.getElementById("champList");
const selectedChamps = document.getElementById("selectedChamps");
const minOverlap = document.getElementById("minOverlap");
const minOverlapLabel = document.getElementById("minOverlapLabel");
const sortMode = document.getElementById("sortMode");
const clearOwned = document.getElementById("clearOwned");
const showAll = document.getElementById("showAll");
const resultsEl = document.getElementById("results");
const resultCount = document.getElementById("resultCount");
const resultsSummary = document.getElementById("resultsSummary");
const champCount = document.getElementById("champCount");

// ---- Helpers ----
function uniq(arr) {
  return Array.from(new Set(arr));
}

function toLevelKeys(levelsObj) {
  return Object.keys(levelsObj).sort((a,b) => Number(a) - Number(b));
}

function flattenTeams(levelsObj) {
  const teams = [];
  for (const lvl of Object.keys(levelsObj)) {
    const comps = levelsObj[lvl] || [];
    for (const comp of comps) {
      if (Array.isArray(comp.team)) teams.push(...comp.team);
    }
  }
  return teams;
}

function chip(text, onRemove) {
  const el = document.createElement("span");
  el.className = "chip";
  el.textContent = text;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", `Remove ${text}`);
  btn.textContent = "\u00d7";
  btn.addEventListener("click", onRemove);

  el.appendChild(btn);
  return el;
}

function badge(text, cls = "") {
  const el = document.createElement("span");
  el.className = `badge ${cls}`.trim();
  el.textContent = text;
  return el;
}

function normalize(s) {
  return (s || "").toLowerCase().trim();
}

// ---- Render: Level ----
function renderLevels() {
  const levelsObj = rawData.levels;
  const keys = toLevelKeys(levelsObj);

  levelSelect.innerHTML = "";
  for (const k of keys) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = `Level ${k}`;
    levelSelect.appendChild(opt);
  }

  currentLevel = keys[0] ?? null;
  levelSelect.value = currentLevel ?? "";
  updateChampCount();
}

function updateChampCount() {
  if (!champCount) return;
  champCount.innerHTML = `<strong>${allChamps.length}</strong> champions available at this level`;
}

// ---- Render: Champion picker ----
function renderChampionPicker() {
  const q = normalize(champSearch.value);
  const filtered = allChamps.filter(c => normalize(c).includes(q));

  // Sort: selected champions first, then alphabetical
  const sorted = filtered.slice().sort((a, b) => {
    const aOwned = owned.has(a) ? 0 : 1;
    const bOwned = owned.has(b) ? 0 : 1;
    if (aOwned !== bOwned) return aOwned - bOwned;
    return a.localeCompare(b);
  });

  champList.innerHTML = "";
  for (const name of sorted) {
    const row = document.createElement("label");
    row.className = "pick" + (owned.has(name) ? " selected-champ" : "");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = owned.has(name);
    cb.addEventListener("change", () => {
      if (cb.checked) owned.add(name);
      else owned.delete(name);
      renderSelected();
      renderChampionPicker();
      renderResults();
    });

    const span = document.createElement("span");
    span.textContent = name;

    row.appendChild(cb);
    row.appendChild(span);
    champList.appendChild(row);
  }
}

function renderSelected() {
  selectedChamps.innerHTML = "";
  const items = Array.from(owned).sort((a,b) => a.localeCompare(b));
  for (const name of items) {
    selectedChamps.appendChild(
      chip(name, () => {
        owned.delete(name);
        renderSelected();
        renderChampionPicker();
        renderResults();
      })
    );
  }
}

// ---- Core scoring ----
function scoreComp(comp) {
  const team = Array.isArray(comp.team) ? comp.team : [];
  let ownedCount = 0;

  for (const u of team) {
    if (owned.has(u)) ownedCount++;
  }

  const missing = team.filter(u => !owned.has(u));
  const bronzeCount = Number(comp.bronze_count ?? (Array.isArray(comp.bronze_traits) ? comp.bronze_traits.length : 0)) || 0;

  return {
    comp,
    team,
    ownedCount,
    missing,
    missingCount: missing.length,
    teamSize: team.length,
    ratio: team.length ? ownedCount / team.length : 0,
    bronzeCount
  };
}

function sortScored(scored, mode) {
  const arr = scored.slice();
  if (mode === "bronze") {
    arr.sort((a,b) =>
      (b.bronzeCount - a.bronzeCount) ||
      (b.ownedCount - a.ownedCount) ||
      (a.missingCount - b.missingCount)
    );
  } else if (mode === "missing") {
    arr.sort((a,b) =>
      (a.missingCount - b.missingCount) ||
      (b.ownedCount - a.ownedCount) ||
      (b.bronzeCount - a.bronzeCount)
    );
  } else {
    arr.sort((a,b) =>
      (b.ownedCount - a.ownedCount) ||
      (a.missingCount - b.missingCount) ||
      (b.bronzeCount - a.bronzeCount)
    );
  }
  return arr;
}

// ---- Render: Results ----
function renderResults() {
  if (!rawData || !currentLevel) return;

  const comps = rawData.levels[currentLevel] || [];
  const min = Number(minOverlap.value) || 0;

  // Ensure slider max matches likely team sizes at this level
  const maxTeamSize = comps.reduce((m, c) => Math.max(m, (c.team || []).length), 0);
  minOverlap.max = String(Math.max(0, maxTeamSize));
  if (Number(minOverlap.value) > Number(minOverlap.max)) {
    minOverlap.value = minOverlap.max;
  }
  minOverlapLabel.textContent = minOverlap.value;

  const scored = comps.map(scoreComp).filter(s => s.ownedCount >= min);
  const sorted = sortScored(scored, sortMode.value);

  resultsEl.innerHTML = "";

  // Empty state when no champions selected and min overlap is 0
  if (owned.size === 0 && min === 0) {
    resultsSummary.innerHTML = "";
    resultsEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">&#9813;</div>
        <p>Select champions above to find the best comps for your board</p>
        <p class="small muted">${comps.length} comps available at Level ${currentLevel}</p>
      </div>
    `;
    resultCount.textContent = String(comps.length);
    return;
  }

  // Summary line
  resultsSummary.innerHTML = `<strong>${sorted.length}</strong> comp${sorted.length !== 1 ? 's' : ''} found`;

  for (const s of sorted) {
    const c = s.comp;

    const card = document.createElement("div");
    card.className = "card";

    const head = document.createElement("div");
    head.className = "card-head";

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = `Level ${currentLevel} \u2014 ${s.ownedCount}/${s.teamSize} owned`;

    const sub = document.createElement("div");
    sub.className = "card-sub";
    const maxCost = c.max_cost_allowed != null ? `Max cost: ${c.max_cost_allowed}` : null;
    const size = c.team_size != null ? `Team size: ${c.team_size}` : null;
    sub.textContent = [size, maxCost].filter(Boolean).join(" \u2022 ");

    head.appendChild(title);
    head.appendChild(sub);

    // Sections: Team, Owned, Missing, Bronze
    const kv = document.createElement("div");
    kv.className = "kv";

    const addKV = (kText, badges, bold) => {
      const k = document.createElement("div");
      k.className = "k" + (bold ? " bold" : "");
      k.textContent = kText;

      const v = document.createElement("div");
      v.className = "v";
      for (const b of badges) v.appendChild(b);

      kv.appendChild(k);
      kv.appendChild(v);
    };

    addKV("Team", s.team.map(u => badge(u)));
    addKV(`Owned (${s.ownedCount})`, s.team.filter(u => owned.has(u)).map(u => badge(u, "good")), true);
    addKV(`Missing (${s.missingCount})`, s.missing.map(u => badge(u, "miss")));

    const bronzeTraits = Array.isArray(c.bronze_traits) ? c.bronze_traits : [];
    addKV("Bronze traits", bronzeTraits.length ? bronzeTraits.map(t => badge(t)) : [badge("\u2014")]);

    card.appendChild(head);
    card.appendChild(kv);
    resultsEl.appendChild(card);
  }

  resultCount.textContent = String(sorted.length);
}

// ---- Events ----
levelSelect.addEventListener("change", () => {
  currentLevel = levelSelect.value;
  minOverlap.value = "0";
  minOverlapLabel.textContent = "0";
  renderResults();
});

champSearch.addEventListener("input", renderChampionPicker);

minOverlap.addEventListener("input", () => {
  minOverlapLabel.textContent = minOverlap.value;
  renderResults();
});

sortMode.addEventListener("change", renderResults);

clearOwned.addEventListener("click", () => {
  owned = new Set();
  champSearch.value = "";
  renderSelected();
  renderChampionPicker();
  renderResults();
});

showAll.addEventListener("click", () => {
  owned = new Set();
  champSearch.value = "";
  minOverlap.value = "0";
  minOverlapLabel.textContent = "0";
  sortMode.value = "closest";
  renderSelected();
  renderChampionPicker();
  // Show all comps by temporarily bypassing empty state
  if (!rawData || !currentLevel) return;
  const comps = rawData.levels[currentLevel] || [];
  const scored = comps.map(scoreComp);
  const sorted = sortScored(scored, "closest");

  resultsEl.innerHTML = "";
  resultsSummary.innerHTML = `<strong>${sorted.length}</strong> comp${sorted.length !== 1 ? 's' : ''} found`;

  for (const s of sorted) {
    const c = s.comp;
    const card = document.createElement("div");
    card.className = "card";

    const head = document.createElement("div");
    head.className = "card-head";

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = `Level ${currentLevel} \u2014 ${s.ownedCount}/${s.teamSize} owned`;

    const sub = document.createElement("div");
    sub.className = "card-sub";
    const maxCost = c.max_cost_allowed != null ? `Max cost: ${c.max_cost_allowed}` : null;
    const size = c.team_size != null ? `Team size: ${c.team_size}` : null;
    sub.textContent = [size, maxCost].filter(Boolean).join(" \u2022 ");

    head.appendChild(title);
    head.appendChild(sub);

    const kv = document.createElement("div");
    kv.className = "kv";

    const addKV = (kText, badges, bold) => {
      const k = document.createElement("div");
      k.className = "k" + (bold ? " bold" : "");
      k.textContent = kText;
      const v = document.createElement("div");
      v.className = "v";
      for (const b of badges) v.appendChild(b);
      kv.appendChild(k);
      kv.appendChild(v);
    };

    addKV("Team", s.team.map(u => badge(u)));
    addKV(`Owned (${s.ownedCount})`, s.team.filter(u => owned.has(u)).map(u => badge(u, "good")), true);
    addKV(`Missing (${s.missingCount})`, s.missing.map(u => badge(u, "miss")));
    const bronzeTraits = Array.isArray(c.bronze_traits) ? c.bronze_traits : [];
    addKV("Bronze traits", bronzeTraits.length ? bronzeTraits.map(t => badge(t)) : [badge("\u2014")]);

    card.appendChild(head);
    card.appendChild(kv);
    resultsEl.appendChild(card);
  }

  resultCount.textContent = String(sorted.length);
});

// ---- Init ----
async function init() {
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load JSON: ${res.status} ${res.statusText}`);
    rawData = await res.json();

    if (!rawData || typeof rawData !== "object" || !rawData.levels) {
      throw new Error("Unexpected JSON structure. Expected top-level { levels: { ... } }.");
    }

    allChamps = uniq(flattenTeams(rawData.levels)).sort((a,b) => a.localeCompare(b));

    renderLevels();
    renderSelected();
    renderChampionPicker();
    renderResults();
  } catch (err) {
    resultsEl.innerHTML = `
      <div class="card">
        <div class="card-title" style="margin-bottom:8px;">Could not load data</div>
        <div class="card-sub">${String(err.message)}</div>
        <div class="card-sub" style="margin-top:10px;">
          If you opened this via <code>file://</code>, run a local server and open <code>http://...</code> instead.
        </div>
      </div>
    `;
    resultCount.textContent = "0";
  }
}

init();
