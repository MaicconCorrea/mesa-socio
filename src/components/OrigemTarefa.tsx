"use client";
import { useState } from "react";

const quando = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// "Ver de onde veio": mostra ali mesmo a mensagem/e-mail/reunião que gerou a tarefa
export default function OrigemTarefa({ id }: { id: string }) {
  const [aberto, setAberto] = useState(false);
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState("");
  function alternar() {
    if (!aberto && !d) fetch(`/api/tarefas/origem?id=${id}`).then(r => r.json()).then(j => j.erro ? setErro(j.erro) : setD(j)).catch(e => setErro(String(e)));
    setAberto(v => !v);
  }
  return <div style={{ width: "100%" }}>
    <button className="linkbtn small" onClick={alternar}>{aberto ? "▲ esconder" : "🔎 Ver de onde veio"}</button>
    {aberto && <div style={{ marginTop: 6, border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", background: "#fafbfe", fontSize: 13 }}>
      {erro && <span className="muted">{erro}</span>}
      {!d && !erro && <span className="muted">Buscando…</span>}
      {d?.tipo === "manual" && <span className="muted">Anotada à mão, sem conversa de origem.</span>}
      {d?.tipo === "conversa" && <>
        <div className="muted small" style={{ marginBottom: 6 }}>{d.conversa.grupo ? "👥 Grupo" : "💬 Conversa"} <b>{d.conversa.nome}</b> · {d.conversa.onde === "Google Chat" ? "🗨️ Google Chat" : `📱 ${d.conversa.onde}`} · <a href={`/whatsapp?c=${d.conversa.id}`}>abrir conversa</a></div>
        <div style={{ display: "grid", gap: 4 }}>
          {d.mensagens.map((m: any) => <div key={m.id} style={{ padding: "5px 8px", borderRadius: 6, background: m.destaque ? "var(--ambar-bg)" : "transparent", borderLeft: m.destaque ? "3px solid var(--laranja)" : "3px solid transparent" }}>
            <span className="small" style={{ fontWeight: 700, color: m.de_mim ? "var(--navy)" : "var(--azul)" }}>{m.de_mim ? "Você" : m.autor || "Contato"}</span>
            <span className="muted small"> · {quando(m.enviada_em)}</span>
            <div style={{ whiteSpace: "pre-wrap" }}>{String(m.texto || "").slice(0, 600)}</div>
          </div>)}
        </div>
      </>}
      {d?.tipo === "email" && <>
        <div className="muted small" style={{ marginBottom: 6 }}>✉️ <b>{d.assunto}</b> · <a href={`/email?thread=${d.threadId}`}>abrir e-mail</a></div>
        {d.mensagens.map((m: any, i: number) => <div key={i} style={{ padding: "5px 0", borderTop: i ? "1px solid var(--line)" : 0 }}>
          <span className="small" style={{ fontWeight: 700 }}>{m.de}</span> <span className="muted small">&lt;{m.deEmail}&gt; · {quando(m.data)}</span>
          <div style={{ whiteSpace: "pre-wrap" }}>{m.texto}</div>
        </div>)}
      </>}
      {d?.tipo === "reuniao" && d.reuniao && <>
        <div className="muted small" style={{ marginBottom: 6 }}>🎙️ <b>{d.reuniao.titulo}</b> · {d.reuniao.data ? quando(d.reuniao.data) : ""} · <a href={`/reunioes?r=${d.reuniao.id}`}>abrir reunião</a></div>
        <div style={{ whiteSpace: "pre-wrap" }}>{d.reuniao.resumo}</div>
      </>}
    </div>}
  </div>;
}
