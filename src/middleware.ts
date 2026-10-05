import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { podeEntrar, SEM_ACESSO_MESA } from "@/lib/acesso";

// Assina o e-mail de quem está logado (o servidor confere a assinatura antes de confiar no cabeçalho)
async function assinar(email: string) {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.WEBHOOK_SECRET || "mesa"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(email.toLowerCase()));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest) {
  // Virada: com MESA_REDIRECIONAR_PARA (ex.: https://painel-outtax.vercel.app/mesa), as TELAS vão para a Mesa nova
  // (mesmo caminho; /login vai para o início). As rotas /api não são redirecionadas (webhook, extensão, painéis).
  const destino = (process.env.MESA_REDIRECIONAR_PARA || "").trim().replace(/\/+$/, "");
  if (destino && !req.nextUrl.pathname.startsWith("/api/")) {
    const p = req.nextUrl.pathname;
    const caminho = p === "/" || p.startsWith("/login") ? "" : p;
    return NextResponse.redirect(destino + caminho + (caminho ? req.nextUrl.search : ""), 302);
  }
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

  // Só sócios ativos e administradores da Mesa (MESA_ADMINS) entram; o resto é deslogado.
  if (data.user && !req.nextUrl.pathname.startsWith("/login")) {
    let ok: boolean;
    try { ok = await podeEntrar(data.user.email); }
    catch (e) {
      console.error("[middleware] não deu para conferir o acesso:", (e as any)?.message || e);
      return req.nextUrl.pathname.startsWith("/api/")
        ? NextResponse.json({ erro: "Não foi possível conferir seu acesso agora. Tente de novo." }, { status: 503 })
        : new NextResponse("Não foi possível conferir seu acesso agora. Recarregue a página em instantes.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    if (!ok) {
      console.warn(`[middleware] acesso recusado: ${data.user.email}`);
      try { await supabase.auth.signOut(); } catch { /* limpa os cookies abaixo de qualquer jeito */ }
      let saida: NextResponse;
      if (req.nextUrl.pathname.startsWith("/api/")) {
        saida = NextResponse.json({ erro: SEM_ACESSO_MESA }, { status: 403 });
      } else {
        const url = req.nextUrl.clone();
        url.pathname = "/login";
        url.search = "";
        url.searchParams.set("erro", SEM_ACESSO_MESA);
        saida = NextResponse.redirect(url);
      }
      res.cookies.getAll().forEach(c => saida.cookies.set(c));
      // garante a saída: apaga os cookies de sessão do Supabase (sb-…), como o "sair"
      req.cookies.getAll().filter(c => c.name.startsWith("sb-")).forEach(c => saida.cookies.set(c.name, "", { path: "/", maxAge: 0 }));
      return saida;
    }
  }

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
  matcher: ["/((?!api/webhook|api/cron|api/gravacao|api/ext|api/painel|api/auth/portal|_next/static|_next/image|favicon.ico|fonts/|logo-branco.png|logo-cor.png|manifest.json|sw.js|privacidade-gravador.html|icone-192.png|icone-512.png).*)"],
};
