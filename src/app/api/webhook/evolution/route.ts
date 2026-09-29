// Recebe as mensagens da Evolution (instâncias socio-1200 e socio-3710)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contexto, extrairTexto, nomeDoGrupo, soNumero } from "@/lib/evolution";
import { numeroDoJid } from "@/lib/fmt";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MEU_NOME = /\bmai+c+o+[nm]\b/i; // Maiccon, Maicon, Maicom...

function paraData(ts: any): Date {
  let n = ts;
  if (ts && typeof ts === "object" && "low" in ts) n = ts.low;
  n = Number(n);
  if (!n || isNaN(n)) return new Date();
  return new Date(n < 1e12 ? n * 1000 : n);
}

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, erro: "segredo inválido" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true, ignorado: "json" }); }

  const evento = String(body?.event || "").toLowerCase().replace(/_/g, ".");
  if (!evento.includes("messages.upsert")) return NextResponse.json({ ok: true, ignorado: evento });

  const instancia = String(body.instance || body.instanceName || "desconhecida");
  const meuNumero = soNumero(body.sender); // dono da instância (seu número)
  const lista: any[] = Array.isArray(body.data) ? body.data
    : Array.isArray(body.data?.messages) ? body.data.messages : [body.data];

  const sb = db();
  let gravadas = 0;

  for (const m of lista) {
    const key = m?.key;
    if (!key?.remoteJid || !key?.id) continue;

    let jid: string = key.remoteJid;
    if (jid.endsWith("@lid") && key.remoteJidAlt) jid = key.remoteJidAlt;
    if (jid === "status@broadcast" || jid.endsWith("@broadcast") || jid.endsWith("@newsletter")) continue;

    const texto = extrairTexto(m.message);
    if (!texto) continue;

    const isGrupo = jid.endsWith("@g.us");
    const deMim = !!key.fromMe;
    const quando = paraData(m.messageTimestamp);
    const autor = deMim ? "Maiccon" : (m.pushName || numeroDoJid(key.participant || jid));

    // Foi comigo? (menção, resposta a mensagem minha, ou meu nome no texto)
    const ctx = contexto(m.message, m);
    const meCitou = !deMim && (
      (!!meuNumero && ctx.mencionados.some((j) => soNumero(j) === meuNumero)) ||
      (!!meuNumero && soNumero(ctx.respondeuA) === meuNumero) ||
      MEU_NOME.test(texto)
    );

    // Conversa (cria na primeira mensagem)
    let { data: conv } = await sb.from("conversas").select("id,nome,modo,ultima_msg_em")
      .eq("instancia", instancia).eq("jid", jid).maybeSingle();

    if (!conv) {
      let nome: string | null = null;
      if (isGrupo) nome = await nomeDoGrupo(instancia, jid);
      else if (!deMim && m.pushName) nome = m.pushName;
      const { data: nova } = await sb.from("conversas").upsert({
        instancia, jid, is_grupo: isGrupo, nome: nome || numeroDoJid(jid), modo: isGrupo ? "grupo" : "auto",
      }, { onConflict: "instancia,jid" }).select("id,nome,modo,ultima_msg_em").single();
      conv = nova;
    } else if (!isGrupo && !deMim && m.pushName && conv.nome === numeroDoJid(jid)) {
      await sb.from("conversas").update({ nome: m.pushName }).eq("id", conv.id);
    }
    if (!conv || conv.modo === "ignorada") continue; // ignorada: não guarda nada

    const { error } = await sb.from("mensagens").upsert({
      conversa_id: conv.id, msg_id: key.id, de_mim: deMim, autor, texto: texto.slice(0, 4000),
      enviada_em: quando.toISOString(), me_citou: meCitou,
    }, { onConflict: "conversa_id,msg_id", ignoreDuplicates: true });
    if (error) continue;
    gravadas++;

    const upd: any = {};
    if (conv.modo === "grupo") {
      // Grupo do escritório: IA só entra se falaram comigo ou se eu escrevi
      if (meCitou || deMim) upd.pendente_ia = true;
      upd.sem_retorno = false;          // alguém falou: reavaliar depois
      upd.checar_parado = !deMim;       // se fui eu, não está parado
    } else {
      upd.pendente_ia = true;
    }

    const maisNova = !conv.ultima_msg_em || quando.getTime() >= new Date(conv.ultima_msg_em).getTime();
    if (maisNova) {
      upd.ultima_msg_em = quando.toISOString();
      upd.ultima_msg_de_mim = deMim;
      upd.ultima_msg_texto = (deMim ? "Você: " : (isGrupo ? autor + ": " : "")) + texto.slice(0, 200);
      if (deMim) upd.precisa_resposta = false; // respondeu pelo celular
    }
    await sb.from("conversas").update(upd).eq("id", conv.id);
  }

  return NextResponse.json({ ok: true, gravadas });
}

export async function GET() {
  return NextResponse.json({ ok: true, servico: "webhook evolution · mesa-socio" });
}
