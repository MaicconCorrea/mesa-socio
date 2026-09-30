import { NextRequest, NextResponse } from "next/server";
import { montar, semAcento, soDigitos } from "@/lib/contatos";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const { lista, google } = await montar();
  const t = semAcento(q), d = soDigitos(q);
  const achados = lista.filter(c => !q || (d.length >= 3 && c.numero.includes(d)) || (t.length >= 2 && semAcento(c.nome).includes(t)))
    .sort((a, b) => (b.conversas.length - a.conversas.length) || (Number(!!b.nome) - Number(!!a.nome)) || a.nome.localeCompare(b.nome))
    .slice(0, 40);
  return NextResponse.json({ contatos: achados, total: lista.length, google });
}
