const SUPABASE_URL = "https://xmdbbvhnzsswqcqibwax.supabase.co";

const SUPABASE_ANON_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtZGJidmhuenNzd3FjcWlid2F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NjQ5ODUsImV4cCI6MjEwNTE0MDk4NX0.FkHURLNFSC6GI_tyO54CXOj_XX30kTlLQ9e9YsboAns";

console.log("Süper Lig Tahmin Oyunu V1 başladı.");

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

async function testConnection() {
  try {
    const { data, error } = await supabaseClient
      .from('players')
      .select('*');

    if (error) {
      console.error(error);
      alert("Supabase bağlantı hatası");
      return;
    }

    console.log("Oyuncular:", data);
    alert(JSON.stringify(data));

    alert("Supabase bağlantısı başarılı");
  } catch (err) {
    console.error(err);
    alert("Bağlantı kurulamadı");
  }
}

window.addEventListener("load", testConnection);
