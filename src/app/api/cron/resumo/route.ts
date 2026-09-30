// Cron: resumo às 8h (manha) e 17:30 (tarde), dias úteis
import { NextRequest, NextResponse } from "next/server";
import { enviarResumo } from "@/lib/enviar-resumo";
import { listarSocios } from "@/lib/socios";
import { comDono } from "@/lib/contexto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const ok = (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) || (process.env.WEBHOOK_SECRET && secret === process.env.WEBHOOK_SECRET);
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 });
  const periodo = req.nextUrl.searchParams.get("periodo") === "tarde" ? "tarde" : "manha";
  const out: any = {};
  for (const s of await listarSocios()) {
    try { const r = await comDono(s.email, () => enviarResumo(periodo)); out[s.email] = { feito: r.feito, erros: r.erros }; }
    catch (e: any) { out[s.email] = { erro: e?.message }; }
  }
  return NextResponse.json({ ok: true, ...out });
}
