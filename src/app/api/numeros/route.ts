import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { criarInstancia, estado, ligarWebhook, removerInstancia, webhookAtual } from "@/lib/evolution";
import { donoAtual } from "@/lib/contexto";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const urlWebhook = (req: NextRequest) => {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return `https://${host}/api/webhook/evolution?secret=${encodeURIComponent(process.env.WEBHOOK_SECRET || "")}`;
};

// Meus números (com situação da conexão)
export async function GET() {
  if (!(await logado())) return naoAutorizado();
  const { data } = await db().from("numeros").select("instancia,nome,ativo,criado_em").order("criado_em");
  const lista = await Promise.all((data || []).filter((n: any) => n.ativo).map(async (n: any) => {
    const [est, wh] = await Promise.all([estado(n.instancia), webhookAtual(n.instancia)]);
    return { ...n, estado: est, webhook: !!wh?.enabled && String(wh.url).includes("/api/webhook/evolution") };
  }));
  return NextResponse.json({ numeros: lista });
}

// + Adicionar número: cria a instância na Evolution já configurada e ligada nesta Mesa
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { nome } = await req.json().catch(() => ({}));
  const n = String(nome || "").trim();
  if (!n) return NextResponse.json({ erro: "Dê um nome para o número (ex.: Comercial)." }, { status: 400 });
  const dono = donoAtual() || "";
  const slug = (dono.split("@")[0] + "-" + n).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  const instancia = `mesa-${slug}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    await criarInstancia(instancia, urlWebhook(req));
    await db().from("numeros").insert({ instancia, nome: n.slice(0, 40) });
    return NextResponse.json({ ok: true, instancia });
  } catch (e) { return erro(e); }
}

// Renomear / religar webhook
export async function PATCH(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { instancia, nome, religar } = await req.json().catch(() => ({}));
  const { data: meu } = await db().from("numeros").select("instancia").eq("instancia", instancia).maybeSingle();
  if (!meu) return NextResponse.json({ erro: "número não encontrado" }, { status: 404 });
  if (nome) await db().from("numeros").update({ nome: String(nome).trim().slice(0, 40) }).eq("instancia", instancia);
  if (religar) { const r = await ligarWebhook(instancia, urlWebhook(req)); if (!r.ok) return NextResponse.json({ erro: r.detalhe }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}

// Remover (desconecta e apaga na Evolution; as conversas antigas continuam no histórico)
export async function DELETE(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { instancia } = await req.json().catch(() => ({}));
  const { data: meu } = await db().from("numeros").select("instancia").eq("instancia", instancia).maybeSingle();
  if (!meu) return NextResponse.json({ erro: "número não encontrado" }, { status: 404 });
  const apagou = await removerInstancia(instancia);
  await db().from("numeros").update({ ativo: false }).eq("instancia", instancia);
  return NextResponse.json({ ok: true, apagouNaEvolution: apagou });
}
