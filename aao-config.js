/* AAO backend connection settings. Public values only: the Supabase "anon" key is designed to be public.
   NEVER put a service-role key, database URL or any other secret in this file.

   Leave apiBase empty to keep the site in demo mode (sample data, demo logins), exactly as before.
   To connect to the Job Board backend, fill in all three values:
     apiBase          the backend origin + /api/v1, e.g. "https://YOUR-BACKEND.vercel.app/api/v1"
     supabaseUrl      Supabase Project Settings > API > Project URL
     supabaseAnonKey  Supabase Project Settings > API > anon public key
   The backend must list this site's origin in its ALLOWED_ORIGINS.

   turnstileSiteKey  the PUBLIC site key of your Cloudflare Turnstile widget (Cloudflare dashboard > Turnstile). It protects the "Report" form.
                     The matching SECRET key goes only into the backend's TURNSTILE_SECRET_KEY, never here. Leave "" to show no widget (the backend
                     in production then refuses reports without a token). Cloudflare publishes test site keys for trying this out. */
window.AAO_API_CONFIG = {
  apiBase: "",
  supabaseUrl: "",
  supabaseAnonKey: "",
  turnstileSiteKey: ""
};
