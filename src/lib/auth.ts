import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function sbServer() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(list) {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            /* chamado de Server Component: ignorar */
          }
        },
      },
    }
  );
}

export async function exigirLogin() {
  const { data } = await sbServer().auth.getUser();
  if (!data.user) throw new Error("Não autenticado");
  return data.user;
}
