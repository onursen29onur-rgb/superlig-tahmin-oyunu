const SUPABASE_URL =
  "https://xmdbbvhnzsswqcqibwax.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtZGJidmhuenNzd3FjcWlid2F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NjQ5ODUsImV4cCI6MjEwNTE0MDk4NX0.FkHURLNFSC6GI_tyO54CXOj_XX30kTlLQ9e9YsboAns";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const $ = id => document.getElementById(id);

const SESSION_KEY = "slt_session";
const LIVE_STATUSES = new Set([
  "1H", "HT", "2H", "ET", "BT", "P", "LIVE"
]);

let players = [];
let matches = [];
let periodRows = [];
let allMatches = [];
let completedMatches = [];
let matchPointRows = [];

let currentPlayer = null;
let activeWeek = null;
let activePeriod = null;

let comparisonRequest = 0;
let matchPointsRequest = 0;
let predictionRequest = 0;
let pollingBusy = false;
let toastTimer = null;

/* =========================================
   GENEL YARDIMCILAR
========================================= */

function escapeHTML(value) {
  const characters = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };

  return String(value ?? "").replace(
    /[&<>"']/g,
    character => characters[character]
  );
}

function toast(message) {
  const element = $("toast");
  if (!element) return;

  clearTimeout(toastTimer);
  element.textContent = message;
  element.classList.add("show");

  toastTimer = setTimeout(() => {
    element.classList.remove("show");
  }, 2500);
}

function numberTR(value) {
  return Number(value || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2
  });
}

function rankLabel(index) {
  return ["🥇", "🥈", "🥉"][index] ?? index + 1;
}

function periodStart(number) {
  return (number - 1) * 4 + 1;
}

function periodEnd(number) {
  return Math.min(number * 4, 38);
}

function hasMatchScore(match) {
  return (
    match.home_score !== null &&
    match.home_score !== undefined &&
    match.away_score !== null &&
    match.away_score !== undefined &&
    Number.isFinite(Number(match.home_score)) &&
    Number.isFinite(Number(match.away_score))
  );
}

function matchState(match) {
  const status = String(match.status || "").toUpperCase();

  if (status === "FT") return "finished";
  if (LIVE_STATUSES.has(status)) return "live";
  if (status === "NS" || status === "TBD") return "upcoming";

  return "other";
}

function validPrediction(row) {
  return Boolean(
    row &&
    row.home_prediction !== null &&
    row.home_prediction !== undefined &&
    row.away_prediction !== null &&
    row.away_prediction !== undefined &&
    Number.isInteger(Number(row.home_prediction)) &&
    Number.isInteger(Number(row.away_prediction)) &&
    Number(row.home_prediction) >= 0 &&
    Number(row.away_prediction) >= 0
  );
}

function emptyPoints() {
  return {
    scorePoints: 0,
    sidePoints: 0,
    overUnderPoints: 0,
    totalPoints: 0
  };
}

function normalizePointType(rawType) {
  const value = String(rawType || "").toLowerCase();

  if (value === "exact_score") return "scorePoints";
  if (value === "side") return "sidePoints";
  if (value === "over_under") return "overUnderPoints";

  return null;
}

function aggregatePoints(rows) {
  const result = new Map();

  for (const row of rows) {
    const key = `${row.match_id}:${row.player_id}`;
    const amount = Number(row.points);

    if (!Number.isFinite(amount)) {
      throw new Error("Geçersiz maç puanı kaydı.");
    }

    const record = result.get(key) || emptyPoints();
    const component = normalizePointType(row.point_type);

    if (component) record[component] += amount;
    record.totalPoints += amount;

    result.set(key, record);
  }

  return result;
}

function weekOpeningTime(weekMatches) {
  if (!weekMatches.length) return null;

  const times = weekMatches.map(match =>
    match.kickoff_at
      ? new Date(match.kickoff_at).getTime()
      : NaN
  );

  if (times.some(time => !Number.isFinite(time))) return null;

  return Math.min(...times);
}

function resultLabel(match) {
  const state = matchState(match);
  const score = hasMatchScore(match)
    ? `${match.home_score}-${match.away_score}`
    : "Skor bekleniyor";

  if (state === "finished") return `Sonuç: ${score}`;
  if (state === "live") return `🔴 Canlı skor: ${score}`;
  if (state === "upcoming") return "Henüz başlamadı";

  return `Durum: ${match.status || "Bilinmiyor"}`;
}

/* =========================================
   ORTAK CANLI HAVUZ HESABI
   SQL: 150 / 100 / 50
========================================= */

function calculateLivePoints(match, predictions) {
  const result = new Map();

  if (!hasMatchScore(match)) return result;

  const home = Number(match.home_score);
  const away = Number(match.away_score);

  const sideOf = (h, a) =>
    h > a ? "1" : h < a ? "2" : "X";

  const resultSide = sideOf(home, away);
  const resultOver = home + away > 2.5;

  const rows = predictions.filter(row =>
    String(row.match_id) === String(match.id) &&
    validPrediction(row)
  );

  const exactHit = row =>
    Number(row.home_prediction) === home &&
    Number(row.away_prediction) === away;

  const sideHit = row =>
    sideOf(
      Number(row.home_prediction),
      Number(row.away_prediction)
    ) === resultSide;

  const ouHit = row =>
    (
      Number(row.home_prediction) +
      Number(row.away_prediction) > 2.5
    ) === resultOver;

  const exactCount = rows.filter(exactHit).length;
  const sideCount = rows.filter(sideHit).length;
  const ouCount = rows.filter(ouHit).length;

  // Pozitif havuz payını SQL gibi iki ondalığa yuvarla.
  const share = (pool, count) => {
    if (!count) return 0;

    const scaled = pool * 100;
    const quotient = Math.floor(scaled / count);
    const remainder = scaled % count;

    return (
      quotient + (remainder * 2 >= count ? 1 : 0)
    ) / 100;
  };

  const exactShare = share(150, exactCount);
  const sideShare = share(100, sideCount);
  const ouShare = share(50, ouCount);

  for (const row of rows) {
    const record = {
      scorePoints: exactHit(row) ? exactShare : 0,
      sidePoints: sideHit(row) ? sideShare : 0,
      overUnderPoints: ouHit(row) ? ouShare : 0,
      totalPoints: 0
    };

    record.totalPoints = Math.round(
      (
        record.scorePoints +
        record.sidePoints +
        record.overUnderPoints
      ) * 100
    ) / 100;

    result.set(
      `${match.id}:${row.player_id}`,
      record
    );
  }

  return result;
}

/* =========================================
   STİLLER
========================================= */

