// Cron (a cada 2 min): IA lê as conversas novas e cria tarefas
import { NextRequest, NextResponse } from "next/server";
import { analisarPendentes } from "@/lib/analise";
import { transcreverPendentes } from "@/lib/transcrever";
import { sincronizarChat } from "@/lib/gchat";
import { googleConfigurado } from "@/lib/google";
import { listarSocios } from "@/lib/socios";
import { comDono } from "@/lib/contexto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const okCron = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const okManual = process.env.WEBHOOK_SECRET && secret === process.env.WEBHOOK_SECRET;
  if (!okCron && !okManual) return NextResponse.json({ ok: false }, { status: 401 });

  let audios: any = {};
  try { audios = await transcreverPendentes(8); } catch (e: any) { audios = { erro: e?.message }; }
  let chat: any = {};
  if (googleConfigurado()) for (const s of await listarSocios()) {
    try { chat[s.email] = await comDono(s.email, () => sincronizarChat({ diasPrimeira: 3 })); } catch (e: any) { chat[s.email] = { erro: e?.message }; }
  }
  const r = await analisarPendentes(8);
  return NextResponse.json({ ok: true, audios, chat, ...r });
}
