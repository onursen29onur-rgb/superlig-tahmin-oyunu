const SUPABASE_URL =
  "https://xmdbbvhnzsswqcqibwax.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtZGJidmhuenNzd3FjcWlid2F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NjQ5ODUsImV4cCI6MjEwNTE0MDk4NX0.FkHURLNFSC6GI_tyO54CXOj_XX30kTlLQ9e9YsboAns";

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

const $ = (id) =>
  document.getElementById(id);

let players = [];
let matches = [];
let periodRows = [];

let allMatches = [];
let completedMatches = [];
let matchPointRows = [];

let currentPlayer = null;
let activeWeek = null;
let activePeriod = null;

/* ---------------------------------
   GENEL YARDIMCI FONKSİYONLAR
---------------------------------- */

function toast(message) {

  const toastElement = $("toast");

  if (!toastElement) {
    return;
  }

  toastElement.textContent = message;
  toastElement.classList.add("show");

  setTimeout(() => {
    toastElement.classList.remove("show");
  }, 2500);
}

function numberTR(value) {

  return Number(value || 0)
    .toLocaleString(
      "tr-TR",
      {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2
      }
    );
}

function rankLabel(index) {

  if (index === 0) {
    return "🥇";
  }

  if (index === 1) {
    return "🥈";
  }

  if (index === 2) {
    return "🥉";
  }

  return index + 1;
}

function periodStart(periodNumber) {

  return (
    (periodNumber - 1) * 4
  ) + 1;
}

function periodEnd(periodNumber) {

  return Math.min(
    periodNumber * 4,
    38
  );
}

/* ---------------------------------
   OYUNCULAR
---------------------------------- */

async function loadPlayers() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("players")
      .select("*")
      .order(
        "total_points",
        {
          ascending: false
        }
      );

  if (error) {

    console.error(
      "Oyuncular yüklenemedi:",
      error
    );

    toast(
      "Oyuncular yüklenemedi"
    );

    return;
  }

  players = data || [];

  $("playerSelect").innerHTML =
    '<option value="">Oyuncu seç...</option>' +
    players
      .map(player => `
        <option value="${player.id}">
          ${player.name}
        </option>
      `)
      .join("");

  renderLeaderboard();
}

/* ---------------------------------
   MAÇLAR VE AKTİF HAFTA
---------------------------------- */

async function loadMatches() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from("matches")
      .select("*")
      .neq(
        "home_team",
        "HISTORICAL"
      )
      .order(
        "week",
        {
          ascending: true
        }
      )
      .order(
        "kickoff_at",
        {
          ascending: true
        }
      );

  if (error) {

    console.error(
      "Maçlar yüklenemedi:",
      error
    );

    toast(
      "Maçlar yüklenemedi"
    );

    return;
  }

  allMatches =
    data || [];

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

    return;
  }

  /*
    Artık "gelecekte maçı olan hafta" değil,
    "TÜM maçları henüz FT (tamamlanmış) olmayan
    en küçük hafta numarası" aranıyor. Bu sayede
    bir haftanın bazı maçları bitse bile, o
    haftanın SON maçı da bitmeden bir sonraki
    haftaya geçilmez.
  */

  const weekNumbers =
    [...new Set(
      allMatches.map(
        match => Number(match.week)
      )
    )].sort((a, b) => a - b);

  const incompleteWeeks =
    weekNumbers.filter(weekNumber => {

      const weekMatches =
        allMatches.filter(
          match =>
            Number(match.week) === weekNumber
        );

      return weekMatches.some(
        match => match.status !== "FT"
      );
    });

  if (incompleteWeeks.length) {

    activeWeek = incompleteWeeks[0];

  } else {

    activeWeek =
      Math.max(...weekNumbers);
  }

  activePeriod =
    Math.floor(
      (activeWeek - 1) / 4
    ) + 1;

  matches =
    allMatches.filter(
      match =>
        Number(match.week) ===
        Number(activeWeek)
    );

  completedMatches =
    allMatches
      .filter(match => {

        const hasHomeScore =
          match.home_score !== null &&
          match.home_score !== undefined;

        const hasAwayScore =
          match.away_score !== null &&
          match.away_score !== undefined;

        return (
          hasHomeScore &&
          hasAwayScore
        );
      })
      .sort(
        (firstMatch, secondMatch) => {

          const weekDifference =
            Number(secondMatch.week) -
            Number(firstMatch.week);

          if (weekDifference !== 0) {
            return weekDifference;
          }

          return (
            new Date(secondMatch.kickoff_at) -
            new Date(firstMatch.kickoff_at)
          );
        }
      );

  renderCompletedMatchSelect();

  if ($("activeWeekEyebrow")) {

    $("activeWeekEyebrow")
      .textContent =
      `${activeWeek}. HAFTA`;
  }

  if ($("matchesTitle")) {

    $("matchesTitle")
      .textContent =
      `${activeWeek}. Hafta Maçları`;
  }

  console.log(
    "Aktif hafta:",
    activeWeek
  );

  console.log(
    "Aktif dönem:",
    activePeriod
  );

  console.log(
    "Tamamlanan maç sayısı:",
    completedMatches.length
  );

  renderFixtureWeekOptions();
}