if (!$("liveGameStyles")) {
  const style = document.createElement("style");
  style.id = "liveGameStyles";

  style.textContent = `
    .team-badge {
      display: inline-block;
      width: 24px;
      height: 24px;
      object-fit: contain;
      vertical-align: middle;
      flex-shrink: 0;
    }

    .team-badge.fallback {
      display: inline-grid;
      place-items: center;
      font-size: 18px;
      line-height: 1;
    }

    .fixture-team {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .fixture-team.home { justify-content: flex-end; }
    .fixture-team.away { justify-content: flex-start; }

    .fixture-team .team-name,
    .result-team .team-name {
      overflow-wrap: anywhere;
    }

    .teams .team {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      text-align: center;
      min-width: 0;
    }

    .teams .team .team-badge {
      width: 40px;
      height: 40px;
    }

    .teams .team .team-badge.fallback {
      font-size: 28px;
    }

    .result-teams .result-team {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-width: 0;
    }

    .feature-filter {
      display: flex;
      align-items: end;
      flex-wrap: wrap;
      gap: 12px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .feature-filter .filter-field {
      flex: 1;
      min-width: 150px;
    }

    .feature-note,
    .cmp-update-note {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.6;
    }

    .feature-note { margin: 0 0 14px; }

    .feature-message {
      padding: 22px;
      text-align: center;
      color: var(--muted);
    }

    .comparison-scroll {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .comparison-table {
      width: 100%;
      min-width: 680px;
      border-collapse: collapse;
    }

    .comparison-table th,
    .comparison-table td {
      text-align: center;
      vertical-align: middle;
    }

    .comparison-table th:first-child,
    .comparison-table td:first-child {
      text-align: left;
      min-width: 180px;
    }

    .comparison-table .my-column,
    .archive-current-player {
      background: rgba(40, 200, 255, .08);
    }

    .comparison-table .exact-hit {
      color: var(--gold);
      font-weight: 900;
      background: rgba(248, 198, 68, .1);
    }

    .comparison-table .missing-prediction {
      color: var(--muted);
    }

    .comparison-match {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 4px 0;
    }

    .comparison-match .team-badge {
      width: 22px;
      height: 22px;
    }

    .comparison-result {
      display: block;
      margin-top: 7px;
      color: var(--muted);
      font-size: 11px;
    }

    .comparison-result.live,
    .cmp-points.live,
    .match-live-label {
      color: var(--green, #36d285);
    }

    .cmp-prediction {
      font-weight: 600;
      white-space: nowrap;
    }

    .cmp-points {
      display: block;
      margin-top: 7px;
      font-size: 11px;
      line-height: 1.5;
      white-space: nowrap;
    }

    .cmp-points.live,
    .cmp-points.finished {
      font-weight: 700;
    }

    .cmp-points.finished {
      color: var(--gold, #f8c644);
    }

    .cmp-points.muted { color: var(--muted); }

    .cmp-update-note {
      padding: 12px;
      font-size: 11px;
    }

    .match-live-label {
      margin: 8px 0;
      font-size: 13px;
      font-weight: 700;
    }

    @media (max-width: 760px) {
      .fixture-team.home,
      .fixture-team.away {
        justify-content: center;
      }
    }

    @media (max-width: 600px) {
      .fixture-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 12px 10px;
        padding: 16px 12px;
      }

      .fixture-row .fixture-team.home {
        grid-column: 1;
        grid-row: 1;
      }

      .fixture-row .fixture-team.away {
        grid-column: 2;
        grid-row: 1;
      }

      .fixture-row .fixture-team.home,
      .fixture-row .fixture-team.away {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 8px;
        font-size: 12px;
        min-width: 0;
      }

      .fixture-row .fixture-team .team-badge {
        order: -1;
        width: 34px;
        height: 34px;
      }

      .fixture-row .fixture-score {
        grid-column: 1;
        grid-row: 2;
        width: 100%;
        font-size: 12px;
        padding: 9px 5px;
      }

      .fixture-row .fixture-status {
        grid-column: 2;
        grid-row: 2;
        justify-self: stretch;
        align-self: center;
        font-size: 11px;
        white-space: normal;
      }

      .feature-filter { align-items: stretch; }
      .feature-filter .btn { width: 100%; }

      .comparison-table th,
      .comparison-table td {
        padding: 10px 8px;
        font-size: 12px;
      }
    }
  `;

  document.head.appendChild(style);
}

/* =========================================
   TAKIM LOGOLARI
========================================= */

function teamBadge(url, name) {
  const fallback =
    '<span class="team-badge fallback" aria-hidden="true">⚽</span>';

  if (!url) return fallback;

  let parsed;

  try {
    parsed = new URL(String(url).trim());
  } catch {
    return fallback;
  }

  if (parsed.protocol !== "https:") return fallback;

  const image = document.createElement("img");
  image.className = "team-badge";
  image.src = parsed.href;
  image.alt = `${name || "Takım"} logosu`;
  image.loading = "lazy";
  image.decoding = "async";

  return image.outerHTML;
}

document.addEventListener("error", event => {
  const image = event.target;

  if (
    !(image instanceof HTMLImageElement) ||
    !image.classList.contains("team-badge")
  ) return;

  const fallback = document.createElement("span");
  fallback.className = "team-badge fallback";
  fallback.textContent = "⚽";
  fallback.setAttribute("aria-hidden", "true");

  image.replaceWith(fallback);
}, true);

/* =========================================
   OTURUM
========================================= */

function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw);
    const expiresAt = new Date(session.expiresAt).getTime();

    if (
      !session.token ||
      !session.playerId ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    ) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function sessionToken() {
  return getSession()?.token || null;
}

function showLogin() {
  currentPlayer = null;
  comparisonRequest++;
  matchPointsRequest++;
  predictionRequest++;

  $("gameArea")?.classList.add("hidden");
  $("loginCard")?.classList.remove("hidden");

  for (const id of [
    "matchGrid", "comparisonContent",
    "matchPointsBody", "matchMvpCards"
  ]) {
    if ($(id)) $(id).innerHTML = "";
  }

  $("selectedMatchResult")?.classList.add("hidden");

  if ($("pinInput")) $("pinInput").value = "";
  if ($("activePlayerName")) $("activePlayerName").textContent = "";
}

function handleSessionError(error) {
  const message = String(error?.message || "");

  if (
    message.includes("Oturum gecersiz") ||
    message.includes("Oturum geçersiz")
  ) {
    clearSession();
    showLogin();
    toast("Oturum geçersiz veya süresi doldu. Tekrar giriş yap.");
    return true;
  }

  return false;
}

async function enterGame(playerId, playerName) {
  currentPlayer = String(playerId);

  $("loginCard")?.classList.add("hidden");
  $("gameArea")?.classList.remove("hidden");

  if ($("activePlayerName")) {
    $("activePlayerName").textContent = playerName || "";
  }

  await loadPredictions();

  if (!currentPlayer || !sessionToken()) return;

  renderArchiveOptions();
  renderComparisonOptions();
  await refreshVisibleDetails();
}

/* =========================================
   OYUNCULAR VE MAÇLAR
========================================= */

async function loadPlayers() {
  const { data, error } = await supabaseClient
    .from("players")
    .select("id,name,total_points")
    .order("total_points", { ascending: false });

  if (error) throw error;

  players = data || [];

  const select = $("playerSelect");

  if (select) {
    const previous = select.value;

    select.innerHTML =
      '<option value="">Oyuncu seç...</option>' +
      players.map(player => `
        <option value="${escapeHTML(player.id)}">
          ${escapeHTML(player.name)}
        </option>
      `).join("");

    if (previous) select.value = previous;
  }

  renderLeaderboard();
}

function updateMatchCollections() {
  if (!allMatches.length) {
    matches = [];
    completedMatches = [];
    activeWeek = null;
    activePeriod = null;
    return;
  }

  const weeks = [...new Set(
    allMatches.map(match => Number(match.week))
  )].sort((a, b) => a - b);

  const incomplete = weeks.filter(week =>
    allMatches
      .filter(match => Number(match.week) === week)
      .some(match => matchState(match) !== "finished")
  );

  activeWeek = incomplete[0] ?? Math.max(...weeks);
  activePeriod = Math.floor((activeWeek - 1) / 4) + 1;

  matches = allMatches.filter(
    match => Number(match.week) === activeWeek
  );

  // Seçici artık canlı ve biten maçları birlikte içerir.
  completedMatches = allMatches
    .filter(match =>
      ["live", "finished"].includes(matchState(match))
    )
    .sort((a, b) => {
      const liveA = matchState(a) === "live" ? 1 : 0;
      const liveB = matchState(b) === "live" ? 1 : 0;

      return (
        liveB - liveA ||
        Number(b.week) - Number(a.week) ||
        new Date(b.kickoff_at) - new Date(a.kickoff_at)
      );
    });
}

