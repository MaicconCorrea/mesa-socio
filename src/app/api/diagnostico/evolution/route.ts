// Diagnóstico: o que a Evolution guardou por último em cada número meu (sem o texto)
import { NextResponse } from "next/server";
import { meusNumeros } from "@/lib/numeros";
import { ultimasMensagens } from "@/lib/evolution";
import { logado, naoAutorizado } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await logado())) return naoAutorizado();
  const out: any[] = [];
  for (const n of await meusNumeros()) {
    const ms = await ultimasMensagens(n.instancia, 12);
    out.push({ numero: n.nome, instancia: n.instancia, mensagens: ms.map((m: any) => ({
      quando: new Date(Number(typeof m.messageTimestamp === "object" ? m.messageTimestamp?.low : m.messageTimestamp) * 1000).toISOString(),
      deMim: !!m.key?.fromMe, remoteJid: m.key?.remoteJid, alternativo: m.key?.remoteJidAlt || m.key?.senderPn || "", tipo: m.messageType || Object.keys(m.message || {})[0] || "?",
    })) });
  }
  return NextResponse.json(out);
}