/* ---------------------------------
   FİKSTÜR GÖRÜNTÜLEME (Tahminden Bağımsız)
---------------------------------- */

function renderFixtureWeekOptions() {

  const select = $("fixtureWeekSelect");

  if (!select) return;

  const weekNumbers =
    [...new Set(
      allMatches.map(
        match => Number(match.week)
      )
    )].sort((a, b) => a - b);

  const currentValue = select.value;

  select.innerHTML =
    weekNumbers
      .map(weekNumber => `
        <option value="${weekNumber}">
          ${weekNumber}. Hafta
        </option>
      `)
      .join("");

  const valueToUse =
    currentValue &&
    weekNumbers.includes(Number(currentValue))
      ? currentValue
      : String(activeWeek);

  select.value = valueToUse;

  renderFixtureList(Number(valueToUse));
}

function renderFixtureList(weekNumber) {

  const container = $("fixtureList");

  if (!container) return;

  const weekMatches =
    allMatches
      .filter(
        match =>
          Number(match.week) === Number(weekNumber)
      )
      .sort(
        (a, b) =>
          new Date(a.kickoff_at) - new Date(b.kickoff_at)
      );

  if (!weekMatches.length) {

    container.innerHTML =
      `<p class="empty-state">Bu hafta için maç bulunamadı.</p>`;

    return;
  }

  container.innerHTML =
    weekMatches
      .map(match => {

        const isFinished =
          match.status === "FT";

        const scoreDisplay =
          isFinished
            ? `${match.home_score} - ${match.away_score}`
            : new Date(match.kickoff_at)
                .toLocaleString("tr-TR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit"
                });

        const statusClass =
          isFinished
            ? "finished"
            : match.status === "NS"
              ? "upcoming"
              : "live";

        const statusLabel =
          isFinished
            ? "✓ Tamamlandı"
            : match.status === "NS"
              ? "Henüz oynanmadı"
              : "🔴 Canlı";

        return `
          <div class="fixture-row ${statusClass}">

            <span class="fixture-team home">
              ${match.home_team}
            </span>

            <span class="fixture-score">
              ${scoreDisplay}
            </span>

            <span class="fixture-team away">
              ${match.away_team}
            </span>

            <span class="fixture-status ${statusClass}">
              ${statusLabel}
            </span>

          </div>
        `;
      })
      .join("");
}

$("fixtureWeekSelect")
  ?.addEventListener("change", event => {
    renderFixtureList(Number(event.target.value));
  });

/* ---------------------------------
   GENEL KLASMAN
---------------------------------- */

function renderLeaderboard() {

  const sortedPlayers =
    [...players].sort(
      (firstPlayer, secondPlayer) =>
        Number(
          secondPlayer.total_points || 0
        ) -
        Number(
          firstPlayer.total_points || 0
        )
    );

  const topScore =
    sortedPlayers.length
      ? Number(
          sortedPlayers[0]
            .total_points || 0
        )
      : 0;

  $("leaderBody").innerHTML =
    sortedPlayers
      .map(
        (player, index) => {

          const playerPoints =
            Number(
              player.total_points || 0
            );

          const difference =
            topScore - playerPoints;

          return `
            <tr>

              <td>
                ${rankLabel(index)}
              </td>

              <td>
                ${player.name}
              </td>

              <td class="points">
                ${numberTR(playerPoints)}
              </td>

              <td>
                ${
                  index === 0
                    ? "-"
                    : numberTR(difference)
                }
              </td>

            </tr>
          `;
        }
      )
      .join("");

  const topPlayers =
    sortedPlayers
      .filter(
        player =>
          Number(player.total_points || 0) > 0
      )
      .slice(0, 3);

  $("podium").innerHTML =
    topPlayers.length
      ? topPlayers
          .map(
            (player, index) => `
              <div class="pod">

                <div class="medal">
                  ${
                    [
                      "🥇",
                      "🥈",
                      "🥉"
                    ][index]
                  }
                </div>

                <div class="name">
                  ${player.name}
                </div>

                <div class="points">
                  ${numberTR(
                    player.total_points
                  )}
                </div>

              </div>
            `
          )
          .join("")
      : `
          <div class="card empty-state">
            Genel klasman için henüz puan bulunmuyor.
          </div>
        `;
}

/* ---------------------------------
   DÖNEM PUANLARI
---------------------------------- */