async function loadMatches() {
  const { data, error } = await supabaseClient
    .from("matches")
    .select("*")
    .neq("home_team", "HISTORICAL")
    .order("week", { ascending: true })
    .order("kickoff_at", { ascending: true });

  if (error) throw error;

  allMatches = data || [];
  updateMatchCollections();

  renderCompletedMatchSelect();
  renderFixtureWeekOptions();
  renderComparisonOptions();

  if ($("activeWeekEyebrow")) {
    $("activeWeekEyebrow").textContent =
      activeWeek ? `${activeWeek}. HAFTA` : "";
  }

  if ($("matchesTitle")) {
    $("matchesTitle").textContent =
      activeWeek ? `${activeWeek}. Hafta Maçları` : "Maçlar";
  }

  if (!allMatches.length && $("weekSummary")) {
    $("weekSummary").textContent = "Maç bulunamadı.";
  }
}

/* =========================================
   FİKSTÜR
========================================= */

function renderFixtureWeekOptions() {
  const select = $("fixtureWeekSelect");
  if (!select) return;

  const weeks = [...new Set(
    allMatches.map(match => Number(match.week))
  )].sort((a, b) => a - b);

  const previous = Number(select.value);

  select.innerHTML = weeks.map(week => `
    <option value="${week}">${week}. Hafta</option>
  `).join("");

  if (weeks.length) {
    select.value = String(
      weeks.includes(previous) ? previous : activeWeek
    );
  }

  renderFixtureList(Number(select.value));
}

