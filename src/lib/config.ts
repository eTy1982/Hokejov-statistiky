/** Publikovatelný Supabase klíč patří do klientského kódu – přístup k datům
 *  hlídá RLS (politika `authorized_all` nad `is_authorized_user()`), ne utajení
 *  klíče. Hodnoty jdou přebít proměnnými prostředí při buildu. */
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://rugvucoykdbyfubmwike.supabase.co";

export const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_KEY ?? "sb_publishable_vUmZNmnIds8z9yyeFEyvHQ_wvwrZ2my";