async function loadPeriodLeaderboard() {

  const {
    data,
    error
  } =
    await supabaseClient
      .from(
        "period_leaderboard"
      )
      .select("*")
      .order(
        "period_no",
        {
          ascending: true
        }
      )
      .order(
        "total_points",
        {
          ascending: false
        }
      );

  if (error) {

    console.error(
      "Dönem sıralamaları yüklenemedi:",
      error
    );

    toast(
      "Dönem sıralamaları yüklenemedi"
    );

    return;
  }

  periodRows =
    data || [];

  renderPeriodViews();
}

function rowsForPeriod(
  periodNumber
) {

  const pointsByPlayerId =
    new Map();

  periodRows
    .filter(
      row =>
        Number(row.period_no) ===
        Number(periodNumber)
    )
    .forEach(row => {

      const playerId =
        row.player_id ??
        row.id;

      if (
        playerId === null ||
        playerId === undefined
      ) {
        return;
      }

      pointsByPlayerId.set(
        String(playerId),
        Number(row.total_points || 0)
      );
    });

  return players
    .map(player => ({
      id: player.id,
      name: player.name,
      total_points:
        pointsByPlayerId.get(
          String(player.id)
        ) || 0
    }))
    .sort(
      (firstPlayer, secondPlayer) => {

        const pointDifference =
          secondPlayer.total_points -
          firstPlayer.total_points;

        if (pointDifference !== 0) {
          return pointDifference;
        }

        return firstPlayer.name
          .localeCompare(
            secondPlayer.name,
            "tr"
          );
      }
    );
}

function renderPeriodViews() {

  if (!activePeriod) {
    return;
  }

  const startWeek =
    periodStart(
      activePeriod
    );

  const endWeek =
    periodEnd(
      activePeriod
    );

  const activePeriodRows =
    rowsForPeriod(
      activePeriod
    );

  const activePeriodTopScore =
    activePeriodRows.length
      ? activePeriodRows[0]
          .total_points
      : 0;

  $("activePeriodTitle")
    .textContent =
    `⚡ Aktif Dönem: Hafta ${startWeek}-${endWeek}`;

  $("activePeriodDescription")
    .textContent =
    `Dönem ${activePeriod} canlı sıralaması. İlk üç oyuncu kürsüde gösterilir.`;

  $("periodBody").innerHTML =
    activePeriodRows
      .map(
        (player, index) => {

          const difference =
            activePeriodTopScore -
            player.total_points;

          return `
            <tr>

              <td>
                ${rankLabel(index)}
              </td>

              <td>
                ${player.name}
              </td>

              <td class="points">
                ${numberTR(
                  player.total_points
                )}
              </td>

              <td>
                ${
                  index === 0
                    ? "-"
                    : numberTR(difference)
                }
              </td>

            </tr>
          `;
        }
      )
      .join("");

  const hasActivePeriodPoints =
    activePeriodRows.some(
      player =>
        Number(player.total_points) > 0
    );

  $("periodPodium").innerHTML =
    hasActivePeriodPoints
      ? activePeriodRows
          .slice(0, 3)
          .map(
            (player, index) => `
              <div class="pod">

                <div class="medal">
                  ${
                    [
                      "🥇",
                      "🥈",
                      "🥉"
                    ][index]
                  }
                </div>

                <div class="name">
                  ${player.name}
                </div>

                <div class="points">
                  ${numberTR(
                    player.total_points
                  )}
                </div>

              </div>
            `
          )
          .join("")
      : `
          <div class="card empty-state">
            Aktif dönem için henüz puan bulunmuyor.
          </div>
        `;

  const highestPeriodNumber =
    Math.max(
      Number(activePeriod || 1),
      ...periodRows.map(
        row =>
          Number(row.period_no || 0)
      )
    );

  const periodNumbers =
    Array.from(
      {
        length: highestPeriodNumber
      },
      (_, index) => index + 1
    );

  renderPeriodPodiums(
    periodNumbers
  );

  renderMedals(
    periodNumbers
  );
}

/* ---------------------------------
   DÖNEM KÜRSÜLERİ
---------------------------------- */

