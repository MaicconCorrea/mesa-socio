"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import EmailRapido from "./EmailRapido";

const ha = (s: string) => { const m = Math.round((Date.now() - new Date(s).getTime()) / 60000); return m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} dia(s)`; };

// Lista "E-mails esperando você" da tela Hoje, com ações rápidas
export default function EmailsEsperando({ emails }: { emails: any[] }) {
  const [lista, setLista] = useState(emails);
  const [aberto, setAberto] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const router = useRouter();
  async function acao(id: string, a: string) {
    if (a !== "lido") setLista(l => l.filter(e => e.thread_id !== id));
    await fetch("/api/email/acao", { method: "POST", body: JSON.stringify({ threadId: id, acao: a }) });
    if (a === "lido") setAviso("Marcado como lido no Gmail ✓");
    router.refresh();
  }
  if (!lista.length) return <div className="vazio">Nenhum e-mail esperando. 🎉</div>;
  return <>
    {aviso && <div className="aviso small">{aviso}</div>}
    {lista.map(e => (
      <div className="card" key={e.thread_id}>
        <a className="titulo" href="#" onClick={ev => { ev.preventDefault(); setAberto(e.thread_id); }}>{e.assunto}</a>
        <div className="meta">{e.de} · {ha(e.recebido_em)}</div>
        {e.resumo ? <div className="trecho" style={{ fontStyle: "normal", ...(e.resumo.includes("⚠️") ? { background: "#fdecec", color: "var(--vermelho)" } : {}) }}>🤖 {e.resumo}</div> : null}
        <div className="acoes">
          <button className="ok" onClick={() => setAberto(e.thread_id)}>↩ Responder</button>
          <button className="sec" onClick={() => acao(e.thread_id, "resolvido")} title="Tira da lista e marca como lido">✓ Resolvido</button>
          <button className="sec" onClick={() => acao(e.thread_id, "lido")} title="Marca como lido no Gmail (continua na lista)">Lido</button>
          <button className="perigo" onClick={() => acao(e.thread_id, "ignorar")} title="Não precisa de resposta">Ignorar</button>
        </div>
      </div>
    ))}
    {aberto && <EmailRapido threadId={aberto} onFechar={(m) => { if (m) { setLista(l => l.filter(x => x.thread_id !== aberto)); setAviso(m); router.refresh(); } setAberto(null); }} />}
  </>;
}
