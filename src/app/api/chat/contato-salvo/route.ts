import { NextResponse } from "next/server";
import { estaSalvo } from "@/lib/contatos";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// O número desta conversa está salvo (Google Contatos ou criado na Mesa)?
export async function GET(req: Request) {
  if (!(await logado())) return naoAutorizado();
  const jid = new URL(req.url).searchParams.get("jid") || "";
  if (!jid || !jid.endsWith("@s.whatsapp.net")) return NextResponse.json({ salvo: true }); // grupo, Google Chat, LID
  try { return NextResponse.json({ salvo: await estaSalvo(jid.split("@")[0]) }); }
  catch { return NextResponse.json({ salvo: true }); }
}
