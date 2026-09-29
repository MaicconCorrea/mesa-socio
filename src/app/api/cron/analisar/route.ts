// Cron (a cada 2 min): IA lê as conversas novas e cria tarefas
import { NextRequest, NextResponse } from "next/server";
import { analisarPendentes } from "@/lib/analise";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const okCron = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const okManual = process.env.WEBHOOK_SECRET && secret === process.env.WEBHOOK_SECRET;
  if (!okCron && !okManual) return NextResponse.json({ ok: false }, { status: 401 });

  const r = await analisarPendentes(8);
  return NextResponse.json({ ok: true, ...r });
}
