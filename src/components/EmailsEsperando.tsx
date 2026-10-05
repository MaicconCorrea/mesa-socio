"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import EmailRapido from "./EmailRapido";
import TarefaDeEmail from "./TarefaDeEmail";
import ResolverEspera from "./ResolverEspera";
import Destaque from "./Destaque";
import { dataHora } from "@/lib/fmt";

const ha = (s: string) => { const m = Math.round((Date.now() - new Date(s).getTime()) / 60000); return m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} dia(s)`; };

// Situação do e-mail na Mesa (usada no resultado da pesquisa)
function situacao(e: any): { txt: string; cls: string } {
  if (e.fonte === "gmail" || !e.status) return { txt: "no Gmail", cls: "outra" };
  if (e.status === "nova") return e.esperando ? { txt: "esperando você", cls: "aberta" } : { txt: "na caixa", cls: "outra" };
  if (e.status === "tratada") return { txt: "✓ resolvido", cls: "feita" };
  if (e.status === "ignorada") return { txt: "ignorado", cls: "descartada" };
  return { txt: e.status, cls: "outra" };
}

// Lista "E-mails esperando você" da tela Hoje, com ações rápidas.
// Com `busca`, vira o resultado da pesquisa: destaca o termo, mostra situação e data e não some com o cartão
// depois da ação (chama aoMudar para pesquisar de novo).
export default function EmailsEsperando({ emails, busca, aoMudar, vazio }: {
  emails: any[]; busca?: string; aoMudar?: () => void; vazio?: string;
}) {
  const [lista, setLista] = useState(emails);
  const [aberto, setAberto] = useState<string | null>(null);
  const [tarefa, setTarefa] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const [rascunho, setRascunho] = useState("");
  const router = useRouter();
  useEffect(() => { setLista(emails); }, [emails]);
  const tirar = (id: string) => { if (!busca) setLista(l => l.filter(x => x.thread_id !== id)); };
  async function acao(id: string, a: string) {
    if (a !== "lido") tirar(id);
    await fetch("/api/email/acao", { method: "POST", body: JSON.stringify({ threadId: id, acao: a }) });
    if (a === "lido") setAviso("Marcado como lido no Gmail ✓");
    router.refresh();
    aoMudar?.();
  }
  const D = (s?: string | null) => (busca ? <Destaque texto={s} termo={busca} /> : s);
  if (!lista.length) return <div className="vazio">{vazio || "Nenhum e-mail esperando. 🎉"}</div>;
  return <>
    {aviso && <div className="aviso small">{aviso}</div>}
    {lista.map(e => {
      const sit = busca ? situacao(e) : null;
      const texto = e.resumo || (busca ? e.snippet : null);
      return (
      <div className="card" key={e.thread_id}>
        {sit ? <div className="linha"><span className={`bm-sit bm-sit-${sit.cls}`}>{sit.txt}</span>
          <a className="titulo" href="#" onClick={ev => { ev.preventDefault(); setRascunho(""); setAberto(e.thread_id); }}>{D(e.assunto || "(sem assunto)")}</a></div>
          : <a className="titulo" href="#" onClick={ev => { ev.preventDefault(); setRascunho(""); setAberto(e.thread_id); }}>{e.assunto}</a>}
        <div className="meta">{D(e.de || e.de_email)}{busca && e.de_email && e.de && e.de !== e.de_email ? <> &lt;{D(e.de_email)}&gt;</> : null} · {busca ? dataHora(e.recebido_em) : ha(e.recebido_em)}</div>
        {texto ? <div className="trecho" style={{ fontStyle: "normal", ...(String(texto).includes("⚠️") ? { background: "var(--erro-fundo)", color: "var(--erro)" } : {}) }}>{e.resumo ? "🤖 " : ""}{D(texto)}</div> : null}
        <div className="acoes">
          <button className="ok" onClick={() => { setRascunho(""); setAberto(e.thread_id); }}>↩ Responder</button>
          <ResolverEspera tipo="email" id={e.thread_id}
            onUsarEmail={(txt) => { setRascunho(txt); setAberto(e.thread_id); }}
            onGerarTarefa={() => setTarefa(e.thread_id)} />
          <button className="sec" onClick={() => setTarefa(e.thread_id)} title="Vira tarefa com prazo">📌 Gerar tarefa</button>
          {busca && (e.status === "tratada" || e.status === "ignorada")
            ? <button className="sec" onClick={() => acao(e.thread_id, "reabrir")} title="Volta para a caixa da Mesa">↺ Reabrir</button>
            : <>
              <button className="sec" onClick={() => acao(e.thread_id, "resolvido")} title="Tira da lista e marca como lido">✓ Resolvido</button>
              <button className="sec" onClick={() => acao(e.thread_id, "lido")} title="Marca como lido no Gmail (continua na lista)">Lido</button>
              <button className="perigo" onClick={() => acao(e.thread_id, "ignorar")} title="Não precisa de resposta">Ignorar</button>
            </>}
        </div>
      </div>
      );
    })}
    {tarefa && <TarefaDeEmail threadId={tarefa} onFechar={(m) => { if (m) { setAviso(m); tirar(tarefa); router.refresh(); aoMudar?.(); } setTarefa(null); }} />}
    {aberto && <EmailRapido threadId={aberto} rascunho={rascunho} onFechar={(m) => { if (m) { tirar(aberto); setAviso(m); router.refresh(); aoMudar?.(); } setAberto(null); }} />}
  </>;
}