function renderFixtureList(week) {
  const container = $("fixtureList");
  if (!container) return;

  const rows = allMatches
    .filter(match => Number(match.week) === Number(week))
    .sort((a, b) =>
      new Date(a.kickoff_at) - new Date(b.kickoff_at)
    );

  if (!rows.length) {
    container.innerHTML =
      '<p class="empty-state">Bu hafta için maç bulunamadı.</p>';
    return;
  }

  container.innerHTML = rows.map(match => {
    const state = matchState(match);
    const cssState = state === "other" ? "upcoming" : state;

    const display = ["live", "finished"].includes(state)
      ? hasMatchScore(match)
        ? `${match.home_score} - ${match.away_score}`
        : "Skor bekleniyor"
      : new Date(match.kickoff_at).toLocaleString("tr-TR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        });

    const label = state === "finished"
      ? "✓ Tamamlandı"
      : state === "live"
        ? "🔴 Canlı"
        : state === "upcoming"
          ? "Henüz oynanmadı"
          : `Durum: ${match.status || "Bilinmiyor"}`;

    return `
      <div class="fixture-row ${cssState}">
        <span class="fixture-team home">
          <span class="team-name">${escapeHTML(match.home_team)}</span>
          ${teamBadge(match.home_team_badge, match.home_team)}
        </span>

        <span class="fixture-score">${escapeHTML(display)}</span>

        <span class="fixture-team away">
          ${teamBadge(match.away_team_badge, match.away_team)}
          <span class="team-name">${escapeHTML(match.away_team)}</span>
        </span>

        <span class="fixture-status ${cssState}">
          ${escapeHTML(label)}
        </span>
      </div>
    `;
  }).join("");
}

/* =========================================
   KLASMAN VE DÖNEMLER
========================================= */

function podiumHTML(rows) {
  return rows.map((player, index) => `
    <div class="pod">
      <div class="medal">${rankLabel(index)}</div>
      <div class="name">${escapeHTML(player.name)}</div>
      <div class="points">${numberTR(player.total_points)}</div>
    </div>
  `).join("");
}

function rankingHTML(rows, highlight = false) {
  const top = Number(rows[0]?.total_points || 0);

  return rows.map((player, index) => `
    <tr class="${
      highlight && String(player.id) === String(currentPlayer)
        ? "archive-current-player"
        : ""
    }">
      <td>${rankLabel(index)}</td>
      <td>${escapeHTML(player.name)}</td>
      <td class="points">${numberTR(player.total_points)}</td>
      <td>
        ${
          index === 0
            ? "-"
            : numberTR(top - Number(player.total_points || 0))
        }
      </td>
    </tr>
  `).join("");
}

function renderLeaderboard() {
  const rows = [...players].sort(
    (a, b) =>
      Number(b.total_points || 0) - Number(a.total_points || 0)
  );

  if ($("leaderBody")) {
    $("leaderBody").innerHTML = rankingHTML(rows);
  }

  const top = rows
    .filter(player => Number(player.total_points || 0) > 0)
    .slice(0, 3);

  if ($("podium")) {
    $("podium").innerHTML = top.length
      ? podiumHTML(top)
      : '<div class="card empty-state">Henüz puan bulunmuyor.</div>';
  }
}

async function loadPeriodLeaderboard() {
  const { data, error } = await supabaseClient
    .from("period_leaderboard")
    .select("*")
    .order("period_no", { ascending: true })
    .order("total_points", { ascending: false });

  if (error) throw error;

  periodRows = data || [];
  renderPeriodViews();
}

function rowsForPeriod(number) {
  const points = new Map();

  periodRows
    .filter(row => Number(row.period_no) === Number(number))
    .forEach(row => {
      const id = row.player_id ?? row.id;
      if (id === null || id === undefined) return;

      points.set(String(id), Number(row.total_points || 0));
    });

  return players.map(player => ({
    id: player.id,
    name: player.name,
    total_points: points.get(String(player.id)) || 0
  })).sort((a, b) =>
    b.total_points - a.total_points ||
    a.name.localeCompare(b.name, "tr")
  );
}

function renderPeriodViews() {
  if (!activePeriod) {
    renderArchiveOptions();
    return;
  }

  const rows = rowsForPeriod(activePeriod);

  if ($("activePeriodTitle")) {
    $("activePeriodTitle").textContent =
      `⚡ Aktif Dönem: Hafta ${periodStart(activePeriod)}-${periodEnd(activePeriod)}`;
  }

  if ($("activePeriodDescription")) {
    $("activePeriodDescription").textContent =
      `Dönem ${activePeriod} canlı sıralaması. İlk üç oyuncu kürsüde gösterilir.`;
  }

  if ($("periodBody")) {
    $("periodBody").innerHTML = rankingHTML(rows);
  }

  if ($("periodPodium")) {
    $("periodPodium").innerHTML =
      rows.some(player => player.total_points > 0)
        ? podiumHTML(rows.slice(0, 3))
        : '<div class="card empty-state">Aktif dönem için henüz puan bulunmuyor.</div>';
  }

  const highest = Math.max(
    activePeriod,
    ...periodRows.map(row => Number(row.period_no || 0))
  );

  const numbers = Array.from(
    { length: highest },
    (_, index) => index + 1
  );

  renderPeriodPodiums(numbers);
  renderMedals(numbers);
  renderArchiveOptions();
}

function renderPeriodPodiums(numbers) {
  const container = $("periodPodiums");
  if (!container) return;

  container.innerHTML = numbers.map(number => {
    const rows = rowsForPeriod(number);
    const top = rows.some(player => player.total_points > 0)
      ? rows.slice(0, 3)
      : [];

    const completed = periodEnd(number) < activeWeek;
    const current = number === activePeriod;

    const status = completed
      ? "TAMAMLANDI"
      : current ? "DEVAM EDİYOR" : "YAKINDA";

    return `
      <article class="card rule ${
        completed ? "score" : current ? "side" : "ou"
      }">
        <span class="eyebrow">${status}</span>
        <h3>Dönem ${number}</h3>
        <p>Hafta ${periodStart(number)} - ${periodEnd(number)}</p>

        <div class="period-ranking">
          ${
            top.length
              ? top.map((player, index) => `
                <p>
                  <span>${rankLabel(index)}</span>
                  <strong>${escapeHTML(player.name)}</strong>
                  <span>${numberTR(player.total_points)} puan</span>
                </p>
              `).join("")
              : '<p class="empty-period">Henüz puan bulunmuyor.</p>'
          }
        </div>
      </article>
    `;
  }).join("");
}

function renderMedals(numbers) {
  const body = $("medalBody");
  if (!body) return;

  const medals = new Map(players.map(player => [
    String(player.id),
    { name: player.name, gold: 0, silver: 0, bronze: 0 }
  ]));

  numbers
    .filter(number => periodEnd(number) < activeWeek)
    .forEach(number => {
      const rows = rowsForPeriod(number);
      if (!rows.some(player => player.total_points > 0)) return;

      rows.slice(0, 3).forEach((player, index) => {
        const record = medals.get(String(player.id));
        if (!record) return;

        record[["gold", "silver", "bronze"][index]]++;
      });
    });

  const rows = [...medals.values()].sort((a, b) =>
    b.gold - a.gold ||
    b.silver - a.silver ||
    b.bronze - a.bronze ||
    a.name.localeCompare(b.name, "tr")
  );

  body.innerHTML = rows.map((player, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHTML(player.name)}</td>
      <td>${player.gold}</td>
      <td>${player.silver}</td>
      <td>${player.bronze}</td>
      <td class="points">
        ${player.gold + player.silver + player.bronze}
      </td>
    </tr>
  `).join("");
}

/* =========================================
   DÖNEM ARŞİVİ
========================================= */

function setupArchive() {
  const panel = $("periodsPanel");
  if (!panel || $("periodArchiveSection")) return;

  const section = document.createElement("section");
  section.id = "periodArchiveSection";

  section.innerHTML = `
    <div class="section-head">
      <div>
        <h2>📅 Dönem Arşivi</h2>
        <p>Tüm oyuncuların dönem puanlarını ve sıralamasını görüntüle.</p>
      </div>
    </div>

    <div class="card feature-filter">
      <div class="filter-field">
        <label for="archivePeriodSelect">Dönem</label>
        <select id="archivePeriodSelect"></select>
      </div>
    </div>

    <p id="archivePeriodNote" class="feature-note"></p>

    <div class="card table-card">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Oyuncu</th>
            <th>Dönem Puanı</th>
            <th>Lidere Fark</th>
          </tr>
        </thead>
        <tbody id="archivePeriodBody"></tbody>
      </table>
    </div>
  `;

  panel.appendChild(section);

  $("archivePeriodSelect").addEventListener(
    "change",
    renderArchiveTable
  );
}

function renderArchiveOptions() {
  const select = $("archivePeriodSelect");
  if (!select) return;

  const previous = Number(select.value);

  const numbers = [...new Set([
    ...periodRows.map(row => Number(row.period_no)),
    Number(activePeriod)
  ])]
    .filter(number => Number.isInteger(number) && number > 0)
    .sort((a, b) => a - b);

  select.innerHTML = numbers.map(number => `
    <option value="${number}">
      Dönem ${number} · Hafta ${periodStart(number)}-${periodEnd(number)}
    </option>
  `).join("");

  if (!numbers.length) {
    $("archivePeriodBody").innerHTML =
      '<tr><td colspan="4">Henüz dönem verisi bulunmuyor.</td></tr>';
    return;
  }

  select.value = String(
    numbers.includes(previous)
      ? previous
      : activePeriod || numbers[0]
  );

  renderArchiveTable();
}

function renderArchiveTable() {
  const select = $("archivePeriodSelect");
  const body = $("archivePeriodBody");
  if (!select || !body || !select.value) return;

  const number = Number(select.value);

  if ($("archivePeriodNote")) {
    $("archivePeriodNote").textContent =
      `Hafta ${periodStart(number)}-${periodEnd(number)} · ` +
      (
        number === activePeriod
          ? "Aktif dönem; puanlar değişebilir."
          : "Seçilen dönemin mevcut puan kayıtları."
      );
  }

  const hasData = periodRows.some(
    row => Number(row.period_no) === number
  );

  body.innerHTML = hasData
    ? rankingHTML(rowsForPeriod(number), true)
    : '<tr><td colspan="4">Bu dönem için henüz puan kaydı bulunmuyor.</td></tr>';
}

/* =========================================
   MAÇ PUANLARI: CANLI + BİTEN
========================================= */

function renderCompletedMatchSelect() {
  const select = $("completedMatchSelect");
  if (!select) return;

  const previous = select.value;

  select.innerHTML =
    '<option value="">Canlı veya biten maç seç...</option>' +
    completedMatches.map(match => `
      <option value="${escapeHTML(match.id)}">
        ${matchState(match) === "live" ? "🔴 CANLI" : "✓ BİTTİ"} ·
        ${escapeHTML(match.week)}. Hafta ·
        ${escapeHTML(match.home_team)}
        ${
          hasMatchScore(match)
            ? `${escapeHTML(match.home_score)}-${escapeHTML(match.away_score)}`
            : "Skor bekleniyor"
        }
        ${escapeHTML(match.away_team)}
      </option>
    `).join("");

  if (completedMatches.some(match =>
    String(match.id) === previous
  )) {
    select.value = previous;
  }
}

function clearMatchDetails(message) {
  matchPointRows = [];
  $("selectedMatchResult")?.classList.add("hidden");

  if ($("matchMvpCards")) $("matchMvpCards").innerHTML = "";

  if ($("matchPointsBody")) {
    $("matchPointsBody").innerHTML = `
      <tr><td colspan="7">${escapeHTML(message)}</td></tr>
    `;
  }
}

async function loadMatchPoints(matchId, quiet = false) {
  const request = ++matchPointsRequest;

  if (!$("matchPointsBody")) return;

  if (!matchId) {
    clearMatchDetails("Puan detayları için canlı veya biten bir maç seç.");
    return;
  }

  const token = sessionToken();
  const viewer = String(currentPlayer);

  if (!token || !currentPlayer) {
    handleSessionError({ message: "Oturum gecersiz" });
    return;
  }

  const stillCurrent = () =>
    request === matchPointsRequest &&
    token === sessionToken() &&
    viewer === String(currentPlayer) &&
    String($("completedMatchSelect")?.value) === String(matchId);

  if (!quiet) clearMatchDetails("Maç puanları yükleniyor...");

  try {
    // Seçilen maçın en güncel durumunu al.
    const matchResponse = await supabaseClient
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();

    if (!stillCurrent()) return;
    if (matchResponse.error) throw matchResponse.error;

    const match = matchResponse.data;
    const state = matchState(match);

    if (!["live", "finished"].includes(state)) {
      clearMatchDetails("Bu maç şu anda canlı veya tamamlanmış durumda değil.");
      return;
    }

    const weekResponse = await supabaseClient
      .from("matches")
      .select("id,kickoff_at")
      .eq("week", Number(match.week))
      .neq("home_team", "HISTORICAL");

    if (!stillCurrent()) return;
    if (weekResponse.error) throw weekResponse.error;

    const opening = weekOpeningTime(weekResponse.data || []);

    if (opening === null || Date.now() < opening) {
      clearMatchDetails("Hafta henüz açılmadı veya maç saatleri geçersiz.");
      return;
    }

    const [predictionResponse, pointResponse] = await Promise.all([
      supabaseClient.rpc("get_my_week_predictions", {
        p_token: token,
        p_week: Number(match.week)
      }),

      state === "finished"
        ? supabaseClient
            .from("match_points")
            .select("player_id,match_id,point_type,points")
            .eq("match_id", matchId)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (!stillCurrent()) return;
    if (predictionResponse.error) throw predictionResponse.error;
    if (pointResponse.error) throw pointResponse.error;

    const predictions = (predictionResponse.data || []).filter(
      row => String(row.match_id) === String(match.id)
    );

    const predictionMap = new Map(
      predictions.map(row => [String(row.player_id), row])
    );

    const pointMap = state === "live"
      ? calculateLivePoints(match, predictions)
      : aggregatePoints(pointResponse.data || []);

    matchPointRows = players.map(player => {
      const prediction = predictionMap.get(String(player.id));
      const hasPrediction = validPrediction(prediction);

      return {
        id: player.id,
        name: player.name,
        hasPrediction,
        prediction: hasPrediction
          ? `${prediction.home_prediction}-${prediction.away_prediction}`
          : "Tahmin yok",
        ...(pointMap.get(`${match.id}:${player.id}`) || emptyPoints())
      };
    }).sort((a, b) =>
      b.totalPoints - a.totalPoints ||
      b.scorePoints - a.scorePoints ||
      a.name.localeCompare(b.name, "tr")
    );

    if (!hasMatchScore(match)) {
      clearMatchDetails("Maç devam ediyor; skor verisi henüz gelmedi.");
      return;
    }

    renderSelectedMatchResult(match);
    renderMatchMvpCards(state === "live");
    renderMatchPointsTable(state === "live");
  } catch (error) {
    if (!stillCurrent()) return;

    console.error("Maç puanları hatası:", error);

    if (handleSessionError(error)) return;

    clearMatchDetails(
      `Güncel maç puanları alınamadı: ${error.message || ""}`
    );
  }
}

function renderSelectedMatchResult(match) {
  const card = $("selectedMatchResult");
  if (!card) return;

  const live = matchState(match) === "live";

  const sum = key =>
    matchPointRows.reduce((total, row) => total + row[key], 0);

  card.classList.remove("hidden");

  card.innerHTML = `
    <div class="result-week">
      ${escapeHTML(match.week)}. HAFTA
    </div>

    <div class="${live ? "match-live-label" : "feature-note"}">
      ${
        live
          ? "🟢 Canlı · Puanlar ve MVP değişebilir"
          : "✓ Maç tamamlandı · Kayıtlı puanlar"
      }
    </div>

    <div class="result-teams">
      <span class="result-team">
        <span class="team-name">${escapeHTML(match.home_team)}</span>
        ${teamBadge(match.home_team_badge, match.home_team)}
      </span>

      <strong>
        ${escapeHTML(match.home_score)} -
        ${escapeHTML(match.away_score)}
      </strong>

      <span class="result-team">
        ${teamBadge(match.away_team_badge, match.away_team)}
        <span class="team-name">${escapeHTML(match.away_team)}</span>
      </span>
    </div>

    <div class="result-pool-summary">
      <div>
        <small>Tam Skor</small>
        <b>${numberTR(sum("scorePoints"))}</b>
      </div>
      <div>
        <small>Taraf</small>
        <b>${numberTR(sum("sidePoints"))}</b>
      </div>
      <div>
        <small>Alt / Üst</small>
        <b>${numberTR(sum("overUnderPoints"))}</b>
      </div>
      <div class="total">
        <small>${live ? "Anlık Toplam" : "Dağıtılan Toplam"}</small>
        <b>${numberTR(sum("totalPoints"))}</b>
      </div>
    </div>

    <div class="cmp-update-note">
      Son veri çekimi:
      ${escapeHTML(new Date().toLocaleTimeString("tr-TR"))}
      ${
        live
          ? "<br>Hesaplama son alınan skora dayanır; maç bitene kadar değişebilir."
          : ""
      }
    </div>
  `;
}

function bestInComponent(key) {
  const rows = matchPointRows.filter(row => Number(row[key]) > 0);
  if (!rows.length) return null;

  const best = Math.max(...rows.map(row => Number(row[key])));

  return {
    names: rows
      .filter(row => Number(row[key]) === best)
      .map(row => row.name)
      .join(", "),
    points: best
  };
}

function mvpCard(icon, title, winner, extraClass = "") {
  return `
    <article class="card mvp-card ${extraClass}">
      <div class="mvp-icon">${icon}</div>
      <div class="mvp-title">${escapeHTML(title)}</div>
      <div class="mvp-player">
        ${winner ? escapeHTML(winner.names) : "Puan kazanan yok"}
      </div>
      <div class="mvp-points">
        ${winner ? `${numberTR(winner.points)} puan` : "-"}
      </div>
    </article>
  `;
}

function renderMatchMvpCards(live = false) {
  const container = $("matchMvpCards");
  if (!container) return;

  container.innerHTML = [
    mvpCard("🎯", "Tam Skor Kralı", bestInComponent("scorePoints")),
    mvpCard("✅", "Taraf Uzmanı", bestInComponent("sidePoints")),
    mvpCard("⚽", "Alt / Üst Avcısı", bestInComponent("overUnderPoints")),
    mvpCard(
      "🏆",
      live ? "Anlık Maç MVP" : "Maç MVP",
      bestInComponent("totalPoints"),
      "winner"
    )
  ].join("");
}

function renderPointComponent(points, component) {
  const value = Number(points || 0);

  return value <= 0
    ? '<span class="point-chip zero">0</span>'
    : `<span class="point-chip ${component}">+${numberTR(value)}</span>`;
}

function renderMatchPointsTable(live = false) {
  const body = $("matchPointsBody");
  if (!body) return;

  if (!matchPointRows.length) {
    body.innerHTML =
      '<tr><td colspan="7">Oyuncu bulunamadı.</td></tr>';
    return;
  }

  body.innerHTML = matchPointRows.map((player, index) => {
    const hasPoints = player.totalPoints > 0;

    return `
      <tr class="${
        index < 3 && hasPoints ? `match-rank-${index + 1}` : ""
      }">
        <td>${hasPoints ? rankLabel(index) : index + 1}</td>
        <td><strong>${escapeHTML(player.name)}</strong></td>
        <td>
          <span class="${
            player.hasPrediction ? "prediction-score" : "no-prediction"
          }">
            ${escapeHTML(player.prediction)}
          </span>
        </td>
        <td>${renderPointComponent(player.scorePoints, "exact")}</td>
        <td>${renderPointComponent(player.sidePoints, "side")}</td>
        <td>${renderPointComponent(player.overUnderPoints, "ou")}</td>
        <td>
          <span class="match-total-points">
            ${numberTR(player.totalPoints)}
          </span>
          ${
            live
              ? '<small class="cmp-points live">🟢 Canlı</small>'
              : ""
          }
        </td>
      </tr>
    `;
  }).join("");
}

/* =========================================
   KARŞILAŞTIRMA
========================================= */

function setupComparison() {
  const tabs = document.querySelector(".tabs");
  const gameArea = $("gameArea");

  if (!tabs || !gameArea || $("comparisonPanel")) return;

  const button = document.createElement("button");
  button.className = "tab";
  button.type = "button";
  button.dataset.tab = "comparison";
  button.textContent = "⚔️ Karşılaştırma";
  tabs.appendChild(button);

  const panel = document.createElement("section");
  panel.id = "comparisonPanel";
  panel.className = "tab-panel hidden";

  panel.innerHTML = `
    <div class="section-head">
      <div>
        <h2>⚔️ Tahmin Karşılaştırma</h2>
        <p>Tahminleri ve maç bazlı puanları yan yana karşılaştır.</p>
      </div>
    </div>

    <div class="card feature-filter">
      <div class="filter-field">
        <label for="comparisonWeekSelect">Hafta</label>
        <select id="comparisonWeekSelect"></select>
      </div>

      <button
        id="comparisonRefreshBtn"
        class="btn ghost"
        type="button">
        Yenile
      </button>
    </div>

    <p class="feature-note">
      Tüm oyuncuları görmek için tabloyu yatay kaydır.
      Canlı puanlar son alınan skora göre değişir.
      Altın hücreler biten maçlarda tam skor eşleşmesini gösterir.
    </p>

    <div id="comparisonContent" class="card comparison-scroll"></div>
  `;

  gameArea.appendChild(panel);

  $("comparisonWeekSelect").addEventListener("change", () => {
    renderComparison();
  });

  $("comparisonRefreshBtn").addEventListener("click", async () => {
    const button = $("comparisonRefreshBtn");
    button.disabled = true;

    try {
      await loadPlayers();
      await loadMatches();
      await renderComparison();
    } catch (error) {
      toast(error.message || "Veriler yenilenemedi");
    } finally {
      button.disabled = false;
    }
  });
}

function renderComparisonOptions() {
  const select = $("comparisonWeekSelect");
  if (!select) return;

  const previous = Number(select.value);

  const weeks = [...new Set(
    allMatches.map(match => Number(match.week))
  )]
    .filter(week => Number.isInteger(week) && week > 0)
    .sort((a, b) => a - b);

  select.innerHTML = weeks.map(week => `
    <option value="${week}">${week}. Hafta</option>
  `).join("");

  if (weeks.length) {
    select.value = String(
      weeks.includes(previous) ? previous : activeWeek || weeks[0]
    );
  }
}

async function renderComparison(quiet = false) {
  const request = ++comparisonRequest;
  const container = $("comparisonContent");
  const select = $("comparisonWeekSelect");

  if (!container || !select) return;

  if (!select.value) {
    container.innerHTML =
      '<div class="feature-message">Hafta bulunamadı.</div>';
    return;
  }

  const week = Number(select.value);
  const token = sessionToken();
  const viewer = String(currentPlayer);

  if (!token || !currentPlayer) {
    handleSessionError({ message: "Oturum gecersiz" });
    return;
  }

  const stillCurrent = () =>
    request === comparisonRequest &&
    token === sessionToken() &&
    viewer === String(currentPlayer) &&
    week === Number(select.value);

  if (!quiet) {
    container.innerHTML =
      '<div class="feature-message">Tahminler ve puanlar yükleniyor...</div>';
  }

  try {
    const matchResponse = await supabaseClient
      .from("matches")
      .select("*")
      .eq("week", week)
      .neq("home_team", "HISTORICAL")
      .order("kickoff_at", { ascending: true });

    if (!stillCurrent()) return;
    if (matchResponse.error) throw matchResponse.error;

    const weekMatches = matchResponse.data || [];
    const opening = weekOpeningTime(weekMatches);

    if (!weekMatches.length) {
      container.innerHTML =
        '<div class="feature-message">Bu hafta için maç bulunamadı.</div>';
      return;
    }

    if (opening === null) {
      container.innerHTML =
        '<div class="feature-message">Maç saatleri geçersiz. Karşılaştırma açılmadı.</div>';
      return;
    }

    if (Date.now() < opening) {
      container.innerHTML = `
        <div class="feature-message">
          🔒 Bu haftanın tahminleri henüz gizli.
          <br><br>
          Açılış:
          ${escapeHTML(new Date(opening).toLocaleString("tr-TR"))}
        </div>
      `;
      return;
    }

    const finishedIds = weekMatches
      .filter(match => matchState(match) === "finished")
      .map(match => match.id);

    const [predictionResponse, pointResponse] = await Promise.all([
      supabaseClient.rpc("get_my_week_predictions", {
        p_token: token,
        p_week: week
      }),

      finishedIds.length
        ? supabaseClient
            .from("match_points")
            .select("player_id,match_id,point_type,points")
            .in("match_id", finishedIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (!stillCurrent()) return;
    if (predictionResponse.error) throw predictionResponse.error;
    if (pointResponse.error) throw pointResponse.error;

    const rows = predictionResponse.data || [];
    const predictionMap = new Map(
      rows.map(row => [
        `${row.match_id}:${row.player_id}`,
        row
      ])
    );

    const storedPoints = aggregatePoints(pointResponse.data || []);
    const livePoints = new Map();

    weekMatches.forEach(match => {
      if (matchState(match) !== "live") return;

      calculateLivePoints(match, rows).forEach((record, key) => {
        livePoints.set(key, record);
      });
    });

    const orderedPlayers = [...players].sort(
      (a, b) => a.name.localeCompare(b.name, "tr")
    );

    function pointHTML(match, player, prediction) {
      if (!validPrediction(prediction)) {
        return '<small class="cmp-points muted">Tahmin yok</small>';
      }

      const state = matchState(match);

      if (state === "upcoming") {
        return '<small class="cmp-points muted">Bekliyor</small>';
      }

      if (state === "other") {
        return '<small class="cmp-points muted">Durum bekleniyor</small>';
      }

      if (!hasMatchScore(match)) {
        return '<small class="cmp-points muted">Skor bekleniyor</small>';
      }

      const key = `${match.id}:${player.id}`;

      const record = (
        state === "live"
          ? livePoints.get(key)
          : storedPoints.get(key)
      ) || emptyPoints();

      const detail =
        `Tam skor: ${numberTR(record.scorePoints)} · ` +
        `Taraf: ${numberTR(record.sidePoints)} · ` +
        `Alt/Üst: ${numberTR(record.overUnderPoints)}`;

      const amount =
        `${record.totalPoints > 0 ? "+" : ""}` +
        numberTR(record.totalPoints);

      return `
        <small
          class="cmp-points ${state}"
          title="${escapeHTML(detail)}">
          ${
            state === "live"
              ? `🟢 Canlı: ${amount} puan`
              : `✓ ${amount} puan`
          }
        </small>
      `;
    }

    const scrollLeft = container.scrollLeft;

    container.innerHTML = `
      <table class="comparison-table">
        <thead>
          <tr>
            <th>Maç</th>
            ${orderedPlayers.map(player => `
              <th class="${
                String(player.id) === viewer ? "my-column" : ""
              }">
                ${escapeHTML(player.name)}
              </th>
            `).join("")}
          </tr>
        </thead>

        <tbody>
          ${weekMatches.map(match => {
            const state = matchState(match);

            return `
              <tr>
                <td>
                  <div class="comparison-match">
                    ${teamBadge(match.home_team_badge, match.home_team)}
                    <span>${escapeHTML(match.home_team)}</span>
                  </div>

                  <div class="comparison-match">
                    ${teamBadge(match.away_team_badge, match.away_team)}
                    <span>${escapeHTML(match.away_team)}</span>
                  </div>

                  <small class="comparison-result ${
                    state === "live" ? "live" : ""
                  }">
                    ${escapeHTML(resultLabel(match))}
                  </small>
                </td>

                ${orderedPlayers.map(player => {
                  const prediction = predictionMap.get(
                    `${match.id}:${player.id}`
                  );

                  const valid = validPrediction(prediction);

                  const exact =
                    valid &&
                    state === "finished" &&
                    hasMatchScore(match) &&
                    Number(prediction.home_prediction) ===
                      Number(match.home_score) &&
                    Number(prediction.away_prediction) ===
                      Number(match.away_score);

                  const classes = [
                    String(player.id) === viewer ? "my-column" : "",
                    exact ? "exact-hit" : "",
                    !valid ? "missing-prediction" : ""
                  ].filter(Boolean).join(" ");

                  return `
                    <td class="${classes}">
                      <div class="cmp-prediction">
                        ${
                          valid
                            ? `${escapeHTML(prediction.home_prediction)}-${
                                escapeHTML(prediction.away_prediction)
                              }${exact ? " 🎯" : ""}`
                            : "—"
                        }
                      </div>

                      ${pointHTML(match, player, prediction)}
                    </td>
                  `;
                }).join("")}
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>

      <div class="cmp-update-note">
        Son veri çekimi:
        ${escapeHTML(new Date().toLocaleTimeString("tr-TR"))}
        <br>
        Canlı puanlar son alınan skora göre hesaplanır.
        Biten maçlarda kayıtlı puanlar gösterilir.
      </div>
    `;

    if (quiet) container.scrollLeft = scrollLeft;
  } catch (error) {
    if (!stillCurrent()) return;

    console.error("Karşılaştırma hatası:", error);

    if (handleSessionError(error)) return;

    container.innerHTML = `
      <div class="feature-message">
        Güncel veri alınamadı.
        <br>${escapeHTML(error.message || "")}
      </div>
    `;
  }
}

/* =========================================
   TAHMİN GİRİŞİ VE HAFTA KİLİDİ
========================================= */

function weekLockTime() {
  return weekOpeningTime(matches);
}

function isWeekLocked() {
  if (!matches.length) return false;

  const opening = weekLockTime();
  return opening === null || Date.now() >= opening;
}

async function loadPredictions() {
  const request = ++predictionRequest;
  const token = sessionToken();
  const viewer = String(currentPlayer);
  const week = Number(activeWeek);

  if (!token || !currentPlayer) {
    handleSessionError({ message: "Oturum gecersiz" });
    return;
  }

  if (!matches.length || activeWeek === null) {
    if ($("matchGrid")) $("matchGrid").innerHTML = "";

    if ($("weekSummary")) {
      $("weekSummary").textContent = "Aktif hafta için maç bulunamadı.";
    }

    return;
  }

  const { data, error } = await supabaseClient.rpc(
    "get_my_week_predictions",
    { p_token: token, p_week: week }
  );

  if (
    request !== predictionRequest ||
    token !== sessionToken() ||
    viewer !== String(currentPlayer) ||
    week !== Number(activeWeek)
  ) return;

  if (error) {
    if (!handleSessionError(error)) {
      toast(error.message || "Tahminler yüklenemedi");
    }
    return;
  }

  const saved = (data || []).filter(
    row => String(row.player_id) === viewer
  );

  const grid = $("matchGrid");
  if (!grid) return;

  grid.innerHTML = "";
  const locked = isWeekLocked();

  for (const match of matches) {
    const prediction = saved.find(
      row => String(row.match_id) === String(match.id)
    );

    const card = document.createElement("div");
    card.className = "match-card";

    card.innerHTML = `
      <div class="match-meta">
        <span>${escapeHTML(match.week)}. Hafta</span>
        <span>
          ${escapeHTML(new Date(match.kickoff_at).toLocaleString("tr-TR"))}
        </span>
      </div>

      <div class="teams">
        <span class="team">
          ${teamBadge(match.home_team_badge, match.home_team)}
          <span>${escapeHTML(match.home_team)}</span>
        </span>

        <span class="versus">VS</span>

        <span class="team">
          ${teamBadge(match.away_team_badge, match.away_team)}
          <span>${escapeHTML(match.away_team)}</span>
        </span>
      </div>

      <div class="score-entry">
        <input
          type="number"
          min="0"
          step="1"
          id="h_${escapeHTML(match.id)}"
          value="${escapeHTML(prediction?.home_prediction ?? "")}"
          aria-label="${escapeHTML(match.home_team)} skor tahmini"
          ${locked ? "disabled" : ""}>

        <span>-</span>

        <input
          type="number"
          min="0"
          step="1"
          id="a_${escapeHTML(match.id)}"
          value="${escapeHTML(prediction?.away_prediction ?? "")}"
          aria-label="${escapeHTML(match.away_team)} skor tahmini"
          ${locked ? "disabled" : ""}>
      </div>

      <div class="match-footer">
        <span class="lock-state ${
          locked ? "locked" : prediction ? "saved" : ""
        }">
          ${
            locked
              ? "🔒 Hafta kapandı"
              : prediction ? "✓ Kaydedildi" : "Tahmin bekleniyor"
          }
        </span>

        <button
          class="btn primary"
          type="button"
          ${locked ? "disabled" : ""}>
          Kaydet
        </button>
      </div>
    `;

    card.querySelector("button").addEventListener("click", () => {
      window.savePrediction(match.id);
    });

    grid.appendChild(card);
  }

  const count = saved.filter(row =>
    matches.some(match => String(match.id) === String(row.match_id))
  ).length;

  if ($("weekSummary")) {
    $("weekSummary").textContent = locked
      ? `${matches.length} maç · ${count} tahmin kayıtlı · 🔒 Hafta kapandı`
      : `${matches.length} maç · ${count} tahmin kayıtlı · Son tahmin: ${
          new Date(weekLockTime()).toLocaleString("tr-TR")
        }`;
  }

  if ($("saveAllBtn")) $("saveAllBtn").disabled = locked;
}

window.savePrediction = async function(matchId, options = {}) {
  const token = sessionToken();

  if (!currentPlayer || !token) {
    handleSessionError({ message: "Oturum gecersiz" });
    return false;
  }

  if (isWeekLocked()) {
    toast("Tahminler kapandı");
    return false;
  }

  const homeInput = $(`h_${matchId}`);
  const awayInput = $(`a_${matchId}`);

  if (
    !homeInput ||
    !awayInput ||
    homeInput.value === "" ||
    awayInput.value === ""
  ) {
    toast("Skor giriniz");
    return false;
  }

  const home = Number(homeInput.value);
  const away = Number(awayInput.value);

  if (
    !Number.isInteger(home) ||
    !Number.isInteger(away) ||
    home < 0 ||
    away < 0
  ) {
    toast("Geçerli bir skor giriniz");
    return false;
  }

  try {
    const { error } = await supabaseClient.rpc(
      "submit_prediction",
      {
        p_token: token,
        p_match_id: Number(matchId),
        p_home: home,
        p_away: away
      }
    );

    if (error) throw error;

    const state = homeInput
      .closest(".match-card")
      ?.querySelector(".lock-state");

    if (state) {
      state.textContent = "✓ Kaydedildi";
      state.className = "lock-state saved";
    }

    if (!options.silent) toast("Tahmin kaydedildi");
    return true;
  } catch (error) {
    if (!handleSessionError(error)) {
      toast(error.message || "Tahmin kaydedilemedi");
    }
    return false;
  }
};

/* =========================================
   GİRİŞ
========================================= */

async function handleLogin() {
  const playerId = $("playerSelect")?.value;
  const pin = ($("pinInput")?.value || "").trim();

  if (!playerId) {
    toast("Oyuncu seçiniz");
    return;
  }

  if (!/^[0-9]{4}$/.test(pin)) {
    toast("4 haneli PIN giriniz");
    return;
  }

  const button = $("loginBtn");
  if (!button || button.disabled) return;

  button.disabled = true;

  try {
    const { data, error } = await supabaseClient.rpc(
      "login_player",
      {
        p_player_id: Number(playerId),
        p_pin: pin
      }
    );

    if (error) throw error;
    if (!data?.length) throw new Error("Giriş yapılamadı");

    const result = data[0];

    saveSession({
      token: result.token,
      expiresAt: result.expires_at,
      playerId: String(playerId),
      playerName: result.player_name
    });

    if ($("pinInput")) $("pinInput").value = "";

    await enterGame(playerId, result.player_name);
  } catch (error) {
    toast(
      String(error.message || "").includes("Hatali PIN")
        ? "PIN hatalı"
        : error.message || "Giriş yapılamadı"
    );

    if ($("pinInput")) {
      $("pinInput").value = "";
      $("pinInput").focus();
    }
  } finally {
    button.disabled = false;
  }
}

/* =========================================
   SEKME VE YENİLEME YARDIMCILARI
========================================= */

function panelVisible(id) {
  const panel = $(id);

  return Boolean(
    currentPlayer &&
    !$("gameArea")?.classList.contains("hidden") &&
    panel &&
    !panel.classList.contains("hidden")
  );
}

async function refreshVisibleDetails(quiet = false) {
  if (panelVisible("comparisonPanel")) {
    await renderComparison(quiet);
  }

  if (panelVisible("matchPointsPanel")) {
    const select = $("completedMatchSelect");

    if (select && !select.value && completedMatches.length) {
      select.value = String(completedMatches[0].id);
    }

    await loadMatchPoints(select?.value || "", quiet);
  }
}

async function switchTab(name, button) {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.remove("active");
  });

  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.classList.add("hidden");
  });

  button.classList.add("active");
  $(`${name}Panel`)?.classList.remove("hidden");

  if (name === "comparison") {
    renderComparisonOptions();
    await renderComparison();
  }

  if (name === "matchPoints") {
    try {
      await loadMatches();

      const select = $("completedMatchSelect");

      if (select && !select.value && completedMatches.length) {
        select.value = String(completedMatches[0].id);
      }

      await loadMatchPoints(select?.value || "");
    } catch (error) {
      clearMatchDetails("Maç listesi yenilenemedi.");
      toast(error.message || "Maç listesi yenilenemedi");
    }
  }

  if (name === "fixture") renderFixtureWeekOptions();
}

