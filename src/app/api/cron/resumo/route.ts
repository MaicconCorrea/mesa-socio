// Cron: resumo às 8h (manha) e 17:30 (tarde), dias úteis
import { NextRequest, NextResponse } from "next/server";
import { enviarResumo } from "@/lib/enviar-resumo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const ok = (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) || (process.env.WEBHOOK_SECRET && secret === process.env.WEBHOOK_SECRET);
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 });
  const periodo = req.nextUrl.searchParams.get("periodo") === "tarde" ? "tarde" : "manha";
  const r = await enviarResumo(periodo);
  return NextResponse.json({ ok: true, feito: r.feito, erros: r.erros });
}
