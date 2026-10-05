// Conversa com a IA guardada no banco (por item e por sócio) — lado do navegador.
// Se o SQL 024 não rodou ou a rede falhar, tudo vira "não salvou" em silêncio: a tela continua só na memória.
export type TipoItemIA = "chat" | "email" | "tarefa";
export type MsgIA = { role: "user" | "assistant"; content: string };
type Guardada = { papel: "eu" | "ia"; texto: string; tipo?: "sugestao" | "analise" | "texto"; em?: string };

const URL_API = "/api/ia/conversa";

export async function carregarConversaIA(tipo: TipoItemIA, ref: string): Promise<MsgIA[] | null> {
  try {
    const j = await fetch(`${URL_API}?tipo=${tipo}&ref=${encodeURIComponent(ref)}`, { cache: "no-store" }).then(r => r.json());
    if (!j?.salvo || !Array.isArray(j.mensagens)) return null;
    return (j.mensagens as Guardada[]).filter(m => m && typeof m.texto === "string")
      .map(m => ({ role: m.papel === "eu" ? "user" : "assistant", content: m.texto }));
  } catch { return null; }
}

// guarda a pergunta e a resposta da IA (as duas de uma vez, quando a resposta chega)
export function guardarParIA(tipo: TipoItemIA, ref: string, pergunta: string, resposta: string, analise = false) {
  const tipoResp = /\[MENSAGEM\]|\[DOCUMENTO/i.test(resposta) ? "sugestao" : analise ? "analise" : "texto";
  const mensagens: Guardada[] = [{ papel: "eu", texto: pergunta, tipo: "texto" }, { papel: "ia", texto: resposta, tipo: tipoResp }];
  fetch(URL_API, { method: "POST", body: JSON.stringify({ tipo, ref, mensagens }) }).catch(() => {});
}

export async function apagarConversaIA(tipo: TipoItemIA, ref: string) {
  await fetch(URL_API, { method: "DELETE", body: JSON.stringify({ tipo, ref }) }).catch(() => {});
}