async function pollVisibleDetails() {
  if (
    pollingBusy ||
    document.hidden ||
    !currentPlayer ||
    $("refreshBtn")?.disabled ||
    $("refreshMatchPointsBtn")?.disabled ||
    $("comparisonRefreshBtn")?.disabled
  ) return;

  if (
    !panelVisible("comparisonPanel") &&
    !panelVisible("matchPointsPanel")
  ) return;

  if (!sessionToken()) {
    handleSessionError({ message: "Oturum gecersiz" });
    return;
  }

  pollingBusy = true;

  try {
    if (panelVisible("matchPointsPanel")) {
      await loadMatches();
    }

    await refreshVisibleDetails(true);
  } catch (error) {
    if (panelVisible("matchPointsPanel")) {
      clearMatchDetails("Güncel maç verisi alınamadı.");
    }

    toast(error.message || "Otomatik yenileme başarısız");
  } finally {
    pollingBusy = false;
  }
}

/* =========================================
   PANELLERİ HAZIRLA
========================================= */

setupArchive();
setupComparison();

// Mevcut Maç Puanları açıklamasını canlı kullanıma uyarla.
const matchPointsPanel = $("matchPointsPanel");

if (matchPointsPanel) {
  const description = matchPointsPanel.querySelector(".section-head p");

  if (description) {
    description.textContent =
      "Canlı ve biten maçların puan kırılımını görüntüle. " +
      "Canlı puanlar ve MVP maç bitene kadar değişebilir.";
  }

  const label = matchPointsPanel.querySelector(
    'label[for="completedMatchSelect"]'
  );

  if (label) label.textContent = "Canlı / Biten Maç";
}

