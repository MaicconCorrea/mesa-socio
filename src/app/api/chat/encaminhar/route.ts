import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { baixarMidia, conferirNumero, enviarArquivo, enviarAudio, enviarTextoCitando } from "@/lib/evolution";
import { baixarAnexoChat, enviarArquivoChat, enviarChat } from "@/lib/gchat";
import { minhasInstancias } from "@/lib/numeros";
import { registrarEnvio } from "@/lib/envio";
import { numeroDoJid } from "@/lib/fmt";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 60;
const semMarcador = (t?: string | null) => (t || "").replace(/^\[(imagem|vídeo|áudio|documento[^\]]*)\]\s*/, "").trim();

// Encaminhar mensagens selecionadas para outra conversa (WhatsApp ou Google Chat) ou para um número novo
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { mensagemIds, destinoId, numero, instancia } = await req.json().catch(() => ({}));
  const ids: string[] = (Array.isArray(mensagemIds) ? mensagemIds : []).slice(0, 20);
  if (!ids.length) return NextResponse.json({ erro: "selecione as mensagens" }, { status: 400 });
  const sb = db();
  try {
    // destino: conversa existente ou número novo
    let d: any = null;
    if (destinoId) d = (await sb.from("conversas").select("*").eq("id", destinoId).maybeSingle()).data;
    else if (numero) {
      if (!(await minhasInstancias()).includes(instancia)) return NextResponse.json({ erro: "escolha por qual número enviar" }, { status: 400 });
      let n = String(numero).replace(/\D/g, ""); if (n.length === 10 || n.length === 11) n = "55" + n;
      const jid = await conferirNumero(instancia, n);
      if (!jid) return NextResponse.json({ erro: "esse número não tem WhatsApp" }, { status: 400 });
      d = (await sb.from("conversas").select("*").eq("instancia", instancia).eq("jid", jid).maybeSingle()).data
        || (await sb.from("conversas").insert({ instancia, jid, is_grupo: false, modo: "auto", nome: numeroDoJid(jid) }).select("*").single()).data;
    }
    if (!d) return NextResponse.json({ erro: "escolha para onde encaminhar" }, { status: 400 });

    const { data: ms } = await sb.from("mensagens").select("id,msg_id,texto,tipo,tem_midia,midia_mime,midia_nome,midia_ref,apagada,conversa_id,enviada_em").in("id", ids).order("enviada_em");
    let enviadas = 0; const falhas: string[] = [];
    for (const m of ms || []) {
      if (m.apagada) continue;
      try {
        if (m.tem_midia) {
          const { data: orig } = await sb.from("conversas").select("instancia").eq("id", m.conversa_id).single();
          const arq: any = m.midia_ref ? await baixarAnexoChat(m.midia_ref) : await baixarMidia(orig?.instancia || "", m.msg_id);
          if (!arq) { falhas.push(`${m.midia_nome || "arquivo"} (indisponível)`); continue; }
          const mime = m.midia_mime || arq.mime || "application/octet-stream";
          const nome = m.midia_nome || arq.nome || (m.tipo === "imagem" ? "imagem.jpg" : m.tipo === "audio" ? "audio.ogg" : "arquivo");
          const legenda = semMarcador(m.texto);
          if (d.instancia === "gchat") {
            const r = await enviarArquivoChat(d.jid, { bytes: arq.bytes, mime, nome, legenda });
            await registrarEnvio(sb, d, { msg_id: r.id, texto: m.texto, tipo: m.tipo, mime, nome, midia_ref: r.ref });
          } else if (m.tipo === "audio") {
            const r = await enviarAudio(d.instancia, d.jid, Buffer.from(arq.bytes).toString("base64"));
            await registrarEnvio(sb, d, { msg_id: r.id, texto: "[áudio]", tipo: "audio", mime });
          } else {
            const r = await enviarArquivo(d.instancia, d.jid, { base64: Buffer.from(arq.bytes).toString("base64"), mime, nome, legenda });
            await registrarEnvio(sb, d, { msg_id: r.id, texto: m.texto, tipo: m.tipo, mime, nome });
          }
        } else {
          const t = String(m.texto || "").trim(); if (!t) continue;
          const r = d.instancia === "gchat" ? await enviarChat(d.jid, t) : await enviarTextoCitando(d.instancia, d.jid, t, null);
          await registrarEnvio(sb, d, { msg_id: r.id, texto: t, tipo: "texto" });
        }
        enviadas++;
      } catch (e: any) { falhas.push(String(e?.message || e).slice(0, 120)); }
    }
    return NextResponse.json({ ok: true, enviadas, falhas, destino: { id: d.id, nome: d.nome } });
  } catch (e) { return erro(e); }
}
