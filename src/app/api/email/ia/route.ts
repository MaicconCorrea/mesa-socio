import { NextRequest, NextResponse } from "next/server";
import { personalizar } from "@/lib/socios";
import { lerThread, textoDaThread } from "@/lib/gmail";
import { minhaConta } from "@/lib/google";
import { agoraTexto } from "@/lib/fmt";
import { logado, naoAutorizado } from "@/lib/api";

export const maxDuration = 60;

// Conversar com a IA sobre um e-mail ("o que ele quer?", "escreve a resposta")
export async function POST(req: NextRequest) {
  if (!(await logado())) return naoAutorizado();
  const { threadId, historico, pergunta } = await req.json().catch(() => ({}));
  try {
    const t = await lerThread(minhaConta(), threadId);
    const sistema = await personalizar(`Você é o secretário pessoal do Maiccon, sócio da Outtax (escritório de contabilidade no RJ). Responda em português, direto.
E-mail sugerido: só o corpo, cordial e objetivo, assinado "Maiccon Correa — Outtax".
Formato da sua resposta:
- Primeiro, se ajudar, uma explicação curta PARA O MAICCON (máx. 3 frases).
- Quando fizer sentido sugerir uma mensagem para ele mandar, coloque SÓ o corpo do e-mail entre [MENSAGEM] e [/MENSAGEM].
- A mensagem é escrita em primeira pessoa, como se fosse o Maiccon digitando: natural, sem asteriscos, sem aspas, sem itálico, sem "Olá, sou…". Nada de explicação dentro da mensagem.
- Em assunto técnico (imposto, prazo, valor), não afirme números ou limites que você não tem certeza; prefira "vou confirmar e te retorno".
Agora: ${agoraTexto()}.
E-mail (assunto: ${t.assunto}):
${textoDaThread(t).slice(-16000)}`);
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6", max_tokens: 1500, system: sistema,
        messages: [...(Array.isArray(historico) ? historico.slice(-10) : []), { role: "user", content: String(pergunta || "") }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
    return NextResponse.json({ resposta: (j.content || []).map((c: any) => c.text || "").join("").trim() });
  } catch (e: any) { return NextResponse.json({ erro: String(e.message ?? e) }, { status: 500 }); }
}
