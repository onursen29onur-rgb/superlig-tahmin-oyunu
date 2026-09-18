const SUPABASE_URL = "https://xmdbbvhnzsswqcqibwax.supabase.co";

const SUPABASE_ANON_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtZGJidmhuenNzd3FjcWlid2F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NjQ5ODUsImV4cCI6MjEwNTE0MDk4NX0.FkHURLNFSC6GI_tyO54CXOj_XX30kTlLQ9e9YsboAns";

const supabaseClient =
window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const $ = (id) => document.getElementById(id);

let players = [];
let matches = [];
let currentPlayer = null;

function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => {
    t.classList.remove("show");
  }, 2500);
}

async function loadPlayers(){

  const { data, error } =
    await supabaseClient
      .from("players")
      .select("*")
      .order("total_points", {
        ascending: false
      });

  if(error){
    console.error(error);
    toast("Oyuncular yüklenemedi");
    return;
  }

  players = data || [];

  $("playerSelect").innerHTML =
    '<option value="">Oyuncu seç...</option>' +
    players.map(p =>
      `<option value="${p.id}">${p.name}</option>`
    ).join("");

  renderLeaderboard();
}

async function loadMatches(){

  const { data, error } =
    await supabaseClient
      .from("matches")
      .select("*")
      .order("week", { ascending: true })
      .order("kickoff_at", { ascending: true });

  if(error){
    console.error(error);
    toast("Maçlar yüklenemedi");
    return;
  }

  const allMatches = data || [];

  if(!allMatches.length){
    matches = [];
    return;
  }

  const now = new Date();

  const futureMatches =
    allMatches.filter(
      m => new Date(m.kickoff_at) >= now
    );

  let activeWeek;

  if(futureMatches.length){

    activeWeek = Math.min(
      ...futureMatches.map(m => m.week)
    );

  } else {

    activeWeek = Math.max(
      ...allMatches.map(m => m.week)
    );

  }

  matches =
    allMatches.filter(
      m => m.week === activeWeek
    );

  console.log(
    "Aktif hafta:",
    activeWeek,
    "Maç sayısı:",
    matches.length
  );
}


function renderLeaderboard(){

  const topScore =
    players.length ?
    players[0].total_points : 0;

  $("leaderBody").innerHTML =
    players.map((p, i) => {

      const rank =
        i === 0 ? "🥇" :
        i === 1 ? "🥈" :
        i === 2 ? "🥉" :
        (i + 1);

      return `
      <tr>
        <td>${rank}</td>
        <td>${p.name}</td>
        <td class="points">${p.total_points}</td>
        <td>
          ${
            i === 0
            ? "-"
            : (topScore - p.total_points).toFixed(1)
          }
        </td>
      </tr>
      `;

    }).join("");

  $("podium").innerHTML =
    players.slice(0, 3)
    .map((p, i) => `
      <div class="pod">
        <div class="medal">${["🥇","🥈","🥉"][i]}</div>
        <div class="name">${p.name}</div>
        <div class="points">${p.total_points}</div>
      </div>
    `).join("");
}

function weekLockTime(){

  if(!matches.length){
    return null;
  }

  const times =
    matches.map(m => new Date(m.kickoff_at).getTime());

  return Math.min(...times);
}

function isWeekLocked(){

  const lockTime = weekLockTime();

  if(lockTime === null){
    return false;
  }

  return Date.now() >= lockTime;
}

async function loadPredictions(){

  const { data: savedPredictions, error } =
    await supabaseClient
      .from("predictions")
      .select("*")
      .eq("player_id", currentPlayer);

  if(error){
    console.error(error);
    toast("Tahminler yüklenemedi");
    return;
  }

  const saved = savedPredictions || [];

  $("matchGrid").innerHTML = "";

  for(const match of matches){

    const pred =
      saved.find(p => p.match_id == match.id);

    const locked = isWeekLocked();

    const card = document.createElement("div");

    card.className = "match-card";

    card.innerHTML = `

      <div class="match-meta">
        <span>${match.week}. Hafta</span>
        <span>
          ${new Date(match.kickoff_at).toLocaleString("tr-TR")}
        </span>
      </div>

      <div class="teams">
        <span class="team">${match.home_team}</span>
        <span class="versus">VS</span>
        <span class="team">${match.away_team}</span>
      </div>

      <div class="score-entry">

        <input
          type="number"
          min="0"
          id="h_${match.id}"
          value="${pred?.home_prediction ?? ""}"
          ${locked ? "disabled" : ""}
        >

        <span>-</span>

        <input
          type="number"
          min="0"
          id="a_${match.id}"
          value="${pred?.away_prediction ?? ""}"
          ${locked ? "disabled" : ""}
        >

      </div>

      <div class="match-footer">

        <span class="lock-state ${locked ? "locked" : (pred ? "saved" : "")}">
          ${
            locked
            ? "🔒 Hafta kapandı"
            : (pred ? "✓ Kaydedildi" : "Tahmin bekleniyor")
          }
        </span>

        <button
          class="btn primary"
          onclick="savePrediction(${match.id})"
          ${locked ? "disabled" : ""}
        >
          Kaydet
        </button>

      </div>
    `;

    $("matchGrid").appendChild(card);
  }

  const lockTime = weekLockTime();

  $("weekSummary").textContent =
    isWeekLocked()
    ? `${matches.length} maç · ${saved.length} tahmin kayıtlı · 🔒 Hafta kapandı`
    : `${matches.length} maç · ${saved.length} tahmin kayıtlı · Son tahmin: ${new Date(lockTime).toLocaleString("tr-TR")}`;
}

