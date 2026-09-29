import { NextRequest, NextResponse } from "next/server";
import { conflitos, criarEvento } from "@/lib/agenda";
import { logado, naoAutorizado } from "@/lib/api";

// { titulo, data: "AAAA-MM-DD", hora: "HH:MM", duracao (min), convidados: "a@x, b@y", comMeet, descricao, forcar }
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const b = await req.json().catch(() => ({}));
  if (!b.titulo || !b.data || !b.hora) return NextResponse.json({ erro: "Preencha título, dia e hora." }, { status: 400 });
  const ini = new Date(`${b.data}T${b.hora}:00-03:00`);
  const fim = new Date(ini.getTime() + (Number(b.duracao) || 30) * 60000);
  try {
    if (!b.forcar) {
      const bate = await conflitos(ini, fim);
      if (bate.length) return NextResponse.json({ conflito: bate.map(e => ({ titulo: e.titulo, inicio: e.inicio, fim: e.fim })) });
    }
    const convidados = String(b.convidados || "").split(/[,;\s]+/).map((s: string) => s.trim()).filter((s: string) => s.includes("@"));
    const ev = await criarEvento({ titulo: b.titulo, inicio: ini.toISOString(), fim: fim.toISOString(), descricao: b.descricao, convidados, comMeet: !!b.comMeet });
    return NextResponse.json({ ok: true, evento: ev });
  } catch (e: any) { return NextResponse.json({ erro: String(e.message ?? e) }, { status: 500 }); }
}
