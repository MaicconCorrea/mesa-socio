// Cron (a cada 1 min): busca na Evolution o que não chegou pelo webhook
import { NextRequest, NextResponse } from "next/server";
import { cronDesligado } from "@/lib/mudou";
import { varrerTodos } from "@/lib/varredura";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const mudou = cronDesligado(); if (mudou) return mudou; // virada: a Mesa mudou para o portal
  const auth = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const ok = (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) || (process.env.WEBHOOK_SECRET && secret === process.env.WEBHOOK_SECRET);
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, numeros: await varrerTodos(30) });
}