window.savePrediction =
async function(matchId){

  if(!currentPlayer){
    toast("Oyuncu seçiniz");
    return;
  }

  if(isWeekLocked()){
    toast("Hafta başladı, tahminler kapandı");
    return;
  }

  const homeInput = document.getElementById(`h_${matchId}`);
  const awayInput = document.getElementById(`a_${matchId}`);

  if(homeInput.value === "" || awayInput.value === ""){
    toast("Skor giriniz");
    return;
  }

  const h = Number(homeInput.value);
  const a = Number(awayInput.value);

  if(
    !Number.isInteger(h) ||
    !Number.isInteger(a) ||
    h < 0 || a < 0
  ){
    toast("Geçerli bir skor giriniz");
    return;
  }

  const payload = {
    player_id: currentPlayer,
    match_id: matchId,
    home_prediction: h,
    away_prediction: a,
    updated_at: new Date().toISOString()
  };

  const { error } =
    await supabaseClient
      .from("predictions")
      .upsert(payload, {
        onConflict: "player_id,match_id"
      });

  if(error){
    console.error(error);
    toast("Tahmin kaydedilemedi");
    return;
  }

  const state =
    homeInput
      .closest(".match-card")
      .querySelector(".lock-state");

  state.textContent = "✓ Kaydedildi";
  state.className = "lock-state saved";

  toast("Tahmin kaydedildi");

};

$("saveAllBtn")
.addEventListener(
  "click",
  async () => {

    if(isWeekLocked()){
      toast("Hafta başladı, tahminler kapandı");
      return;
    }

    let ok = 0;
    let skipped = 0;

    for(const match of matches){

      const h = document.getElementById(`h_${match.id}`);
      const a = document.getElementById(`a_${match.id}`);

      if(!h || !a || h.value === "" || a.value === ""){
        skipped++;
        continue;
      }

      await window.savePrediction(match.id);
      ok++;
    }

    toast(`${ok} tahmin kaydedildi, ${skipped} maç atlandı`);

  }
);

$("refreshBtn")
.addEventListener(
  "click",
  async () => {
    await loadPlayers();
    await loadMatches();
    if(currentPlayer){
      await loadPredictions();
    }
    toast("Veriler yenilendi");
  }
);

$("loginBtn")
.addEventListener(
  "click",
  async () => {

    currentPlayer = $("playerSelect").value;

    if(!currentPlayer){
      toast("Oyuncu seçiniz");
      return;
    }

    $("loginCard").classList.add("hidden");
    $("gameArea").classList.remove("hidden");

    const p =
      players.find(
        x => String(x.id) === String(currentPlayer)
      );

    $("activePlayerName").textContent = p ? p.name : "";

    await loadPredictions();

  }
);

$("logoutBtn")
.addEventListener(
  "click",
  () => {

    currentPlayer = null;

    $("gameArea").classList.add("hidden");
    $("loginCard").classList.remove("hidden");

  }
);

$("themeBtn")
.addEventListener(
  "click",
  () => {

    const isLight =
      document.documentElement.getAttribute("data-theme") === "light";

    document.documentElement.setAttribute(
      "data-theme",
      isLight ? "dark" : "light"
    );

    $("themeBtn").textContent = isLight ? "☀" : "🌙";

  }
);

document
.querySelectorAll(".tab")
.forEach(btn => {

  btn.onclick = () => {

    document
    .querySelectorAll(".tab")
    .forEach(t => t.classList.remove("active"));

    btn.classList.add("active");

    document
    .querySelectorAll(".tab-panel")
    .forEach(x => x.classList.add("hidden"));

    document
    .getElementById(btn.dataset.tab + "Panel")
    .classList.remove("hidden");

  };

});

(async () => {

  $("connectionBadge").textContent = "Bağlanıyor...";

  await loadPlayers();
  await loadMatches();

  $("connectionBadge").className = "status online";
  $("connectionBadge").textContent = "Supabase bağlı";

})();

