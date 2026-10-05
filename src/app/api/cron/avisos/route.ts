// Cron (a cada 2 min): "reunião em 10 min" e "prazo em 30 min"
import { NextRequest, NextResponse } from "next/server";
import { cronDesligado } from "@/lib/mudou";
import { db } from "@/lib/db";
import { listarEventos } from "@/lib/agenda";
import { googleConfigurado } from "@/lib/google";
import { lerConfig } from "@/lib/config";
import { avisarUmaVez, notificar, pushConfigurado } from "@/lib/push";
import { listarSocios } from "@/lib/socios";
import { comDono } from "@/lib/contexto";
import { dbGlobal } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const hm = (s: string) => new Date(s).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

export async function GET(req: NextRequest) {
  const mudou = cronDesligado(); if (mudou) return mudou; // virada: a Mesa mudou para o portal
  const auth = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const ok = (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) || (process.env.WEBHOOK_SECRET && secret === process.env.WEBHOOK_SECRET);
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 });
  if (!pushConfigurado()) return NextResponse.json({ ok: true, pulado: "sem VAPID" });
  const agora = Date.now();
  let avisos = 0;
  for (const s of await listarSocios()) avisos += await comDono(s.email, () => avisarSocio(agora)).catch(() => 0);
  // limpeza dos avisos antigos
  await dbGlobal().from("avisos_enviados").delete().lt("em", new Date(agora - 7 * 86400000).toISOString());
  await dbGlobal().from("webhook_log").delete().lt("em", new Date(agora - 2 * 86400000).toISOString());
  return NextResponse.json({ ok: true, avisos });
}

// Reunião em 10 min e prazo em 30 min — do sócio da vez
async function avisarSocio(agora: number) {
  const cfg = await lerConfig();
  let avisos = 0;

  if (cfg.push_agenda && googleConfigurado()) {
    try {
      const evs = await listarEventos(new Date(agora), new Date(agora + 13 * 60000));
      for (const e of evs) {
        if (e.diaInteiro || e.minhaResposta === "declined") continue;
        const falta = Math.round((new Date(e.inicio).getTime() - agora) / 60000);
        if (falta < 0 || falta > 12) continue;
        if (await avisarUmaVez(`agenda|${e.id}|${e.inicio}`, () =>
          notificar(`📅 Em ${falta} min: ${e.titulo}`, `${hm(e.inicio)}–${hm(e.fim)}${e.meet ? " · toque para entrar no Meet" : ""}`, e.meet || "/agenda", `ag-${e.id}`, "agenda"))) avisos++;
      }
    } catch { /* agenda fora */ }
  }

  if (cfg.push_prazo) {
    const { data: ts } = await db().from("tarefas").select("id,titulo,tipo,prazo,evento_id,conversa_id,email_thread_id").eq("status", "aberta")
      .gte("prazo", new Date(agora + 15 * 60000).toISOString()).lte("prazo", new Date(agora + 35 * 60000).toISOString());
    for (const t of ts || []) {
      if (t.tipo === "reuniao" && t.evento_id) continue; // já avisa pela agenda
      const url = t.conversa_id ? `/whatsapp?c=${t.conversa_id}` : t.email_thread_id ? `/email?thread=${t.email_thread_id}` : "/";
      if (await avisarUmaVez(`prazo|${t.id}|${t.prazo}`, () =>
        notificar(`⏰ ${t.tipo === "promessa" ? "Você prometeu" : "Prazo"} às ${hm(t.prazo)}`, t.titulo, url, `pz-${t.id}`, "prazo"))) avisos++;
    }
  }
  return avisos;
}
