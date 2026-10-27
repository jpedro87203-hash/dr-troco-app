
const SUPABASE_URL = "https://wyeutjahcgqjzalfraup.supabase.co";

const SUPABASE_ANON_KEY = "sb_publishable_S_rdGBhmzJrxniwy5Abb7A_tRb3wQsA";

if (!window.supabase) {
  throw new Error("Biblioteca do Supabase não carregada.");
}

if (!window.supabaseClient) {
  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );
}

console.log("Cliente Supabase criado com sucesso.");
