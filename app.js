<!doctype html>
<html lang="tr" data-theme="dark">

<head>
  <meta charset="utf-8">

  <meta
    name="viewport"
    content="width=device-width,initial-scale=1,viewport-fit=cover"
  >

  <meta
    name="theme-color"
    content="#071127"
  >

  <title>Süper Lig Tahmin Oyunu</title>

  <link
    rel="stylesheet"
    href="style.css"
  >

  <script
    defer
    src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">
  </script>

  <script
    defer
    src="app.js">
  </script>
</head>

<body>

  <div class="app-shell">

    <header class="topbar">

      <div class="brand">

        <span class="ball">
          ⚽
        </span>

        <div>
          <strong>Süper Lig Tahmin</strong>
          <small>2026/27 Sezonu</small>
        </div>

      </div>

      <div class="top-actions">

        <span
          id="connectionBadge"
          class="status offline">
          Bağlantı bekleniyor
        </span>

        <button
          id="themeBtn"
          class="icon-btn"
          type="button"
          aria-label="Temayı değiştir">
          ☀
        </button>

      </div>

    </header>

    <main class="container">

      <!-- OYUNCU GİRİŞİ -->

      <section
        id="loginCard"
        class="card login-card">

        <span class="eyebrow">
          OYUNCU GİRİŞİ
        </span>

        <h1>
          Süper Lig Tahmin Oyunu
        </h1>

        <p>
          Oyuncunu seçerek haftalık tahminlerini girebilir,
          genel klasmanı ve dönem sıralamalarını takip edebilirsin.
        </p>

        <label for="playerSelect">
          Oyuncu
        </label>

        <select id="playerSelect">
          <option value="">
            Oyuncu seç...
          </option>
        </select>

        <button
          id="loginBtn"
          class="btn primary"
          type="button">
          Devam Et
        </button>

        <p class="security-note">
          Oyuncu seçimiyle giriş yapılır.
          Tahminler haftanın ilk maçı başladığında otomatik olarak kapanır.
        </p>

      </section>

      <!-- OYUN ALANI -->

      <section
        id="gameArea"
        class="hidden">

        <div class="welcome-row">

          <div>

            <span class="eyebrow">
              AKTİF HAFTA
            </span>

            <h1>
              Merhaba,
              <span id="activePlayerName"></span>
            </h1>

            <p id="weekSummary">
              Tahminlerin yükleniyor...
            </p>

          </div>

          <button
            id="logoutBtn"
            class="btn ghost"
            type="button">
            Oyuncu Değiştir
          </button>

        </div>

        <!-- ANA MENÜ -->

        <nav
          class="tabs"
          aria-label="Uygulama bölümleri">

          <button
            class="tab active"
            data-tab="predictions"
            type="button">
            Tahminlerim
          </button>

          <button
            class="tab"
            data-tab="leaderboard"
            type="button">
            🏆 Genel Klasman
          </button>

          <button
            class="tab"
            data-tab="period"
            type="button">
            ⚡ Aktif Dönem
          </button>

          <button
            class="tab"
            data-tab="periodTopThree"
            type="button">
            🥇 Dönem İlk 3
          </button>

          <button
            class="tab"
            data-tab="rules"
            type="button">
            ⚙️ Puanlama
          </button>

        </nav>

        <!-- TAHMİNLER PANELİ -->

        <section
          id="predictionsPanel"
          class="tab-panel">

          <div class="section-head">

            <div>

              <h2>
                Haftanın Maçları
              </h2>

              <p>
                Skor tahminlerini girerek maçları tek tek
                veya toplu olarak kaydedebilirsin.
              </p>

            </div>

            <button
              id="saveAllBtn"
              class="btn primary"
              type="button">
              Tümünü Kaydet
            </button>

          </div>

          <div
            id="matchGrid"
            class="match-grid">
          </div>

        </section>

        <!-- GENEL KLASMAN PANELİ -->

        <section
          id="leaderboardPanel"
          class="tab-panel hidden">

          <div class="section-head">

            <div>

              <h2>
                🏆 Genel Klasman
              </h2>

              <p>
                Sezonun başlangıcından itibaren kazanılan
                tüm puanların toplamı.
              </p>

            </div>

            <button
              id="refreshBtn"
              class="btn ghost"
              type="button">
              Yenile
            </button>

          </div>

          <div
            id="podium"
            class="podium">
          </div>

          <div class="card table-card">

            <table>

              <thead>
                <tr>
                  <th>#</th>
                  <th>Oyuncu</th>
                  <th>Puan</th>
                  <th>Lidere Fark</th>
                </tr>
              </thead>

              <tbody id="leaderBody">
              </tbody>

            </table>

          </div>

        </section>

        <!-- AKTİF DÖNEM PANELİ -->

        <section
          id="periodPanel"
          class="tab-panel hidden">

          <div class="section-head">

            <div>

              <span class="eyebrow">
                DÖNEM 2
              </span>

              <h2 id="activePeriodTitle">
                ⚡ Aktif Dönem: Hafta 5-8
              </h2>

              <p>
                Yalnızca aktif dört haftalık dönemde
                kazanılan puanların sıralaması.
              </p>

            </div>

          </div>

          <div
            id="periodPodium"
            class="podium">
          </div>

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

              <tbody id="periodBody">

                <tr>
                  <td>🥇</td>
                  <td>Tarık Buğra Gedikli</td>
                  <td class="points">361,7</td>
                  <td>-</td>
                </tr>

                <tr>
                  <td>🥈</td>
                  <td>Sinan Kalyoncu</td>
                  <td class="points">358,4</td>
                  <td>3,3</td>
                </tr>

                <tr>
                  <td>🥉</td>
                  <td>Umut İncirkuş</td>
                  <td class="points">240,9</td>
                  <td>120,8</td>
                </tr>

                <tr>
                  <td>4</td>
                  <td>Onur Şen</td>
                  <td class="points">224,2</td>
                  <td>137,5</td>
                </tr>

                <tr>
                  <td>5</td>
                  <td>Mertcan Şahin</td>
                  <td class="points">178,4</td>
                  <td>183,3</td>
                </tr>

                <tr>
                  <td>6</td>
                  <td>Can Eren Kolasayın</td>
                  <td class="points">136,7</td>
                  <td>225,0</td>
                </tr>

              </tbody>

            </table>

          </div>

        </section>

        <!-- DÖNEM İLK 3 PANELİ -->

        <section
          id="periodTopThreePanel"
          class="tab-panel hidden">

          <div class="section-head">

            <div>

              <h2>
                🥇 Dönem İlk 3
              </h2>

              <p>
                Her dört haftalık dönemde ilk üç sırayı
                alan oyuncular.
              </p>

            </div>

          </div>

          <div
            id="periodTopThreeContainer"
            class="rule-grid">

            <!-- DÖNEM 1 -->

            <article class="card rule score">

              <span class="eyebrow">
                TAMAMLANDI
              </span>

              <h3>
                Dönem 1
              </h3>

              <p>
                Hafta 1-4
              </p>

              <div class="period-ranking">

                <p>
                  🥇
                  <strong>Tarık Buğra Gedikli</strong>
                  <span>1192,7 puan</span>
                </p>

                <p>
                  🥈
                  <strong>Umut İncirkuş</strong>
                  <span>1087,8 puan</span>
                </p>

                <p>
                  🥉
                  <strong>Mertcan Şahin</strong>
                  <span>1044,3 puan</span>
                </p>

              </div>

            </article>

            <!-- DÖNEM 2 -->

            <article class="card rule side">

              <span class="eyebrow">
                DEVAM EDİYOR
              </span>

              <h3>
                Dönem 2
              </h3>

              <p>
                Hafta 5-8
              </p>

              <div class="period-ranking">

                <p>
                  🥇
                  <strong>Tarık Buğra Gedikli</strong>
                  <span>361,7 puan</span>
                </p>

                <p>
                  🥈
                  <strong>Sinan Kalyoncu</strong>
                  <span>358,4 puan</span>
                </p>

                <p>
                  🥉
                  <strong>Umut İncirkuş</strong>
                  <span>240,9 puan</span>
                </p>

              </div>

            </article>

          </div>

          <!-- MADALYA ÖZETİ -->

          <div class="section-head">

            <div>

              <h2>
                🏅 Tamamlanan Dönem Madalyaları
              </h2>

              <p>
                Yalnızca tamamlanmış dönemlerin sonuçları
                madalya tablosuna dahil edilir.
              </p>

            </div>

          </div>

          <div class="card table-card">

            <table>

              <thead>
                <tr>
                  <th>#</th>
                  <th>Oyuncu</th>
                  <th>🥇</th>
                  <th>🥈</th>
                  <th>🥉</th>
                  <th>Toplam</th>
                </tr>
              </thead>

              <tbody id="medalBody">

                <tr>
                  <td>1</td>
                  <td>Tarık Buğra Gedikli</td>
                  <td>1</td>
                  <td>0</td>
                  <td>0</td>
                  <td class="points">1</td>
                </tr>

                <tr>
                  <td>2</td>
                  <td>Umut İncirkuş</td>
                  <td>0</td>
                  <td>1</td>
                  <td>0</td>
                  <td class="points">1</td>
                </tr>

                <tr>
                  <td>3</td>
                  <td>Mertcan Şahin</td>
                  <td>0</td>
                  <td>0</td>
                  <td>1</td>
                  <td class="points">1</td>
                </tr>

              </tbody>

            </table>

          </div>

        </section>

        <!-- PUANLAMA PANELİ -->

        <section
          id="rulesPanel"
          class="tab-panel hidden">

          <div class="section-head">

            <div>

              <h2>
                ⚙️ Puanlama Sistemi
              </h2>

              <p>
                Her maçta toplam 300 puanlık üç ayrı
                ödül havuzu bulunur.
              </p>

            </div>

          </div>

          <div class="rule-grid">

            <article class="card rule score">

              <b>
                150
              </b>

              <h3>
                Tam Skor Havuzu
              </h3>

              <p>
                Tam skoru doğru tahmin eden oyuncular
                arasında eşit olarak bölünür.
              </p>

              <small>
                Bilen oyuncu yoksa havuz puanı yanar.
              </small>

            </article>

            <article class="card rule side">

              <b>
                100
              </b>

              <h3>
                Taraf Havuzu
              </h3>

              <p>
                Maç sonucunu 1, X veya 2 olarak doğru
                tahmin eden oyuncular arasında eşit bölünür.
              </p>

              <small>
                Bilen oyuncu yoksa havuz puanı yanar.
              </small>

            </article>

            <article class="card rule ou">

              <b>
                50
              </b>

              <h3>
                Alt / Üst Havuzu
              </h3>

              <p>
                Toplam gol sayısının 2,5 altı veya üstü
                olduğunu doğru tahmin edenler arasında bölünür.
              </p>

              <small>
                Bilen oyuncu yoksa havuz puanı yanar.
              </small>

            </article>

          </div>

        </section>

      </section>

    </main>

  </div>

  <div
    id="toast"
    class="toast"
    role="status"
    aria-live="polite">
  </div>

</body>

</html>

