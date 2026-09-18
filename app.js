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

  const allMatches =
    data || [];

  if (!allMatches.length) {

    matches = [];
    activeWeek = null;
    activePeriod = null;

    if ($("weekSummary")) {
      $("weekSummary").textContent =
        "Aktif hafta için maç bulunamadı.";
    }

    return;
  }

  const now =
    Date.now();

  const futureMatches =
    allMatches.filter(match => {

      const kickoffTime =
        new Date(
          match.kickoff_at
        ).getTime();

      return kickoffTime >= now;
    });

  if (futureMatches.length) {

    activeWeek =
      Math.min(
        ...futureMatches.map(
          match =>
            Number(match.week)
        )
      );

  } else {

    activeWeek =
      Math.max(
        ...allMatches.map(
          match =>
            Number(match.week)
        )
      );
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
    "Aktif hafta maç sayısı:",
    matches.length
  );
}

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

  $("podium").innerHTML =
    sortedPlayers
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
      .join("");
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
      .select(
        "id,name,period_no,total_points"
      )
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
    new Map(
      periodRows
        .filter(
          row =>
            Number(row.period_no) ===
            Number(periodNumber)
        )
        .map(
          row => [
            String(row.id),
            Number(
              row.total_points || 0
            )
          ]
        )
    );

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
      (firstPlayer, secondPlayer) =>
        secondPlayer.total_points -
        firstPlayer.total_points
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

  $("periodPodium").innerHTML =
    activePeriodRows
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
      .join("");

  const periodNumbers =
    [
      ...new Set(
        periodRows.map(
          row =>
            Number(row.period_no)
        )
      )
    ]
      .filter(
        periodNumber =>
          Number.isFinite(
            periodNumber
          )
      )
      .sort(
        (firstPeriod, secondPeriod) =>
          firstPeriod -
          secondPeriod
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

        const topThree =
          fullPeriodRows.slice(
            0,
            3
          );

        const completed =
          periodEnd(periodNumber) <
          activeWeek;

        const statusText =
          completed
            ? "TAMAMLANDI"
            : "DEVAM EDİYOR";

        const cardClass =
          completed
            ? "score"
            : "side";

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
                topThree
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

      const topThree =
        rowsForPeriod(
          periodNumber
        ).slice(
          0,
          3
        );

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
    data: savedPredictions,
    error
  } =
    await supabaseClient
      .from("predictions")
      .select("*")
      .eq(
        "player_id",
        currentPlayer
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
    savedPredictions || [];

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

    const payload = {

      player_id:
        Number(currentPlayer),

      match_id:
        Number(matchId),

      home_prediction:
        homePrediction,

      away_prediction:
        awayPrediction,

      updated_at:
        new Date()
          .toISOString()
    };

    const {
      error
    } =
      await supabaseClient
        .from("predictions")
        .upsert(
          payload,
          {
            onConflict:
              "player_id,match_id"
          }
        );

    if (error) {

      console.error(
        "Tahmin kaydedilemedi:",
        error
      );

      toast(
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

    /*
      Sıralama önemli:
      Önce oyuncular ve maçlar,
      sonra dönem görünümü yüklenir.
    */

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
