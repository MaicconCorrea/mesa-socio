// Cron (a cada 10 min): atualiza "e-mails esperando resposta" e manda os novos pra IA
import { NextRequest, NextResponse } from "next/server";
import { cronDesligado } from "@/lib/mudou";
import { sincronizarEmail } from "@/lib/email-sync";
import { googleConfigurado } from "@/lib/google";
import { importarReunioes } from "@/lib/reunioes";
import { checarChamados } from "@/lib/chamados";
import { listarSocios } from "@/lib/socios";
import { comDono } from "@/lib/contexto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const mudou = cronDesligado(); if (mudou) return mudou; // virada: a Mesa mudou para o portal
  const auth = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const ok = (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) || (process.env.WEBHOOK_SECRET && secret === process.env.WEBHOOK_SECRET);
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 });
  const r: any = { ok: true };
  try { r.chamados = await checarChamados(); } catch (e: any) { r.erroChamados = e?.message; }
  if (!googleConfigurado()) return NextResponse.json({ ...r, pulado: "sem GOOGLE_SERVICE_ACCOUNT_JSON" });
  r.socios = {};
  for (const s of await listarSocios()) {
    const x: any = {};
    await comDono(s.email, async () => {
      try { x.email = await sincronizarEmail(6); } catch (e: any) { x.erroEmail = String(e?.message ?? e); }
      try { x.reunioes = await importarReunioes(2); } catch (e: any) { x.erroReunioes = String(e?.message ?? e); }
    });
    r.socios[s.email] = x;
  }
  return NextResponse.json(r);
}
