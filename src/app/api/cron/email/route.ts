// Cron (a cada 10 min): atualiza "e-mails esperando resposta" e manda os novos pra IA
import { NextRequest, NextResponse } from "next/server";
import { sincronizarEmail } from "@/lib/email-sync";
import { googleConfigurado } from "@/lib/google";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const ok = (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) || (process.env.WEBHOOK_SECRET && secret === process.env.WEBHOOK_SECRET);
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 });
  if (!googleConfigurado()) return NextResponse.json({ ok: true, pulado: "sem GOOGLE_SERVICE_ACCOUNT_JSON" });
  try { return NextResponse.json({ ok: true, ...(await sincronizarEmail(6)) }); }
  catch (e: any) { return NextResponse.json({ ok: false, erro: String(e?.message ?? e) }, { status: 500 }); }
}
