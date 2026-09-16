
const SUPABASE_URL = "https://xmdbbvhnzsswqcqibwax.supabase.co";

const SUPABASE_ANON_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtZGJidmhuenNzd3FjcWlid2F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NjQ5ODUsImV4cCI6MjEwNTE0MDk4NX0.FkHURLNFSC6GI_tyO54CXOj_XX30kTlLQ9e9YsboAns";

const supabaseClient =
window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const $ = (id)=>document.getElementById(id);

let players = [];
let matches = [];
let currentPlayer = null;

function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(()=>{
    t.classList.remove("show");
  },2500);
}

async function loadPlayers(){

  const { data, error } =
    await supabaseClient
      .from("players")
      .select("*")
      .order("total_points",{
        ascending:false
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
      `<option value="${p.id}">
        ${p.name}
      </option>`
    ).join("");

  renderLeaderboard();
}

async function loadMatches(){

  const { data, error } =
    await supabaseClient
      .from("matches")
      .select("*")
      .eq("week",6)
      .order("kickoff_at");

  if(error){
    console.error(error);
    toast("Maçlar yüklenemedi");
    return;
  }

  matches = data || [];
}

function renderLeaderboard(){

  const topScore =
    players.length ?
    players[0].total_points : 0;

  $("leaderBody").innerHTML =
    players.map((p,i)=>{

      const rank =
        i===0 ? "🥇" :
        i===1 ? "🥈" :
        i===2 ? "🥉" :
        (i+1);

      return `
      <tr>
        <td>${rank}</td>
        <td>${p.name}</td>
        <td class="points">
          ${p.total_points}
        </td>
        <td>
          ${
            i===0
            ? "-"
            : (topScore-p.total_points).toFixed(1)
          }
        </td>
      </tr>
      `;

    }).join("");

  $("podium").innerHTML =
    players.slice(0,3)
    .map((p,i)=>`
      <div class="pod">
        <div class="medal">
          ${["🥇","🥈","🥉"][i]}
        </div>
        <div class="name">
          ${p.name}
        </div>
        <div class="points">
          ${p.total_points}
        </div>
      </div>
    `).join("");
}

async function loadPredictions(){

  $("matchGrid").innerHTML = "";

  for(const match of matches){

    const card =
    document.createElement("div");

    card.className = "match-card";

    card.innerHTML = `

      <div class="match-meta">
        <span>6. Hafta</span>
        <span>
          ${new Date(
            match.kickoff_at
          ).toLocaleString("tr-TR")}
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
        >

        <span>-</span>

        <input
          type="number"
          min="0"
          id="a_${match.id}"
        >

      </div>

      <div class="match-footer">

        <span class="lock-state">
          Tahmin bekleniyor
        </span>

        <button
          class="btn primary"
          onclick="savePrediction(${match.id})"
        >
          Kaydet
        </button>

      </div>
    `;

    $("matchGrid")
      .appendChild(card);
  }

  $("weekSummary").textContent =
  `${matches.length} maç yüklendi`;
}

window.savePrediction =
async function(matchId){

  if(!currentPlayer){
    toast("Oyuncu seçiniz");
    return;
  }

  const h =
    Number(
      document.getElementById(
        `h_${matchId}`
      ).value
    );

  const a =
    Number(
      document.getElementById(
        `a_${matchId}`
      ).value
    );

  if(
    Number.isNaN(h) ||
    Number.isNaN(a)
  ){
    toast("Skor giriniz");
    return;
  }

  const payload = {

    player_id:
      currentPlayer,

    match_id:
      matchId,

    home_prediction:
      h,

    away_prediction:
      a

  };

  const { error } =
    await supabaseClient
      .from("predictions")
      .insert(payload);

  if(error){

    console.error(error);

    toast(
      "Tahmin kaydedilemedi"
    );

    return;
  }

  toast(
    "Tahmin kaydedildi"
  );

};

$("loginBtn")
.addEventListener(
  "click",
  async ()=>{

    currentPlayer =
      $("playerSelect").value;

    if(!currentPlayer){

      toast(
        "Oyuncu seçiniz"
      );

      return;
    }

    $("loginCard")
      .classList.add(
        "hidden"
      );

    $("gameArea")
      .classList.remove(
        "hidden"
      );

    const p =
      players.find(
        x =>
          String(x.id) ===
          String(currentPlayer)
      );

    $("activePlayerName")
      .textContent =
      p ? p.name : "";

    await loadPredictions();

  }
);

$("logoutBtn")
.addEventListener(
  "click",
  ()=>{

    currentPlayer = null;

    $("gameArea")
      .classList.add(
        "hidden"
      );

    $("loginCard")
      .classList.remove(
        "hidden"
      );

  }
);

document
.querySelectorAll(".tab")
.forEach(btn=>{

  btn.onclick=()=>{

    document
    .querySelectorAll(".tab")
    .forEach(t=>
      t.classList.remove(
        "active"
      )
    );

    btn.classList.add(
      "active"
    );

    document
    .querySelectorAll(
      ".tab-panel"
    )
    .forEach(x=>
      x.classList.add(
        "hidden"
      )
    );

    document
    .getElementById(
      btn.dataset.tab +
      "Panel"
    )
    .classList.remove(
      "hidden"
    );

  };

});

(async ()=>{

  $("connectionBadge")
    .textContent =
    "Bağlanıyor...";

  await loadPlayers();
  await loadMatches();

  $("connectionBadge")
    .className =
    "status online";

  $("connectionBadge")
    .textContent =
    "Supabase bağlı";

})();
