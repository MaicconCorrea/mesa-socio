"use client";
import { useEffect, useState } from "react";
import CorpoEmail from "./CorpoEmail";
import { separarSugestao } from "./BolhaIA";

const hora = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// E-mail aberto por cima da tela (Hoje), com resposta e sugestão da IA
export default function EmailRapido({ threadId, onFechar }: { threadId: string; onFechar: (msg?: string) => void }) {
  const [t, setT] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [para, setPara] = useState("");
  const [cc, setCc] = useState("");
  const [corpo, setCorpo] = useState("");
  const [todos, setTodos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [instrucao, setInstrucao] = useState("");
  const [conta, setConta] = useState("");

  useEffect(() => {
    fetch(`/api/email/thread?id=${threadId}`).then(r => r.json()).then(j => {
      if (j.erro) { setErro(j.erro); return; }
      setT(j); setConta(j.conta || "");
    });
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f);
  }, [threadId]);

  const msgs = t?.mensagens || [];
  const ultimaDeFora = [...msgs].reverse().find((m: any) => m.deEmail !== conta) || msgs[msgs.length - 1];
  useEffect(() => {
    if (!ultimaDeFora) return;
    setPara(ultimaDeFora.deEmail);
    setCc(todos ? [ultimaDeFora.para, ultimaDeFora.cc].join(",").split(",").map((s: string) => s.trim()).filter((s: string) => s && !s.toLowerCase().includes(conta || "@@")).join(", ") : "");
  }, [t, todos, conta]);

  async function sugerir() {
    setPensando(true);
    const pergunta = instrucao.trim() ? `Escreva a resposta deste e-mail assim: ${instrucao}` : "Escreva a minha resposta para este e-mail.";
    const j = await fetch("/api/email/ia", { method: "POST", body: JSON.stringify({ threadId, historico: [], pergunta }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setPensando(false);
    if (j.erro) { setErro(j.erro); return; }
    const { mensagem, explicacao } = separarSugestao(j.resposta);
    setCorpo(mensagem || explicacao);
  }
  async function enviar() {
    setEnviando(true); setErro("");
    const ult = msgs[msgs.length - 1];
    const j = await fetch("/api/email/enviar", { method: "POST", body: JSON.stringify({
      para, cc, corpo, threadId, inReplyTo: ult?.messageId, references: ult?.references,
      assunto: t.assunto.startsWith("Re:") ? t.assunto : `Re: ${t.assunto}`,
    }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setEnviando(false);
    if (j.erro) { setErro(j.erro); return; }
    onFechar("E-mail respondido ✓");
  }

  return (
    <div className="modal-fundo" onClick={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal-caixa" style={{ width: 860, maxWidth: "96vw", maxHeight: "94vh", overflowY: "auto", display: "block" }}>
        {!t ? <p className="muted">{erro || "Abrindo…"}</p> : <>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <b style={{ fontSize: 16, color: "var(--navy)", flex: 1 }}>{t.assunto}</b>
            <a className="botao" href={`/email?thread=${threadId}`}>Abrir no E-mail</a>
            <button className="sec" onClick={() => onFechar()}>✕</button>
          </div>
          {t.controle?.resumo && <div className="trecho" style={{ fontStyle: "normal", marginTop: 8 }}>🤖 {t.controle.resumo}</div>}
          <div style={{ maxHeight: "40vh", overflowY: "auto", marginTop: 8 }}>
            {msgs.slice(-3).map((m: any) => (
              <div key={m.id} className="card" style={{ padding: "8px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><div><b>{m.de}</b> <span className="muted small">&lt;{m.deEmail}&gt;</span></div><span className="muted small">{hora(m.data)}</span></div>
                <div style={{ marginTop: 6 }}><CorpoEmail m={m} /></div>
                {m.anexos?.length > 0 && <div className="small muted">📎 {m.anexos.map((a: any) => a.nome).join(", ")}</div>}
              </div>
            ))}
            {msgs.length > 3 && <p className="muted small">+ {msgs.length - 3} mensagem(ns) anteriores — veja em "Abrir no E-mail".</p>}
          </div>
          <div style={{ borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
              <label>Para<input value={para} onChange={e => setPara(e.target.value)} /></label>
              <label>Cc<input value={cc} onChange={e => setCc(e.target.value)} /></label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 400 }}><input type="checkbox" style={{ width: "auto" }} checked={todos} onChange={e => setTodos(e.target.checked)} /> todos</label>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input value={instrucao} onChange={e => setInstrucao(e.target.value)} placeholder="Como quer responder? (opcional) ex.: agradece e diz que envio sexta" onKeyDown={e => { if (e.key === "Enter") sugerir(); }} />
              <button className="sec" onClick={sugerir} disabled={pensando} style={{ whiteSpace: "nowrap" }}>{pensando ? "Escrevendo…" : "🤖 Escrever com IA"}</button>
            </div>
            <textarea rows={9} value={corpo} onChange={e => setCorpo(e.target.value)} style={{ width: "100%", marginTop: 8 }} placeholder="Sua resposta…" />
            {erro && <div className="aviso erro small">{erro}</div>}
            <div className="acoes" style={{ justifyContent: "flex-end", marginTop: 8 }}>
              <button className="sec" onClick={() => onFechar()}>Cancelar</button>
              <button onClick={enviar} disabled={enviando || !para || !corpo.trim()}>{enviando ? "Enviando…" : "Enviar resposta"}</button>
            </div>
          </div>
        </>}
      </div>
    </div>
  );
}