function renderPeriodPodiums(
  periodNumbers
) {

  $("periodPodiums").innerHTML =
    periodNumbers
      .map(periodNumber => {

        const fullPeriodRows =
          rowsForPeriod(
            periodNumber
          );

        const hasPeriodData =
          fullPeriodRows.some(
            player =>
              Number(player.total_points) > 0
          );

        const topThree =
          hasPeriodData
            ? fullPeriodRows.slice(0, 3)
            : [];

        const completed =
          periodEnd(periodNumber) <
          activeWeek;

        const current =
          Number(periodNumber) ===
          Number(activePeriod);

        const statusText =
          completed
            ? "TAMAMLANDI"
            : current
              ? "DEVAM EDİYOR"
              : "YAKINDA";

        const cardClass =
          completed
            ? "score"
            : current
              ? "side"
              : "ou";

        return `
          <article
            class="card rule ${cardClass}">

            <span class="eyebrow">
              ${statusText}
            </span>

            <h3>
              Dönem ${periodNumber}
            </h3>

            <p>
              Hafta
              ${periodStart(periodNumber)}
              -
              ${periodEnd(periodNumber)}
            </p>

            <div class="period-ranking">

              ${
                topThree.length
                  ? topThree
                      .map(
                        (player, index) => `
                          <p>

                            <span>
                              ${
                                [
                                  "🥇",
                                  "🥈",
                                  "🥉"
                                ][index]
                              }
                            </span>

                            <strong>
                              ${player.name}
                            </strong>

                            <span>
                              ${numberTR(
                                player.total_points
                              )}
                              puan
                            </span>

                          </p>
                        `
                      )
                      .join("")
                  : `
                      <p class="empty-period">
                        Bu dönem için henüz puan bulunmuyor.
                      </p>
                    `
              }

            </div>

          </article>
        `;
      })
      .join("");
}

/* ---------------------------------
   MADALYA TABLOSU
---------------------------------- */

function renderMedals(
  periodNumbers
) {

  const medals =
    new Map(
      players.map(
        player => [
          String(player.id),
          {
            name: player.name,
            gold: 0,
            silver: 0,
            bronze: 0
          }
        ]
      )
    );

  const completedPeriods =
    periodNumbers.filter(
      periodNumber =>
        periodEnd(periodNumber) <
        activeWeek
    );

  completedPeriods
    .forEach(periodNumber => {

      const periodRanking =
        rowsForPeriod(
          periodNumber
        );

      const hasPeriodPoints =
        periodRanking.some(
          player =>
            Number(player.total_points) > 0
        );

      if (!hasPeriodPoints) {
        return;
      }

      const topThree =
        periodRanking.slice(0, 3);

      topThree.forEach(
        (player, index) => {

          const medalRecord =
            medals.get(
              String(player.id)
            );

          if (!medalRecord) {
            return;
          }

          if (index === 0) {
            medalRecord.gold++;
          }

          if (index === 1) {
            medalRecord.silver++;
          }

          if (index === 2) {
            medalRecord.bronze++;
          }
        }
      );
    });

  const medalRows =
    [...medals.values()]
      .sort(
        (
          firstPlayer,
          secondPlayer
        ) => {

          if (
            secondPlayer.gold !==
            firstPlayer.gold
          ) {
            return (
              secondPlayer.gold -
              firstPlayer.gold
            );
          }

          if (
            secondPlayer.silver !==
            firstPlayer.silver
          ) {
            return (
              secondPlayer.silver -
              firstPlayer.silver
            );
          }

          if (
            secondPlayer.bronze !==
            firstPlayer.bronze
          ) {
            return (
              secondPlayer.bronze -
              firstPlayer.bronze
            );
          }

          return firstPlayer.name
            .localeCompare(
              secondPlayer.name,
              "tr"
            );
        }
      );

  $("medalBody").innerHTML =
    medalRows
      .map(
        (player, index) => {

          const totalMedals =
            player.gold +
            player.silver +
            player.bronze;

          return `
            <tr>

              <td>
                ${index + 1}
              </td>

              <td>
                ${player.name}
              </td>

              <td>
                ${player.gold}
              </td>

              <td>
                ${player.silver}
              </td>

              <td>
                ${player.bronze}
              </td>

              <td class="points">
                ${totalMedals}
              </td>

            </tr>
          `;
        }
      )
      .join("");
}

/* ---------------------------------
   MAÇ PUANLARI
---------------------------------- */

function renderCompletedMatchSelect() {

  const select =
    $("completedMatchSelect");

  if (!select) {
    return;
  }

  if (!completedMatches.length) {

    select.innerHTML = `
      <option value="">
        Henüz skoru işlenmiş maç bulunmuyor
      </option>
    `;

    return;
  }

  const currentValue =
    select.value;

  select.innerHTML = `
    <option value="">
      Maç seç...
    </option>

    ${
      completedMatches
        .map(match => `
          <option value="${match.id}">
            ${match.week}. Hafta ·
            ${match.home_team}
            ${match.home_score}-${match.away_score}
            ${match.away_team}
          </option>
        `)
        .join("")
    }
  `;

  if (
    currentValue &&
    completedMatches.some(
      match =>
        String(match.id) ===
        String(currentValue)
    )
  ) {
    select.value = currentValue;
  }
}

/* point_type -> bileşen eşlemesi */

function normalizePointType(rawType) {

  const value =
    String(rawType || "")
      .toLowerCase();

  if (value === "exact_score") {
    return "scorePoints";
  }

  if (value === "side") {
    return "sidePoints";
  }

  if (value === "over_under") {
    return "overUnderPoints";
  }

  return null;
}

