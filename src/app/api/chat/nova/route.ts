import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conferirNumero, enviarTextoCitando } from "@/lib/evolution";
import { minhasInstancias } from "@/lib/numeros";
import { registrarEnvio } from "@/lib/envio";
import { numeroDoJid } from "@/lib/fmt";
import { erro, logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 30;

// Começa conversa com um número novo
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { instancia, numero, nome, texto } = await req.json().catch(() => ({}));
  if (!(await minhasInstancias()).includes(instancia)) return NextResponse.json({ erro: "escolha o número (conexão)" }, { status: 400 });
  let n = String(numero || "").replace(/\D/g, "");
  if (n.length === 10 || n.length === 11) n = "55" + n; // digitou só DDD + número
  if (n.length < 12) return NextResponse.json({ erro: "número inválido — use DDD + número" }, { status: 400 });
  try {
    const jid = await conferirNumero(instancia, n);
    if (!jid) return NextResponse.json({ erro: "esse número não tem WhatsApp" }, { status: 400 });
    const sb = db();
    const { data: ja } = await sb.from("conversas").select("*").eq("instancia", instancia).eq("jid", jid).maybeSingle();
    let c = ja;
    if (!c) {
      const { data: nova } = await sb.from("conversas").insert({
        instancia, jid, is_grupo: false, modo: "auto", nome: String(nome || "").trim() || numeroDoJid(jid),
      }).select("*").single();
      c = nova;
    }
    const t = String(texto || "").trim();
    if (t) {
      const r = await enviarTextoCitando(instancia, jid, t, null);
      await registrarEnvio(sb, c, { msg_id: r.id, texto: t, tipo: "texto" });
    }
    return NextResponse.json({ ok: true, id: c.id });
  } catch (e) { return erro(e); }
}
