"use client";
// Mostra a resposta da IA separando a explicação (pra você) da mensagem sugerida (pra mandar)
export function separarSugestao(txt: string): { explicacao: string; mensagem: string | null } {
  const m = /\[MENSAGEM\]([\s\S]*?)(\[\/MENSAGEM\]|$)/i.exec(txt || "");
  if (!m) return { explicacao: txt, mensagem: null };
  const mensagem = m[1].trim().replace(/^["“]|["”]$/g, "");
  const explicacao = (txt.slice(0, m.index) + txt.slice(m.index + m[0].length)).trim();
  return { explicacao, mensagem };
}

export default function BolhaIA({ texto, aoUsar }: { texto: string; aoUsar: (msg: string) => void }) {
  const { explicacao, mensagem } = separarSugestao(texto);
  return <div className="ia-bolha assistant">
    {explicacao && <div style={{ whiteSpace: "pre-wrap" }}>{explicacao.replace(/\*\*/g, "")}</div>}
    {mensagem && <div style={{ marginTop: explicacao ? 8 : 0, background: "#dcf3e4", border: "1px solid #b9e3c7", borderRadius: 8, padding: "7px 9px" }}>
      <div className="small muted" style={{ marginBottom: 3 }}>✍️ Sugestão de mensagem</div>
      <div style={{ whiteSpace: "pre-wrap" }}>{mensagem}</div>
      <button className="mini" style={{ marginTop: 6 }} onClick={() => aoUsar(mensagem)}>Usar esta mensagem</button>
    </div>}
  </div>;
}