async function loadMatchPoints(matchId) {

  const resultCard =
    $("selectedMatchResult");

  const mvpCards =
    $("matchMvpCards");

  const tableBody =
    $("matchPointsBody");

  if (!tableBody) {
    return;
  }

  if (!matchId) {

    resultCard
      ?.classList
      .add("hidden");

    if (mvpCards) {
      mvpCards.innerHTML = "";
    }

    tableBody.innerHTML = `
      <tr>
        <td colspan="7">
          Puan detaylarını görmek için
          tamamlanan bir maç seçiniz.
        </td>
      </tr>
    `;

    return;
  }

  const selectedMatch =
    completedMatches.find(
      match =>
        String(match.id) ===
        String(matchId)
    );

  if (!selectedMatch) {

    toast("Maç bulunamadı");

    return;
  }

  tableBody.innerHTML = `
    <tr>
      <td colspan="7">
        Maç puanları yükleniyor...
      </td>
    </tr>
  `;

  const [
    predictionResponse,
    pointResponse
  ] =
    await Promise.all([

      supabaseClient
        .rpc(
          "get_week_predictions",
          {
            p_week: Number(selectedMatch.week),
            p_player_id: currentPlayer
              ? Number(currentPlayer)
              : 0
          }
        ),

      supabaseClient
        .from("match_points")
        .select(
          "player_id,match_id,point_type,points"
        )
        .eq(
          "match_id",
          Number(matchId)
        )
    ]);

  if (predictionResponse.error) {

    console.error(
      "Tahminler yüklenemedi:",
      predictionResponse.error
    );

    toast("Maç tahminleri yüklenemedi");

    return;
  }

  if (pointResponse.error) {

    console.error(
      "Maç puanları yüklenemedi:",
      pointResponse.error
    );

    toast("Maç puanları yüklenemedi");

    return;
  }

  const predictions =
    (predictionResponse.data || [])
      .filter(
        row =>
          String(row.match_id) ===
          String(matchId)
      );

  const pointEntries =
    pointResponse.data || [];

  const pointsByPlayer =
    new Map();

  pointEntries.forEach(entry => {

    const key =
      String(entry.player_id);

    if (!pointsByPlayer.has(key)) {

      pointsByPlayer.set(key, {
        scorePoints: 0,
        sidePoints: 0,
        overUnderPoints: 0,
        totalPoints: 0
      });
    }

    const record =
      pointsByPlayer.get(key);

    const amount =
      Number(entry.points || 0);

    const component =
      normalizePointType(
        entry.point_type
      );

    if (component) {
      record[component] += amount;
    }

    record.totalPoints += amount;
  });

  matchPointRows =
    players
      .map(player => {

        const prediction =
          predictions.find(
            row =>
              String(row.player_id) ===
              String(player.id)
          );

        const record =
          pointsByPlayer.get(
            String(player.id)
          ) || {
            scorePoints: 0,
            sidePoints: 0,
            overUnderPoints: 0,
            totalPoints: 0
          };

        return {
          id: player.id,
          name: player.name,

          hasPrediction:
            Boolean(prediction),

          prediction:
            prediction
              ? `${prediction.home_prediction}-${prediction.away_prediction}`
              : "Tahmin yok",

          scorePoints:
            record.scorePoints,

          sidePoints:
            record.sidePoints,

          overUnderPoints:
            record.overUnderPoints,

          totalPoints:
            record.totalPoints
        };
      })
      .sort(
        (firstPlayer, secondPlayer) => {

          const totalDifference =
            secondPlayer.totalPoints -
            firstPlayer.totalPoints;

          if (totalDifference !== 0) {
            return totalDifference;
          }

          const exactDifference =
            secondPlayer.scorePoints -
            firstPlayer.scorePoints;

          if (exactDifference !== 0) {
            return exactDifference;
          }

          return firstPlayer.name
            .localeCompare(
              secondPlayer.name,
              "tr"
            );
        }
      );

  renderSelectedMatchResult(
    selectedMatch
  );

  renderMatchMvpCards();

  renderMatchPointsTable();
}

function renderSelectedMatchResult(
  match
) {

  const resultCard =
    $("selectedMatchResult");

  if (!resultCard) {
    return;
  }

  const exactScoreDistributed =
    matchPointRows.reduce(
      (total, player) =>
        total + player.scorePoints,
      0
    );

  const sideDistributed =
    matchPointRows.reduce(
      (total, player) =>
        total + player.sidePoints,
      0
    );

  const overUnderDistributed =
    matchPointRows.reduce(
      (total, player) =>
        total + player.overUnderPoints,
      0
    );

  const totalDistributed =
    matchPointRows.reduce(
      (total, player) =>
        total + player.totalPoints,
      0
    );

  resultCard
    .classList
    .remove("hidden");

  resultCard.innerHTML = `
    <div class="result-week">
      ${match.week}. HAFTA
    </div>

    <div class="result-teams">

      <span>
        ${match.home_team}
      </span>

      <strong>
        ${match.home_score}
        -
        ${match.away_score}
      </strong>

      <span>
        ${match.away_team}
      </span>

    </div>

    <div class="result-pool-summary">

      <div>
        <small>Tam Skor</small>
        <b>${numberTR(exactScoreDistributed)}</b>
      </div>

      <div>
        <small>Taraf</small>
        <b>${numberTR(sideDistributed)}</b>
      </div>

      <div>
        <small>Alt / Üst</small>
        <b>${numberTR(overUnderDistributed)}</b>
      </div>

      <div class="total">
        <small>Dağıtılan Toplam</small>
        <b>${numberTR(totalDistributed)}</b>
      </div>

    </div>
  `;
}