/* =========================================
   OLAYLAR
========================================= */

document.querySelectorAll(".tab").forEach(button => {
  button.addEventListener("click", () => {
    switchTab(button.dataset.tab, button).catch(error => {
      toast(error.message || "Sekme yüklenemedi");
    });
  });
});

$("fixtureWeekSelect")?.addEventListener("change", event => {
  renderFixtureList(Number(event.target.value));
});

$("completedMatchSelect")?.addEventListener("change", event => {
  loadMatchPoints(event.target.value);
});

$("loginBtn")?.addEventListener("click", handleLogin);

$("pinInput")?.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleLogin();
  }
});

$("logoutBtn")?.addEventListener("click", () => {
  clearSession();
  showLogin();
});

$("themeBtn")?.addEventListener("click", () => {
  const light =
    document.documentElement.getAttribute("data-theme") === "light";

  document.documentElement.setAttribute(
    "data-theme",
    light ? "dark" : "light"
  );

  $("themeBtn").textContent = light ? "☀" : "🌙";
});

$("saveAllBtn")?.addEventListener("click", async () => {
  if (isWeekLocked()) {
    toast("Tahminler kapandı");
    return;
  }

  const button = $("saveAllBtn");
  button.disabled = true;

  let saved = 0;
  let skipped = 0;
  let failed = 0;

  try {
    for (const match of matches) {
      const home = $(`h_${match.id}`);
      const away = $(`a_${match.id}`);

      if (
        !home || !away ||
        home.value === "" || away.value === ""
      ) {
        skipped++;
        continue;
      }

      const success = await window.savePrediction(
        match.id,
        { silent: true }
      );

      if (!getSession()) return;

      if (success) saved++;
      else failed++;
    }

    toast(
      `${saved} tahmin kaydedildi, ${skipped} maç atlandı` +
      (failed ? `, ${failed} kayıt başarısız` : "")
    );

    await loadPredictions();
  } finally {
    button.disabled = isWeekLocked();
  }
});

