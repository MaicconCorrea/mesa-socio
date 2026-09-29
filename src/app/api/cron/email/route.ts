// Cron (a cada 10 min): atualiza "e-mails esperando resposta" e manda os novos pra IA
import { NextRequest, NextResponse } from "next/server";
import { sincronizarEmail } from "@/lib/email-sync";
import { googleConfigurado } from "@/lib/google";
import { importarReunioes } from "@/lib/reunioes";
import { checarChamados } from "@/lib/chamados";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const ok = (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) || (process.env.WEBHOOK_SECRET && secret === process.env.WEBHOOK_SECRET);
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 });
  const r: any = { ok: true };
  try { r.chamados = await checarChamados(); } catch (e: any) { r.erroChamados = e?.message; }
  if (!googleConfigurado()) return NextResponse.json({ ...r, pulado: "sem GOOGLE_SERVICE_ACCOUNT_JSON" });
  try { r.email = await sincronizarEmail(6); } catch (e: any) { r.erroEmail = String(e?.message ?? e); }
  try { r.reunioes = await importarReunioes(2); } catch (e: any) { r.erroReunioes = String(e?.message ?? e); }
  return NextResponse.json(r);
}
