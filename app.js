const SUPABASE_URL =
  "https://xmdbbvhnzsswqcqibwax.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtZGJidmhuenNzd3FjcWlid2F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NjQ5ODUsImV4cCI6MjEwNTE0MDk4NX0.FkHURLNFSC6GI_tyO54CXOj_XX30kTlLQ9e9YsboAns";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const $ = id => document.getElementById(id);

let players = [];
let matches = [];
let periodRows = [];
let allMatches = [];
let completedMatches = [];
let matchPointRows = [];

let currentPlayer = null;
let activeWeek = null;
let activePeriod = null;

const SESSION_KEY = "slt_session";

/* ---------------------------------
   GENEL YARDIMCILAR
---------------------------------- */

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

  element.textContent = message;
  element.classList.add("show");

  setTimeout(() => {
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

/* ---------------------------------
   TAKIM LOGOLARI
---------------------------------- */

if (!$("teamBadgeStyles")) {
  const style = document.createElement("style");
  style.id = "teamBadgeStyles";

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

    .fixture-team.home {
      justify-content: flex-end;
    }

    .fixture-team.away {
      justify-content: flex-start;
    }

    .fixture-team .team-name {
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

    .result-team .team-name {
      overflow-wrap: anywhere;
    }

    @media (max-width: 760px) {
      .fixture-team.home,
      .fixture-team.away {
        justify-content: center;
      }
    }
  `;

  document.head.appendChild(style);
}

/*
  Logo HTML'i DOM üzerinden oluşturulur.
  Böylece img etiketi ve tırnaklar doğru üretilir.
*/
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

/* Yüklenemeyen logoların yerine futbol topu göster. */
document.addEventListener("error", event => {
  const image = event.target;

  if (
    !(image instanceof HTMLImageElement) ||
    !image.classList.contains("team-badge")
  ) {
    return;
  }

  const fallback = document.createElement("span");
  fallback.className = "team-badge fallback";
  fallback.textContent = "⚽";
  fallback.setAttribute("aria-hidden", "true");

  image.replaceWith(fallback);
}, true);

/* ---------------------------------
   OTURUM: PIN + TOKEN
---------------------------------- */

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
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify(session)
  );
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function sessionToken() {
  return getSession()?.token || null;
}

function showLogin() {
  currentPlayer = null;

  $("gameArea")?.classList.add("hidden");
  $("loginCard")?.classList.remove("hidden");

  if ($("pinInput")) {
    $("pinInput").value = "";
  }
}

function handleSessionError(error) {
  const message = String(error?.message || "");

  if (
    message.includes("Oturum gecersiz") ||
    message.includes("Oturum geçersiz")
  ) {
    clearSession();
    showLogin();

    toast(
      "Oturum geçersiz veya süresi doldu. PIN ile tekrar giriş yap."
    );

    return true;
  }

  return false;
}

async function enterGame(playerId, playerName) {
  currentPlayer = String(playerId);

  $("loginCard").classList.add("hidden");
  $("gameArea").classList.remove("hidden");
  $("activePlayerName").textContent = playerName || "";

  await loadPredictions();
}

/* ---------------------------------
   OYUNCULAR
---------------------------------- */

async function loadPlayers() {
  const { data, error } = await supabaseClient
    .from("players")
    .select("id,name,total_points")
    .order("total_points", { ascending: false });

  if (error) throw error;

  players = data || [];

  const select = $("playerSelect");
  const selectedValue = select.value;

  select.innerHTML =
    '<option value="">Oyuncu seç...</option>' +
    players.map(player => `
      <option value="${escapeHTML(player.id)}">
        ${escapeHTML(player.name)}
      </option>
    `).join("");

  if (selectedValue) {
    select.value = selectedValue;
  }

  renderLeaderboard();
}

/* ---------------------------------
   MAÇLAR VE AKTİF HAFTA
---------------------------------- */

async function loadMatches() {
  const { data, error } = await supabaseClient
    .from("matches")
    .select("*")
    .neq("home_team", "HISTORICAL")
    .order("week", { ascending: true })
    .order("kickoff_at", { ascending: true });

  if (error) throw error;

  allMatches = data || [];

  if (!allMatches.length) {
    matches = [];
    completedMatches = [];
    activeWeek = null;
    activePeriod = null;

    if ($("weekSummary")) {
      $("weekSummary").textContent =
        "Aktif hafta için maç bulunamadı.";
    }

    renderCompletedMatchSelect();
    renderFixtureWeekOptions();
    return;
  }

  /* Haftanın tüm maçları FT olmadan sonraki haftaya geçilmez. */
  const weekNumbers = [...new Set(
    allMatches.map(match => Number(match.week))
  )].sort((a, b) => a - b);

  const incompleteWeeks = weekNumbers.filter(week =>
    allMatches
      .filter(match => Number(match.week) === week)
      .some(match => match.status !== "FT")
  );

  activeWeek = incompleteWeeks.length
    ? incompleteWeeks[0]
    : Math.max(...weekNumbers);

  activePeriod = Math.floor((activeWeek - 1) / 4) + 1;

  matches = allMatches.filter(
    match => Number(match.week) === activeWeek
  );

  /* Mevcut tamamlanan maç seçimi mantığı korunmuştur. */
  completedMatches = allMatches
    .filter(match =>
      match.home_score !== null &&
      match.home_score !== undefined &&
      match.away_score !== null &&
      match.away_score !== undefined
    )
    .sort((a, b) =>
      Number(b.week) - Number(a.week) ||
      new Date(b.kickoff_at) - new Date(a.kickoff_at)
    );

  renderCompletedMatchSelect();

  if ($("activeWeekEyebrow")) {
    $("activeWeekEyebrow").textContent =
      `${activeWeek}. HAFTA`;
  }

  if ($("matchesTitle")) {
    $("matchesTitle").textContent =
      `${activeWeek}. Hafta Maçları`;
  }

  renderFixtureWeekOptions();
}

/* ---------------------------------
   FİKSTÜR
---------------------------------- */

function renderFixtureWeekOptions() {
  const select = $("fixtureWeekSelect");
  if (!select) return;

  const weekNumbers = [...new Set(
    allMatches.map(match => Number(match.week))
  )].sort((a, b) => a - b);

  const currentValue = select.value;

  select.innerHTML = weekNumbers.map(week => `
    <option value="${week}">${week}. Hafta</option>
  `).join("");

  if (!weekNumbers.length) {
    renderFixtureList(null);
    return;
  }

  const valueToUse =
    currentValue && weekNumbers.includes(Number(currentValue))
      ? currentValue
      : String(activeWeek);

  select.value = valueToUse;
  renderFixtureList(Number(valueToUse));
}

function renderFixtureList(weekNumber) {
  const container = $("fixtureList");
  if (!container) return;

  const weekMatches = allMatches
    .filter(match => Number(match.week) === Number(weekNumber))
    .sort((a, b) =>
      new Date(a.kickoff_at) - new Date(b.kickoff_at)
    );

  if (!weekMatches.length) {
    container.innerHTML =
      '<p class="empty-state">Bu hafta için maç bulunamadı.</p>';
    return;
  }

  container.innerHTML = weekMatches.map(match => {
    const isFinished = match.status === "FT";
    const isUpcoming = match.status === "NS";

    const hasScore =
      match.home_score !== null &&
      match.home_score !== undefined &&
      match.away_score !== null &&
      match.away_score !== undefined;

    const scoreDisplay = isFinished
      ? hasScore
        ? `${match.home_score} - ${match.away_score}`
        : "Skor bekleniyor"
      : new Date(match.kickoff_at).toLocaleString("tr-TR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        });

    const statusClass = isFinished
      ? "finished"
      : isUpcoming ? "upcoming" : "live";

    const statusLabel = isFinished
      ? "✓ Tamamlandı"
      : isUpcoming ? "Henüz oynanmadı" : "🔴 Canlı";

    return `
      <div class="fixture-row ${statusClass}">
        <span class="fixture-team home">
          <span class="team-name">
            ${escapeHTML(match.home_team)}
          </span>
          ${teamBadge(match.home_team_badge, match.home_team)}
        </span>

        <span class="fixture-score">
          ${escapeHTML(scoreDisplay)}
        </span>

        <span class="fixture-team away">
          ${teamBadge(match.away_team_badge, match.away_team)}
          <span class="team-name">
            ${escapeHTML(match.away_team)}
          </span>
        </span>

        <span class="fixture-status ${statusClass}">
          ${statusLabel}
        </span>
      </div>
    `;
  }).join("");
}

$("fixtureWeekSelect")?.addEventListener("change", event => {
  renderFixtureList(Number(event.target.value));
});

/* ---------------------------------
   GENEL KLASMAN
---------------------------------- */

function renderLeaderboard() {
  const sortedPlayers = [...players].sort(
    (a, b) =>
      Number(b.total_points || 0) -
      Number(a.total_points || 0)
  );

  const topScore =
    Number(sortedPlayers[0]?.total_points || 0);

  $("leaderBody").innerHTML = sortedPlayers.map((player, index) => {
    const points = Number(player.total_points || 0);

    return `
      <tr>
        <td>${rankLabel(index)}</td>
        <td>${escapeHTML(player.name)}</td>
        <td class="points">${numberTR(points)}</td>
        <td>
          ${index === 0 ? "-" : numberTR(topScore - points)}
        </td>
      </tr>
    `;
  }).join("");

  const topPlayers = sortedPlayers
    .filter(player => Number(player.total_points || 0) > 0)
    .slice(0, 3);

  $("podium").innerHTML = topPlayers.length
    ? podiumHTML(topPlayers)
    : `
      <div class="card empty-state">
        Genel klasman için henüz puan bulunmuyor.
      </div>
    `;
}

function podiumHTML(rows) {
  return rows.map((player, index) => `
    <div class="pod">
      <div class="medal">${rankLabel(index)}</div>
      <div class="name">${escapeHTML(player.name)}</div>
      <div class="points">
        ${numberTR(player.total_points)}
      </div>
    </div>
  `).join("");
}

/* ---------------------------------
   DÖNEM PUANLARI
---------------------------------- */

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

function rowsForPeriod(periodNumber) {
  const pointsByPlayerId = new Map();

  periodRows
    .filter(row =>
      Number(row.period_no) === Number(periodNumber)
    )
    .forEach(row => {
      const playerId = row.player_id ?? row.id;

      if (playerId === null || playerId === undefined) {
        return;
      }

      pointsByPlayerId.set(
        String(playerId),
        Number(row.total_points || 0)
      );
    });

  return players.map(player => ({
    id: player.id,
    name: player.name,
    total_points:
      pointsByPlayerId.get(String(player.id)) || 0
  })).sort((a, b) =>
    b.total_points - a.total_points ||
    a.name.localeCompare(b.name, "tr")
  );
}

function renderPeriodViews() {
  if (!activePeriod) return;

  const start = periodStart(activePeriod);
  const end = periodEnd(activePeriod);
  const rows = rowsForPeriod(activePeriod);
  const topScore = rows[0]?.total_points || 0;

  $("activePeriodTitle").textContent =
    `⚡ Aktif Dönem: Hafta ${start}-${end}`;

  $("activePeriodDescription").textContent =
    `Dönem ${activePeriod} canlı sıralaması. İlk üç oyuncu kürsüde gösterilir.`;

  $("periodBody").innerHTML = rows.map((player, index) => `
    <tr>
      <td>${rankLabel(index)}</td>
      <td>${escapeHTML(player.name)}</td>
      <td class="points">${numberTR(player.total_points)}</td>
      <td>
        ${
          index === 0
            ? "-"
            : numberTR(topScore - player.total_points)
        }
      </td>
    </tr>
  `).join("");

  $("periodPodium").innerHTML =
    rows.some(player => player.total_points > 0)
      ? podiumHTML(rows.slice(0, 3))
      : `
        <div class="card empty-state">
          Aktif dönem için henüz puan bulunmuyor.
        </div>
      `;

  const highestPeriod = Math.max(
    Number(activePeriod || 1),
    ...periodRows.map(row => Number(row.period_no || 0))
  );

  const periodNumbers = Array.from(
    { length: highestPeriod },
    (_, index) => index + 1
  );

  renderPeriodPodiums(periodNumbers);
  renderMedals(periodNumbers);
}

/* ---------------------------------
   DÖNEM KÜRSÜLERİ
---------------------------------- */

function renderPeriodPodiums(periodNumbers) {
  $("periodPodiums").innerHTML = periodNumbers.map(number => {
    const rows = rowsForPeriod(number);
    const hasPoints =
      rows.some(player => player.total_points > 0);

    const topThree = hasPoints ? rows.slice(0, 3) : [];

    const completed = periodEnd(number) < activeWeek;
    const current = Number(number) === Number(activePeriod);

    const status = completed
      ? "TAMAMLANDI"
      : current ? "DEVAM EDİYOR" : "YAKINDA";

    const cardClass = completed
      ? "score"
      : current ? "side" : "ou";

    return `
      <article class="card rule ${cardClass}">
        <span class="eyebrow">${status}</span>
        <h3>Dönem ${number}</h3>
        <p>
          Hafta ${periodStart(number)} - ${periodEnd(number)}
        </p>

        <div class="period-ranking">
          ${
            topThree.length
              ? topThree.map((player, index) => `
                  <p>
                    <span>${rankLabel(index)}</span>
                    <strong>${escapeHTML(player.name)}</strong>
                    <span>
                      ${numberTR(player.total_points)} puan
                    </span>
                  </p>
                `).join("")
              : `
                <p class="empty-period">
                  Bu dönem için henüz puan bulunmuyor.
                </p>
              `
          }
        </div>
      </article>
    `;
  }).join("");
}

/* ---------------------------------
   MADALYALAR
---------------------------------- */

function renderMedals(periodNumbers) {
  const medals = new Map(players.map(player => [
    String(player.id),
    {
      name: player.name,
      gold: 0,
      silver: 0,
      bronze: 0
    }
  ]));

  periodNumbers
    .filter(number => periodEnd(number) < activeWeek)
    .forEach(number => {
      const rows = rowsForPeriod(number);

      if (!rows.some(player => player.total_points > 0)) {
        return;
      }

      rows.slice(0, 3).forEach((player, index) => {
        const record = medals.get(String(player.id));
        if (!record) return;

        if (index === 0) record.gold++;
        if (index === 1) record.silver++;
        if (index === 2) record.bronze++;
      });
    });

  const rows = [...medals.values()].sort((a, b) =>
    b.gold - a.gold ||
    b.silver - a.silver ||
    b.bronze - a.bronze ||
    a.name.localeCompare(b.name, "tr")
  );

  $("medalBody").innerHTML = rows.map((player, index) => `
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

/* ---------------------------------
   MAÇ PUANLARI
---------------------------------- */

function renderCompletedMatchSelect() {
  const select = $("completedMatchSelect");
  if (!select) return;

  if (!completedMatches.length) {
    select.innerHTML = `
      <option value="">
        Henüz skoru işlenmiş maç bulunmuyor
      </option>
    `;
    return;
  }

  const currentValue = select.value;

  select.innerHTML =
    '<option value="">Maç seç...</option>' +
    completedMatches.map(match => `
      <option value="${escapeHTML(match.id)}">
        ${escapeHTML(match.week)}. Hafta ·
        ${escapeHTML(match.home_team)}
        ${escapeHTML(match.home_score)}-${escapeHTML(match.away_score)}
        ${escapeHTML(match.away_team)}
      </option>
    `).join("");

  if (
    currentValue &&
    completedMatches.some(match =>
      String(match.id) === currentValue
    )
  ) {
    select.value = currentValue;
  }
}

function normalizePointType(rawType) {
  const value = String(rawType || "").toLowerCase();

  if (value === "exact_score") return "scorePoints";
  if (value === "side") return "sidePoints";
  if (value === "over_under") return "overUnderPoints";

  return null;
}

async function loadMatchPoints(matchId) {
  const resultCard = $("selectedMatchResult");
  const mvpCards = $("matchMvpCards");
  const body = $("matchPointsBody");

  if (!body) return;

  if (!matchId) {
    resultCard?.classList.add("hidden");
    if (mvpCards) mvpCards.innerHTML = "";

    body.innerHTML = `
      <tr>
        <td colspan="7">
          Puan detaylarını görmek için tamamlanan bir maç seçiniz.
        </td>
      </tr>
    `;
    return;
  }

  const match = completedMatches.find(
    item => String(item.id) === String(matchId)
  );

  if (!match) {
    toast("Maç bulunamadı");
    return;
  }

  const token = sessionToken();

  if (!token) {
    handleSessionError({ message: "Oturum gecersiz" });
    return;
  }

  body.innerHTML =
    '<tr><td colspan="7">Maç puanları yükleniyor...</td></tr>';

  try {
    const [predictionResponse, pointResponse] =
      await Promise.all([
        supabaseClient.rpc("get_my_week_predictions", {
          p_token: token,
          p_week: Number(match.week)
        }),

        supabaseClient
          .from("match_points")
          .select("player_id,match_id,point_type,points")
          .eq("match_id", Number(matchId))
      ]);

    if (predictionResponse.error) {
      throw predictionResponse.error;
    }

    if (pointResponse.error) {
      throw pointResponse.error;
    }

    const predictions =
      (predictionResponse.data || []).filter(
        row => String(row.match_id) === String(matchId)
      );

    const pointsByPlayer = new Map();

    (pointResponse.data || []).forEach(entry => {
      const key = String(entry.player_id);

      if (!pointsByPlayer.has(key)) {
        pointsByPlayer.set(key, {
          scorePoints: 0,
          sidePoints: 0,
          overUnderPoints: 0,
          totalPoints: 0
        });
      }

      const record = pointsByPlayer.get(key);
      const amount = Number(entry.points || 0);
      const component = normalizePointType(entry.point_type);

      if (component) record[component] += amount;

      record.totalPoints += amount;
    });

    matchPointRows = players.map(player => {
      const prediction = predictions.find(
        row => String(row.player_id) === String(player.id)
      );

      const record = pointsByPlayer.get(String(player.id)) || {
        scorePoints: 0,
        sidePoints: 0,
        overUnderPoints: 0,
        totalPoints: 0
      };

      return {
        id: player.id,
        name: player.name,
        hasPrediction: Boolean(prediction),
        prediction: prediction
          ? `${prediction.home_prediction}-${prediction.away_prediction}`
          : "Tahmin yok",
        ...record
      };
    }).sort((a, b) =>
      b.totalPoints - a.totalPoints ||
      b.scorePoints - a.scorePoints ||
      a.name.localeCompare(b.name, "tr")
    );

    renderSelectedMatchResult(match);
    renderMatchMvpCards();
    renderMatchPointsTable();
  } catch (error) {
    console.error("Maç puanları yüklenemedi:", error);

    if (handleSessionError(error)) return;

    body.innerHTML = `
      <tr>
        <td colspan="7">Maç puanları yüklenemedi.</td>
      </tr>
    `;

    toast(error.message || "Maç puanları yüklenemedi");
  }
}

function renderSelectedMatchResult(match) {
  const card = $("selectedMatchResult");
  if (!card) return;

  const sum = key =>
    matchPointRows.reduce(
      (total, player) => total + player[key],
      0
    );

  card.classList.remove("hidden");

  card.innerHTML = `
    <div class="result-week">
      ${escapeHTML(match.week)}. HAFTA
    </div>

    <div class="result-teams">
      <span class="result-team">
        <span class="team-name">
          ${escapeHTML(match.home_team)}
        </span>
        ${teamBadge(match.home_team_badge, match.home_team)}
      </span>

      <strong>
        ${escapeHTML(match.home_score)} -
        ${escapeHTML(match.away_score)}
      </strong>

      <span class="result-team">
        ${teamBadge(match.away_team_badge, match.away_team)}
        <span class="team-name">
          ${escapeHTML(match.away_team)}
        </span>
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
        <small>Dağıtılan Toplam</small>
        <b>${numberTR(sum("totalPoints"))}</b>
      </div>
    </div>
  `;
}

function bestInComponent(key) {
  const candidates = matchPointRows.filter(
    player => Number(player[key]) > 0
  );

  if (!candidates.length) return null;

  const bestScore = Math.max(
    ...candidates.map(player => Number(player[key]))
  );

  return {
    names: candidates
      .filter(player => Number(player[key]) === bestScore)
      .map(player => player.name)
      .join(", "),
    points: bestScore
  };
}

function mvpCard(icon, title, winner, extraClass = "") {
  return `
    <article class="card mvp-card ${extraClass}">
      <div class="mvp-icon">${icon}</div>
      <div class="mvp-title">${title}</div>
      <div class="mvp-player">
        ${winner ? escapeHTML(winner.names) : "Kimse bilemedi"}
      </div>
      <div class="mvp-points">
        ${winner ? `${numberTR(winner.points)} puan` : "-"}
      </div>
    </article>
  `;
}

function renderMatchMvpCards() {
  const container = $("matchMvpCards");
  if (!container) return;

  container.innerHTML = [
    mvpCard(
      "🎯",
      "Tam Skor Kralı",
      bestInComponent("scorePoints")
    ),
    mvpCard(
      "✅",
      "Taraf Uzmanı",
      bestInComponent("sidePoints")
    ),
    mvpCard(
      "⚽",
      "Alt / Üst Avcısı",
      bestInComponent("overUnderPoints")
    ),
    mvpCard(
      "🏆",
      "Maç MVP",
      bestInComponent("totalPoints"),
      "winner"
    )
  ].join("");
}

function renderPointComponent(points, component) {
  const value = Number(points || 0);

  return value <= 0
    ? '<span class="point-chip zero">0</span>'
    : `
      <span class="point-chip ${component}">
        +${numberTR(value)}
      </span>
    `;
}

function renderMatchPointsTable() {
  const body = $("matchPointsBody");
  if (!body) return;

  if (!matchPointRows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="7">
          Bu maç için puan kaydı bulunamadı.
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = matchPointRows.map((player, index) => {
    const hasPoints = player.totalPoints > 0;

    return `
      <tr class="${
        index < 3 && hasPoints
          ? `match-rank-${index + 1}`
          : ""
      }">
        <td>${hasPoints ? rankLabel(index) : index + 1}</td>
        <td><strong>${escapeHTML(player.name)}</strong></td>
        <td>
          <span class="${
            player.hasPrediction
              ? "prediction-score"
              : "no-prediction"
          }">
            ${escapeHTML(player.prediction)}
          </span>
        </td>
        <td>
          ${renderPointComponent(player.scorePoints, "exact")}
        </td>
        <td>
          ${renderPointComponent(player.sidePoints, "side")}
        </td>
        <td>
          ${renderPointComponent(player.overUnderPoints, "ou")}
        </td>
        <td>
          <span class="match-total-points">
            ${numberTR(player.totalPoints)}
          </span>
        </td>
      </tr>
    `;
  }).join("");
}

/* ---------------------------------
   HAFTA KİLİDİ
---------------------------------- */

function weekLockTime() {
  if (!matches.length) return null;

  return Math.min(
    ...matches.map(match =>
      new Date(match.kickoff_at).getTime()
    )
  );
}

function isWeekLocked() {
  const lockTime = weekLockTime();
  if (lockTime === null) return false;

  return Date.now() >= lockTime;
}

/* ---------------------------------
   TAHMİNLERİ YÜKLEME
---------------------------------- */

async function loadPredictions() {
  const token = sessionToken();

  if (!token) {
    handleSessionError({ message: "Oturum gecersiz" });
    return;
  }

  if (!matches.length || activeWeek === null) {
    $("matchGrid").innerHTML = "";
    $("weekSummary").textContent =
      "Aktif hafta için maç bulunamadı.";
    return;
  }

  const { data, error } = await supabaseClient.rpc(
    "get_my_week_predictions",
    {
      p_token: token,
      p_week: Number(activeWeek)
    }
  );

  if (error) {
    console.error("Tahminler yüklenemedi:", error);

    if (handleSessionError(error)) return;

    toast(error.message || "Tahminler yüklenemedi");
    return;
  }

  const saved = (data || []).filter(
    row => String(row.player_id) === String(currentPlayer)
  );

  const grid = $("matchGrid");
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
          ${
            escapeHTML(
              new Date(match.kickoff_at).toLocaleString("tr-TR")
            )
          }
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
          value="${
            escapeHTML(prediction?.home_prediction ?? "")
          }"
          aria-label="${
            escapeHTML(match.home_team)
          } skor tahmini"
          ${locked ? "disabled" : ""}
        >

        <span>-</span>

        <input
          type="number"
          min="0"
          step="1"
          id="a_${escapeHTML(match.id)}"
          value="${
            escapeHTML(prediction?.away_prediction ?? "")
          }"
          aria-label="${
            escapeHTML(match.away_team)
          } skor tahmini"
          ${locked ? "disabled" : ""}
        >
      </div>

      <div class="match-footer">
        <span class="lock-state ${
          locked ? "locked" : prediction ? "saved" : ""
        }">
          ${
            locked
              ? "🔒 Hafta kapandı"
              : prediction
                ? "✓ Kaydedildi"
                : "Tahmin bekleniyor"
          }
        </span>

        <button
          class="btn primary"
          type="button"
          ${locked ? "disabled" : ""}
        >
          Kaydet
        </button>
      </div>
    `;

    card.querySelector("button").addEventListener("click", () => {
      window.savePrediction(match.id);
    });

    grid.appendChild(card);
  }

  const savedCount = saved.filter(row =>
    matches.some(match =>
      String(match.id) === String(row.match_id)
    )
  ).length;

  $("weekSummary").textContent = locked
    ? `${matches.length} maç · ${savedCount} tahmin kayıtlı · 🔒 Hafta kapandı`
    : `${matches.length} maç · ${savedCount} tahmin kayıtlı · Son tahmin: ${
        new Date(weekLockTime()).toLocaleString("tr-TR")
      }`;

  if ($("saveAllBtn")) {
    $("saveAllBtn").disabled = locked;
  }
}

/* ---------------------------------
   TAHMİN KAYDETME
---------------------------------- */

window.savePrediction = async function(matchId, options = {}) {
  const token = sessionToken();

  if (!currentPlayer || !token) {
    handleSessionError({ message: "Oturum gecersiz" });
    return false;
  }

  if (isWeekLocked()) {
    toast("Hafta başladı, tahminler kapandı");
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

    if (!options.silent) {
      toast("Tahmin kaydedildi");
    }

    return true;
  } catch (error) {
    console.error("Tahmin kaydedilemedi:", error);

    if (handleSessionError(error)) return false;

    toast(error.message || "Tahmin kaydedilemedi");
    return false;
  }
};

/* ---------------------------------
   TÜMÜNÜ KAYDET
---------------------------------- */

$("saveAllBtn")?.addEventListener("click", async () => {
  if (isWeekLocked()) {
    toast("Hafta başladı, tahminler kapandı");
    return;
  }

  const button = $("saveAllBtn");
  button.disabled = true;

  let savedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    for (const match of matches) {
      const home = $(`h_${match.id}`);
      const away = $(`a_${match.id}`);

      if (
        !home ||
        !away ||
        home.value === "" ||
        away.value === ""
      ) {
        skippedCount++;
        continue;
      }

      const saved = await window.savePrediction(
        match.id,
        { silent: true }
      );

      if (!getSession()) return;

      if (saved) savedCount++;
      else failedCount++;
    }

    toast(
      `${savedCount} tahmin kaydedildi, ${skippedCount} maç atlandı` +
      (
        failedCount
          ? `, ${failedCount} kayıt başarısız`
          : ""
      )
    );

    await loadPredictions();
  } finally {
    button.disabled = isWeekLocked();
  }
});

/* ---------------------------------
   YENİLEME
---------------------------------- */

$("refreshBtn")?.addEventListener("click", async () => {
  try {
    await loadPlayers();
    await loadMatches();
    await loadPeriodLeaderboard();

    if (currentPlayer) {
      await loadPredictions();
    }

    toast("Veriler yenilendi");
  } catch (error) {
    console.error("Yenileme hatası:", error);
    toast(error.message || "Veriler yenilenemedi");
  }
});

$("refreshMatchPointsBtn")?.addEventListener(
  "click",
  async () => {
    try {
      await loadPlayers();
      await loadMatches();

      const matchId = $("completedMatchSelect")?.value;

      if (matchId) {
        await loadMatchPoints(matchId);
      }

      toast("Maç puanları yenilendi");
    } catch (error) {
      console.error("Yenileme hatası:", error);
      toast(error.message || "Maç puanları yenilenemedi");
    }
  }
);

$("completedMatchSelect")?.addEventListener("change", event => {
  loadMatchPoints(event.target.value);
});

/* ---------------------------------
   PIN İLE GİRİŞ
---------------------------------- */

async function handleLogin() {
  const playerId = $("playerSelect").value;
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
  if (button.disabled) return;

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

    if (!data?.length) {
      throw new Error("Giriş yapılamadı");
    }

    const result = data[0];

    saveSession({
      token: result.token,
      expiresAt: result.expires_at,
      playerId: String(playerId),
      playerName: result.player_name
    });

    $("pinInput").value = "";

    await enterGame(playerId, result.player_name);
  } catch (error) {
    console.error("Giriş başarısız:", error);

    toast(
      String(error.message || "").includes("Hatali PIN")
        ? "PIN hatalı"
        : error.message || "Giriş yapılamadı"
    );

    $("pinInput").value = "";
    $("pinInput").focus();
  } finally {
    button.disabled = false;
  }
}

$("loginBtn")?.addEventListener("click", handleLogin);

$("pinInput")?.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleLogin();
  }
});

/* ---------------------------------
   OYUNCU DEĞİŞTİRME
---------------------------------- */

$("logoutBtn")?.addEventListener("click", () => {
  clearSession();
  showLogin();
});

/* ---------------------------------
   TEMA
---------------------------------- */

$("themeBtn")?.addEventListener("click", () => {
  const isLight =
    document.documentElement.getAttribute("data-theme") === "light";

  document.documentElement.setAttribute(
    "data-theme",
    isLight ? "dark" : "light"
  );

  $("themeBtn").textContent = isLight ? "☀" : "🌙";
});

/* ---------------------------------
   SEKME GEÇİŞLERİ
---------------------------------- */

document.querySelectorAll(".tab").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(tab => {
      tab.classList.remove("active");
    });

    button.classList.add("active");

    document.querySelectorAll(".tab-panel").forEach(panel => {
      panel.classList.add("hidden");
    });

    $(`${button.dataset.tab}Panel`)
      ?.classList.remove("hidden");

    if (button.dataset.tab === "matchPoints") {
      const select = $("completedMatchSelect");

      if (
        select &&
        !select.value &&
        completedMatches.length
      ) {
        select.value = String(completedMatches[0].id);
        loadMatchPoints(completedMatches[0].id);
      }
    }

    if (button.dataset.tab === "fixture") {
      renderFixtureWeekOptions();
    }
  });
});

/* ---------------------------------
   UYGULAMAYI BAŞLAT
---------------------------------- */

(async () => {
  $("connectionBadge").textContent = "Bağlanıyor...";

  try {
    await loadPlayers();
    await loadMatches();
    await loadPeriodLeaderboard();

    $("connectionBadge").className = "status online";
    $("connectionBadge").textContent = "Supabase bağlı";

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

    $("connectionBadge").className = "status offline";
    $("connectionBadge").textContent = "Bağlantı hatası";

    toast(error.message || "Uygulama başlatılamadı");
  }
})();