function bestInComponent(componentKey) {

  const candidates =
    matchPointRows.filter(
      player =>
        Number(player[componentKey]) > 0
    );

  if (!candidates.length) {
    return null;
  }

  const bestScore =
    Math.max(
      ...candidates.map(
        player =>
          Number(player[componentKey])
      )
    );

  const winners =
    candidates.filter(
      player =>
        Number(player[componentKey]) ===
        bestScore
    );

  return {
    names:
      winners
        .map(player => player.name)
        .join(", "),
    points: bestScore
  };
}

function mvpCard(
  icon,
  title,
  winner,
  extraClass
) {

  return `
    <article class="card mvp-card ${extraClass || ""}">

      <div class="mvp-icon">
        ${icon}
      </div>

      <div class="mvp-title">
        ${title}
      </div>

      <div class="mvp-player">
        ${
          winner
            ? winner.names
            : "Kimse bilemedi"
        }
      </div>

      <div class="mvp-points">
        ${
          winner
            ? `${numberTR(winner.points)} puan`
            : "-"
        }
      </div>

    </article>
  `;
}

function renderMatchMvpCards() {

  const container =
    $("matchMvpCards");

  if (!container) {
    return;
  }

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

function renderPointComponent(
  points,
  component
) {

  const numericPoints =
    Number(points || 0);

  if (numericPoints <= 0) {

    return `
      <span class="point-chip zero">
        0
      </span>
    `;
  }

  return `
    <span class="point-chip ${component}">
      +${numberTR(numericPoints)}
    </span>
  `;
}

function renderMatchPointsTable() {

  const body =
    $("matchPointsBody");

  if (!body) {
    return;
  }

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

  body.innerHTML =
    matchPointRows
      .map(
        (player, index) => {

          const hasPoints =
            player.totalPoints > 0;

          return `
            <tr class="${
              index < 3 && hasPoints
                ? `match-rank-${index + 1}`
                : ""
            }">

              <td>
                ${
                  hasPoints
                    ? rankLabel(index)
                    : index + 1
                }
              </td>

              <td>
                <strong>${player.name}</strong>
              </td>

              <td>
                <span class="${
                  player.hasPrediction
                    ? "prediction-score"
                    : "no-prediction"
                }">
                  ${player.prediction}
                </span>
              </td>

              <td>
                ${renderPointComponent(
                  player.scorePoints,
                  "exact"
                )}
              </td>

              <td>
                ${renderPointComponent(
                  player.sidePoints,
                  "side"
                )}
              </td>

              <td>
                ${renderPointComponent(
                  player.overUnderPoints,
                  "ou"
                )}
              </td>

              <td>
                <span class="match-total-points">
                  ${numberTR(
                    player.totalPoints
                  )}
                </span>
              </td>

            </tr>
          `;
        }
      )
      .join("");
}

/* ---------------------------------
   HAFTA KİLİDİ
---------------------------------- */

function weekLockTime() {

  if (!matches.length) {
    return null;
  }

  const kickoffTimes =
    matches.map(
      match =>
        new Date(
          match.kickoff_at
        ).getTime()
    );

  return Math.min(
    ...kickoffTimes
  );
}

function isWeekLocked() {

  const lockTime =
    weekLockTime();

  if (lockTime === null) {
    return false;
  }

  return (
    Date.now() >= lockTime
  );
}

/* ---------------------------------
   TAHMİNLERİ YÜKLEME
---------------------------------- */

async function loadPredictions() {

  const {
    data: weekPredictions,
    error
  } =
    await supabaseClient
      .rpc(
        "get_week_predictions",
        {
          p_week: Number(activeWeek),
          p_player_id: Number(currentPlayer)
        }
      );

  if (error) {

    console.error(
      "Tahminler yüklenemedi:",
      error
    );

    toast(
      "Tahminler yüklenemedi"
    );

    return;
  }

  const saved =
    (weekPredictions || [])
      .filter(
        row =>
          String(row.player_id) ===
          String(currentPlayer)
      );

  $("matchGrid").innerHTML =
    "";

  for (const match of matches) {

    const prediction =
      saved.find(
        savedPrediction =>
          String(
            savedPrediction.match_id
          ) ===
          String(match.id)
      );

    const locked =
      isWeekLocked();

    const card =
      document.createElement(
        "div"
      );

    card.className =
      "match-card";

    card.innerHTML = `

      <div class="match-meta">

        <span>
          ${match.week}. Hafta
        </span>

        <span>
          ${
            new Date(
              match.kickoff_at
            ).toLocaleString(
              "tr-TR"
            )
          }
        </span>

      </div>

      <div class="teams">

        <span class="team">
          ${match.home_team}
        </span>

        <span class="versus">
          VS
        </span>

        <span class="team">
          ${match.away_team}
        </span>

      </div>

      <div class="score-entry">

        <input
          type="number"
          min="0"
          id="h_${match.id}"
          value="${
            prediction?.home_prediction
            ?? ""
          }"
          ${
            locked
              ? "disabled"
              : ""
          }
        >

        <span>
          -
        </span>

        <input
          type="number"
          min="0"
          id="a_${match.id}"
          value="${
            prediction?.away_prediction
            ?? ""
          }"
          ${
            locked
              ? "disabled"
              : ""
          }
        >

      </div>

      <div class="match-footer">

        <span
          class="lock-state ${
            locked
              ? "locked"
              : (
                  prediction
                    ? "saved"
                    : ""
                )
          }">

          ${
            locked
              ? "🔒 Hafta kapandı"
              : (
                  prediction
                    ? "✓ Kaydedildi"
                    : "Tahmin bekleniyor"
                )
          }

        </span>

        <button
          class="btn primary"
          onclick="savePrediction(${match.id})"
          ${
            locked
              ? "disabled"
              : ""
          }>
          Kaydet
        </button>

      </div>
    `;

    $("matchGrid")
      .appendChild(card);
  }

  const lockTime =
    weekLockTime();

  const savedForActiveWeek =
    saved
      .filter(savedPrediction =>
        matches.some(
          match =>
            String(match.id) ===
            String(
              savedPrediction.match_id
            )
        )
      )
      .length;

  if (!matches.length) {

    $("weekSummary")
      .textContent =
      "Aktif hafta için maç bulunamadı.";

    return;
  }

  if (isWeekLocked()) {

    $("weekSummary")
      .textContent =
      `${matches.length} maç · ${savedForActiveWeek} tahmin kayıtlı · 🔒 Hafta kapandı`;

    return;
  }

  $("weekSummary")
    .textContent =
    `${matches.length} maç · ${savedForActiveWeek} tahmin kayıtlı · Son tahmin: ${
      new Date(
        lockTime
      ).toLocaleString(
        "tr-TR"
      )
    }`;
}

/* ---------------------------------
   TEK TAHMİN KAYDETME
---------------------------------- */

window.savePrediction =
  async function(matchId) {

    if (!currentPlayer) {

      toast(
        "Oyuncu seçiniz"
      );

      return false;
    }

    if (isWeekLocked()) {

      toast(
        "Hafta başladı, tahminler kapandı"
      );

      return false;
    }

    const homeInput =
      $(`h_${matchId}`);

    const awayInput =
      $(`a_${matchId}`);

    if (
      !homeInput ||
      !awayInput ||
      homeInput.value === "" ||
      awayInput.value === ""
    ) {

      toast(
        "Skor giriniz"
      );

      return false;
    }

    const homePrediction =
      Number(
        homeInput.value
      );

    const awayPrediction =
      Number(
        awayInput.value
      );

    if (
      !Number.isInteger(
        homePrediction
      ) ||
      !Number.isInteger(
        awayPrediction
      ) ||
      homePrediction < 0 ||
      awayPrediction < 0
    ) {

      toast(
        "Geçerli bir skor giriniz"
      );

      return false;
    }

    const {
      error
    } =
      await supabaseClient
        .rpc(
          "submit_prediction",
          {
            p_player_id:
              Number(currentPlayer),

            p_match_id:
              Number(matchId),

            p_home_prediction:
              homePrediction,

            p_away_prediction:
              awayPrediction
          }
        );

    if (error) {

      console.error(
        "Tahmin kaydedilemedi:",
        error
      );

      toast(
        error.message ||
        "Tahmin kaydedilemedi"
      );

      return false;
    }

    const matchCard =
      homeInput.closest(
        ".match-card"
      );

    const state =
      matchCard
        ?.querySelector(
          ".lock-state"
        );

    if (state) {

      state.textContent =
        "✓ Kaydedildi";

      state.className =
        "lock-state saved";
    }

    return true;
  };

/* ---------------------------------
   TÜM TAHMİNLERİ KAYDETME
---------------------------------- */

$("saveAllBtn")
  .addEventListener(
    "click",
    async () => {

      if (isWeekLocked()) {

        toast(
          "Hafta başladı, tahminler kapandı"
        );

        return;
      }

      let savedCount = 0;
      let skippedCount = 0;

      for (
        const match
        of matches
      ) {

        const homeInput =
          $(`h_${match.id}`);

        const awayInput =
          $(`a_${match.id}`);

        if (
          !homeInput ||
          !awayInput ||
          homeInput.value === "" ||
          awayInput.value === ""
        ) {

          skippedCount++;

          continue;
        }

        const saved =
          await window
            .savePrediction(
              match.id
            );

        if (saved) {
          savedCount++;
        }
      }

      toast(
        `${savedCount} tahmin kaydedildi, ${skippedCount} maç atlandı`
      );

      await loadPredictions();
    }
  );

/* ---------------------------------
   YENİLEME
---------------------------------- */

$("refreshBtn")
  .addEventListener(
    "click",
    async () => {

      await loadPlayers();

      await loadMatches();

      await loadPeriodLeaderboard();

      if (currentPlayer) {
        await loadPredictions();
      }

      toast(
        "Veriler yenilendi"
      );
    }
  );

$("refreshMatchPointsBtn")
  ?.addEventListener(
    "click",
    async () => {

      await loadPlayers();

      await loadMatches();

      const selectedMatchId =
        $("completedMatchSelect")
          ?.value;

      if (selectedMatchId) {

        await loadMatchPoints(
          selectedMatchId
        );
      }

      toast(
        "Maç puanları yenilendi"
      );
    }
  );

$("completedMatchSelect")
  ?.addEventListener(
    "change",
    async event => {

      await loadMatchPoints(
        event.target.value
      );
    }
  );

/* ---------------------------------
   OYUNCU GİRİŞİ
---------------------------------- */

$("loginBtn")
  .addEventListener(
    "click",
    async () => {

      currentPlayer =
        $("playerSelect").value;

      if (!currentPlayer) {

        toast(
          "Oyuncu seçiniz"
        );

        return;
      }

      $("loginCard")
        .classList
        .add("hidden");

      $("gameArea")
        .classList
        .remove("hidden");

      const selectedPlayer =
        players.find(
          player =>
            String(player.id) ===
            String(currentPlayer)
        );

      $("activePlayerName")
        .textContent =
        selectedPlayer
          ? selectedPlayer.name
          : "";

      await loadPredictions();
    }
  );

/* ---------------------------------
   OYUNCU DEĞİŞTİRME
---------------------------------- */

$("logoutBtn")
  .addEventListener(
    "click",
    () => {

      currentPlayer =
        null;

      $("gameArea")
        .classList
        .add("hidden");

      $("loginCard")
        .classList
        .remove("hidden");
    }
  );

/* ---------------------------------
   TEMA
---------------------------------- */

$("themeBtn")
  .addEventListener(
    "click",
    () => {

      const isLight =
        document
          .documentElement
          .getAttribute(
            "data-theme"
          ) === "light";

      document
        .documentElement
        .setAttribute(
          "data-theme",
          isLight
            ? "dark"
            : "light"
        );

      $("themeBtn")
        .textContent =
        isLight
          ? "☀"
          : "🌙";
    }
  );

/* ---------------------------------
   SEKME GEÇİŞLERİ
---------------------------------- */

document
  .querySelectorAll(".tab")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        document
          .querySelectorAll(".tab")
          .forEach(tab => {

            tab.classList
              .remove("active");
          });

        button.classList
          .add("active");

        document
          .querySelectorAll(
            ".tab-panel"
          )
          .forEach(panel => {

            panel.classList
              .add("hidden");
          });

        const targetPanel =
          $(
            `${button.dataset.tab}Panel`
          );

        if (targetPanel) {

          targetPanel
            .classList
            .remove("hidden");
        }

        if (
          button.dataset.tab ===
          "matchPoints"
        ) {

          const select =
            $("completedMatchSelect");

          if (
            select &&
            !select.value &&
            completedMatches.length
          ) {

            select.value =
              String(
                completedMatches[0].id
              );

            loadMatchPoints(
              completedMatches[0].id
            );
          }
        }

        if (
          button.dataset.tab ===
          "fixture"
        ) {

          renderFixtureWeekOptions();
        }
      }
    );
  });

/* ---------------------------------
   UYGULAMAYI BAŞLATMA
---------------------------------- */

(async () => {

  $("connectionBadge")
    .textContent =
    "Bağlanıyor...";

  try {

    await loadPlayers();

    await loadMatches();

    await loadPeriodLeaderboard();

    $("connectionBadge")
      .className =
      "status online";

    $("connectionBadge")
      .textContent =
      "Supabase bağlı";

  } catch (error) {

    console.error(
      "Uygulama başlatılamadı:",
      error
    );

    $("connectionBadge")
      .className =
      "status offline";

    $("connectionBadge")
      .textContent =
      "Bağlantı hatası";

    toast(
      "Uygulama başlatılamadı"
    );
  }

})();

