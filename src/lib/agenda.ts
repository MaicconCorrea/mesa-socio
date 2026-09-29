// Google Agenda do Maiccon (calendário principal) pela conta de serviço
import crypto from "node:crypto";
import { ESCOPOS, minhaConta, tokenGoogle } from "./google";

const API = "https://www.googleapis.com/calendar/v3";
const TZ = "America/Sao_Paulo";

async function api(caminho: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${caminho}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await tokenGoogle(ESCOPOS.agenda)}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text();
    if (/has not been used|is disabled/i.test(t)) throw new Error("A Google Calendar API não está ativa no projeto do Google Cloud da conta de serviço.");
    throw new Error(`Agenda ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.status === 204 ? null : r.json();
}

export type Evento = {
  id: string; titulo: string; inicio: string; fim: string; diaInteiro: boolean; local: string | null;
  meet: string | null; link: string; convidados: { email: string; nome?: string; resposta?: string }[];
  minhaResposta: string | null; descricao: string | null; organizador: string | null;
};

function converter(e: any): Evento {
  const eu = minhaConta();
  const conv = (e.attendees ?? []).filter((a: any) => !a.resource);
  return {
    id: e.id, titulo: e.summary || "(sem título)",
    inicio: e.start?.dateTime ?? `${e.start?.date}T00:00:00-03:00`,
    fim: e.end?.dateTime ?? `${e.end?.date}T00:00:00-03:00`,
    diaInteiro: !e.start?.dateTime, local: e.location ?? null,
    meet: e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === "video")?.uri ?? null,
    link: e.htmlLink, descricao: e.description ?? null, organizador: e.organizer?.email ?? null,
    convidados: conv.map((a: any) => ({ email: a.email, nome: a.displayName, resposta: a.responseStatus })),
    minhaResposta: conv.find((a: any) => a.self || a.email?.toLowerCase() === eu)?.responseStatus ?? null,
  };
}

export async function listarEventos(de: Date, ate: Date): Promise<Evento[]> {
  const p = new URLSearchParams({
    timeMin: de.toISOString(), timeMax: ate.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250", timeZone: TZ,
  });
  const j = await api(`/calendars/primary/events?${p}`);
  return (j?.items ?? []).filter((e: any) => e.status !== "cancelled").map(converter);
}

export async function criarEvento(e: { titulo: string; inicio: string; fim: string; descricao?: string; convidados?: string[]; comMeet?: boolean; local?: string }) {
  const corpo: any = {
    summary: e.titulo, description: e.descricao || undefined, location: e.local || undefined,
    start: { dateTime: e.inicio, timeZone: TZ }, end: { dateTime: e.fim, timeZone: TZ },
    attendees: (e.convidados ?? []).filter(Boolean).map(email => ({ email })),
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] },
  };
  if (e.comMeet) corpo.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
  const q = new URLSearchParams({ sendUpdates: corpo.attendees.length ? "all" : "none", ...(e.comMeet ? { conferenceDataVersion: "1" } : {}) });
  return converter(await api(`/calendars/primary/events?${q}`, { method: "POST", body: JSON.stringify(corpo) }));
}

export async function apagarEvento(id: string) {
  await api(`/calendars/primary/events/${encodeURIComponent(id)}?sendUpdates=all`, { method: "DELETE" });
}

export async function responderEvento(id: string, resposta: "accepted" | "declined" | "tentative") {
  const e = await api(`/calendars/primary/events/${encodeURIComponent(id)}`);
  const eu = minhaConta();
  const attendees = (e.attendees ?? []).map((a: any) => (a.self || a.email?.toLowerCase() === eu) ? { ...a, responseStatus: resposta } : a);
  return converter(await api(`/calendars/primary/events/${encodeURIComponent(id)}?sendUpdates=all`, { method: "PATCH", body: JSON.stringify({ attendees }) }));
}

// Tem compromisso nesse horário? (usado quando a IA acha uma reunião combinada no WhatsApp)
export async function conflitos(inicio: Date, fim: Date): Promise<Evento[]> {
  const evs = await listarEventos(new Date(inicio.getTime() - 1000), new Date(fim.getTime() + 1000));
  return evs.filter(ev => !ev.diaInteiro && ev.minhaResposta !== "declined"
    && new Date(ev.inicio) < fim && new Date(ev.fim) > inicio);
}
