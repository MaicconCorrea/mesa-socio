import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Assina o e-mail de quem está logado (o servidor confere a assinatura antes de confiar no cabeçalho)
async function assinar(email: string) {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.WEBHOOK_SECRET || "mesa"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(email.toLowerCase()));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(list) {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );
  const { data } = await supabase.auth.getUser();
  if (!data.user && req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  }
  if (!data.user && !req.nextUrl.pathname.startsWith("/login")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // repassa "quem é" para as telas e rotas (cada sócio só vê o que é dele)
  const h = new Headers(req.headers);
  h.delete("x-mesa-dono"); h.delete("x-mesa-dono-sig");
  if (data.user?.email) { h.set("x-mesa-dono", data.user.email.toLowerCase()); h.set("x-mesa-dono-sig", await assinar(data.user.email)); }
  const final = NextResponse.next({ request: { headers: h } });
  res.cookies.getAll().forEach(c => final.cookies.set(c));
  return final;
}

export const config = {
  // webhook e cron têm senha própria; o resto exige login
  matcher: ["/((?!api/webhook|api/cron|api/gravacao|api/ext|api/painel|_next/static|_next/image|favicon.ico|logo-branco.png|logo-cor.png|manifest.json|sw.js|privacidade-gravador.html|icone-192.png|icone-512.png).*)"],
};