$("refreshBtn")?.addEventListener("click", async () => {
  const button = $("refreshBtn");
  button.disabled = true;

  try {
    await loadPlayers();
    await loadMatches();
    await loadPeriodLeaderboard();

    if (currentPlayer) {
      await loadPredictions();
      await refreshVisibleDetails();
    }

    toast("Veriler yenilendi");
  } catch (error) {
    toast(error.message || "Veriler yenilenemedi");
  } finally {
    button.disabled = false;
  }
});

$("refreshMatchPointsBtn")?.addEventListener("click", async () => {
  const button = $("refreshMatchPointsBtn");
  button.disabled = true;

  try {
    await loadPlayers();
    await loadMatches();

    const select = $("completedMatchSelect");

    if (select && !select.value && completedMatches.length) {
      select.value = String(completedMatches[0].id);
    }

    await loadMatchPoints(select?.value || "");
    toast("Maç puanları yenilendi");
  } catch (error) {
    clearMatchDetails("Maç verisi yenilenemedi.");
    toast(error.message || "Maç puanları yenilenemedi");
  } finally {
    button.disabled = false;
  }
});

setInterval(pollVisibleDetails, 30000);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) pollVisibleDetails();
});

/* =========================================
   UYGULAMAYI BAŞLAT
========================================= */

(async () => {
  if ($("connectionBadge")) {
    $("connectionBadge").textContent = "Bağlanıyor...";
  }

  try {
    await loadPlayers();
    await loadMatches();
    await loadPeriodLeaderboard();

    if ($("connectionBadge")) {
      $("connectionBadge").className = "status online";
      $("connectionBadge").textContent = "Supabase bağlı";
    }

    const session = getSession();

    if (
      session &&
      players.some(player =>
        String(player.id) === String(session.playerId)
      )
    ) {
      await enterGame(
        session.playerId,
        session.playerName
      );
    }
  } catch (error) {
    console.error("Uygulama başlatılamadı:", error);

    if ($("connectionBadge")) {
      $("connectionBadge").className = "status offline";
      $("connectionBadge").textContent = "Bağlantı hatası";
    }

    toast(error.message || "Uygulama başlatılamadı");
  }
})();
