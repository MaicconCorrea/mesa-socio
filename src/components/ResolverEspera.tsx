"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Md from "./Md";
import { separarSugestao } from "./BolhaIA";
import { jaRespondi } from "@/app/actions";

// "Resolver com IA" nos cartões de quem está esperando resposta (e-mail ou conversa) da tela Hoje.
// Usa as mesmas rotas de IA das telas de E-mail (/api/email/ia) e WhatsApp (/api/chat/ia) — só chama ao clicar.
const PERGUNTA = `Me ajude a resolver isto agora. Responda neste formato:
**Resumo:** o que a pessoa quer, há quanto tempo está esperando e o que já foi dito (até 3 frases).
**O que fazer:** a solução sugerida para mim, em 1 a 3 passos curtos.
Depois coloque o rascunho da resposta pronta para mandar entre [MENSAGEM] e [/MENSAGEM].`;

export default function ResolverEspera({ tipo, id, onUsarEmail, onGerarTarefa }: {
  tipo: "email" | "conversa"; id: string;
  onUsarEmail?: (rascunho: string) => void; // e-mail: abre o responder já preenchido
  onGerarTarefa?: () => void;               // e-mail: janela "Gerar tarefa" que já existe
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState("");
  const [analise, setAnalise] = useState("");
  const [rascunho, setRascunho] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function pensar() {
    setPensando(true); setErro(""); setAviso("");
    try {
      const url = tipo === "email" ? "/api/email/ia" : "/api/chat/ia";
      const corpo = tipo === "email" ? { threadId: id, historico: [], pergunta: PERGUNTA } : { id, historico: [], pergunta: PERGUNTA };
      const r = await fetch(url, { method: "POST", body: JSON.stringify(corpo) });
      const j = await r.json().catch(() => ({ erro: `${r.status} ${r.statusText}` }));
      if (j.erro || !j.resposta) throw new Error(j.erro || "a IA não respondeu");
      const { explicacao, mensagem } = separarSugestao(j.resposta);
      setAnalise(explicacao); setRascunho(mensagem || "");
    } catch (e: any) {
      const msg = String(e?.message || e);
      setErro("Não consegui falar com a IA agora" + (msg.includes("504") || msg.includes("timeout") ? " (demorou demais)" : "") + ". Tente de novo em instantes.");
    } finally { setPensando(false); }
  }
  function alternar() {
    if (!aberto && !analise && !pensando) pensar();
    setAberto(v => !v);
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(rascunho); setAviso("Resposta copiada."); }
    catch { setAviso("Não deu para copiar — selecione o texto e copie à mão."); }
  }
  async function gerarTarefa() {
    if (onGerarTarefa) { onGerarTarefa(); return; }
    setOcupado(true); setAviso("");
    const j = await fetch("/api/chat/analisar", { method: "POST", body: JSON.stringify({ id }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setOcupado(false);
    setAviso(j.erro ? "Não gerou a tarefa: " + j.erro : j.criadas ? `IA criou ${j.criadas} tarefa(s).` : "IA analisou: nenhuma tarefa nova.");
    if (!j.erro) router.refresh();
  }
  async function respondido() {
    setOcupado(true);
    const fd = new FormData(); fd.set("id", id);
    try { await jaRespondi(fd); router.refresh(); } catch (e: any) { setAviso("Não marcou: " + (e?.message || e)); }
    finally { setOcupado(false); }
  }

  return <>
    <button type="button" className="sec" onClick={alternar} aria-expanded={aberto}>{aberto ? "Fechar IA" : "Resolver com IA"}</button>
    {aberto && <div className="hk-ia" role="region" aria-label="Resolver com IA">
      {pensando && <p className="muted small" style={{ margin: 0 }} role="status">Pensando…</p>}
      {erro && <div className="aviso erro small" style={{ margin: 0 }}>{erro} <button type="button" className="linkbtn" onClick={pensar}>tentar de novo</button></div>}
      {!pensando && !erro && analise && <Md texto={analise} />}
      {!pensando && !erro && rascunho && <div className="hk-ia-rascunho">
        <div className="small muted" style={{ marginBottom: 4 }}>Rascunho da resposta</div>
        <textarea rows={5} value={rascunho} onChange={e => setRascunho(e.target.value)} aria-label="Rascunho da resposta" />
      </div>}
      {!pensando && !erro && (analise || rascunho) && <div className="acoes">
        {tipo === "email"
          ? <button type="button" onClick={() => onUsarEmail?.(rascunho)} disabled={!rascunho.trim()}>Usar resposta</button>
          : <>
            <button type="button" onClick={copiar} disabled={!rascunho.trim()}>Copiar resposta</button>
            <a className="btn sec" href={`/whatsapp?c=${id}`} style={{ textDecoration: "none" }}>Abrir conversa</a>
          </>}
        <button type="button" className="sec" onClick={gerarTarefa} disabled={ocupado}>Gerar tarefa</button>
        {tipo === "conversa" && <button type="button" className="ok" onClick={respondido} disabled={ocupado}>Já respondi</button>}
        <button type="button" className="linkbtn" onClick={pensar}>pensar de novo</button>
      </div>}
      {aviso && <div className="small muted" role="status">{aviso}</div>}
    </div>}
  </>;
}
