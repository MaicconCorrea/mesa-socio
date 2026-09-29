import { createClient } from "@supabase/supabase-js";

// Cliente com service_role: só roda no servidor (nunca no navegador).
export function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
