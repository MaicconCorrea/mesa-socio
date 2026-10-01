"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import MandarSetor from "@/components/MandarSetor";
import BolhaIA from "@/components/BolhaIA";
import CorpoEmail from "@/components/CorpoEmail";
import TarefaDeEmail from "@/components/TarefaDeEmail";

type Th = { id: string; assunto: string; de: string; deEmail: string; quando: string; snippet: string; naoLido: boolean; temAnexo: boolean; mensagens: number; ultimaMinha: boolean; automatico: boolean;
  controle: { status: string; resumo: string | null; esperando: boolean } | null };
type Anexo = { msgId: string; attId: string; nome: string; mime: string; tamanho: number };
type Msg = { id: string; de: string; deEmail: string; para: string; cc: string; data: string; assunto: string; html: string | null; texto: string | null; anexos: Anexo[]; messageId: string; references: string };

const FILTROS: [string, string][] = [["esperando", "⏳ Esperando resposta"], ["entrada", "Caixa de entrada"], ["naolidos", "Não lidos"], ["anexos", "Com anexo"], ["enviados", "Enviados"], ["todos", "Todos"]];
const hora = (s: string) => { const d = new Date(s); const hoje = new Date().toDateString() === d.toDateString();
  return d.toLocaleString("pt-BR", hoje ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); };
const kb = (n: number) => n > 1048576 ? `${(n / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const linkAnexo = (a: Anexo, baixar = false) => `/api/email/anexo?msg=${a.msgId}&att=${encodeURIComponent(a.attId)}&nome=${encodeURIComponent(a.nome)}&mime=${encodeURIComponent(a.mime)}${baixar ? "&baixar=1" : ""}`;
const MAX = 3 * 1024 * 1024;
function lerBase64(f: Blob): Promise<string> { return new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = () => falha(r.error); r.readAsDataURL(f); }); }

export default function EmailApp() {
  const [ativo, setAtivo] = useState<boolean | null>(null);
  const [conta, setConta] = useState("");
  const [filtro, setFiltro] = useState("esperando");
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<Th[]>([]);
  const [esperando, setEsperando] = useState(0);
  const [proxima, setProxima] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState<{ id: string; assunto: string; mensagens: Msg[]; controle: any; tarefas: any[] } | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [aviso, setAviso] = useState("");
  const [resp, setResp] = useState<{ para: string; cc: string; corpo: string } | null>(null);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [anexosFw, setAnexosFw] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [novo, setNovo] = useState<{ para: string; cc: string; assunto: string; corpo: string } | null>(null);
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [pensando, setPensando] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [visor, setVisor] = useState<Anexo | null>(null);
  const [mostrarIA, setMostrarIA] = useState(false);
  const [setor, setSetor] = useState(false);
  const [tarefaAberta, setTarefaAberta] = useState(false);
  const [viewMobile, setViewMobile] = useState<"atendentes" | "lista" | "conversa">("lista");
  const inputArq = useRef<HTMLInputElement | null>(null);

  async function carregar(f = filtro, pagina?: string) {
    setCarregando(true); setErro("");
    try {
      const j = await fetch(`/api/email/lista?filtro=${f}&q=${encodeURIComponent(busca)}${pagina ? `&pagina=${pagina}` : ""}`).then(r => r.json());
      setAtivo(j.ativo !== false); if (j.ativo === false) return;
      if (j.conta) setConta(j.conta);
      if (j.erro) throw new Error(j.erro);
      setLista(l => pagina ? [...l, ...j.threads] : j.threads); setEsperando(j.esperando || 0); setProxima(j.proxima || null);
    } catch (e: any) { setErro(e.message); } finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); const t = new URLSearchParams(location.search).get("thread"); if (t) abrir(t); }, []);
  useEffect(() => { const id = setInterval(() => { if (!document.hidden && !resp && !novo) carregar(); }, 90000); return () => clearInterval(id); }, [filtro, busca, resp, novo]);
  useEffect(() => {
    if (!visor) return;
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") setVisor(null); };
    window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f);
  }, [visor]);

  async function abrir(id: string) {
    setAbrindo(true); setAviso(""); setResp(null); setChat([]); setArquivos([]); setAnexosFw(new Set()); setViewMobile("conversa");
    try {
      const j = await fetch(`/api/email/thread?id=${id}`).then(r => r.json());
      if (j.erro) throw new Error(j.erro);
      setAberta(j); setLista(l => l.map(t => t.id === id ? { ...t, naoLido: false } : t));
    } catch (e: any) { setAviso(e.message); } finally { setAbrindo(false); }
  }
  async function acao(acao: string) {
    if (!aberta) return;
    const j = await fetch("/api/email/acao", { method: "POST", body: JSON.stringify({ threadId: aberta.id, acao }) }).then(r => r.json());
    if (j.erro) { setAviso(j.erro); return; }
    setAviso({ resolvido: "Marcado como resolvido.", arquivar: "Arquivado.", ignorar: "Não vai mais aparecer em esperando resposta.", reabrir: "Voltou para esperando resposta.", nao_lido: "Marcado como não lido." }[acao] || "Feito.");
    if (["resolvido", "arquivar", "ignorar"].includes(acao) && filtro === "esperando") setLista(l => l.filter(t => t.id !== aberta.id));
    carregar();
  }
  const ultimaDeFora = useMemo(() => aberta ? [...aberta.mensagens].reverse().find(m => m.deEmail !== conta) ?? aberta.mensagens[aberta.mensagens.length - 1] : null, [aberta, conta]);
  function responder(todos = false) {
    if (!aberta || !ultimaDeFora) return;
    const ccs = todos ? [ultimaDeFora.para, ultimaDeFora.cc].join(",").split(",").map(s => s.trim()).filter(s => s && !s.toLowerCase().includes(conta)) : [];
    setResp({ para: ultimaDeFora.deEmail, cc: ccs.join(", "), corpo: "" });
  }
  async function enviar(dados: { para: string; cc: string; assunto: string; corpo: string }, resposta: boolean) {
    setEnviando(true); setAviso("");
    try {
      const grandes = arquivos.filter(f => f.size > MAX);
      if (grandes.length) throw new Error(`"${grandes[0].name}" passa de 3 MB.`);
      const arqs = await Promise.all(arquivos.map(async f => ({ nome: f.name, mime: f.type || "application/octet-stream", base64: await lerBase64(f) })));
      const ult = aberta?.mensagens[aberta.mensagens.length - 1];
      const corpoReq: any = { ...dados, arquivos: arqs, anexosEmail: Array.from(anexosFw) };
      if (resposta && aberta && ult) Object.assign(corpoReq, { threadId: aberta.id, inReplyTo: ult.messageId, references: ult.references, assunto: aberta.assunto.startsWith("Re:") ? aberta.assunto : `Re: ${aberta.assunto}` });
      const j = await fetch("/api/email/enviar", { method: "POST", body: JSON.stringify(corpoReq) }).then(r => r.json());
      if (j.erro) throw new Error(j.erro);
      setAviso("E-mail enviado ✓"); setResp(null); setNovo(null); setArquivos([]); setAnexosFw(new Set());
      if (resposta && aberta) abrir(aberta.id);
      carregar();
    } catch (e: any) { setAviso("Não enviou: " + e.message); } finally { setEnviando(false); }
  }
  async function perguntar(p = pergunta) {
    const q = p.trim(); if (!q || !aberta) return;
    const hist = chat; setChat([...hist, { role: "user", content: q }]); setPergunta(""); setPensando(true); setMostrarIA(true);
    const j = await fetch("/api/email/ia", { method: "POST", body: JSON.stringify({ threadId: aberta.id, historico: hist, pergunta: q }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setPensando(false); setChat(c => [...c, { role: "assistant", content: j.erro ? "⚠️ " + j.erro : j.resposta }]);
  }
  async function analisar() {
    if (!aberta) return;
    setAnalisando(true);
    const j = await fetch("/api/email/analisar", { method: "POST", body: JSON.stringify({ threadId: aberta.id }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setAnalisando(false);
    setAviso(j.erro ? "IA: " + j.erro : j.criadas ? `IA criou ${j.criadas} tarefa(s).` : "IA: nenhuma tarefa nova.");
    abrir(aberta.id);
  }
  async function acaoTarefa(id: string, a: "feita" | "descartada") {
    await fetch("/api/tarefas/acao", { method: "POST", body: JSON.stringify({ id, acao: a }) });
    setAberta(x => x ? { ...x, tarefas: x.tarefas.filter(t => t.id !== id) } : x);
  }
  async function sincronizar() {
    setCarregando(true); setAviso("Sincronizando e analisando os e-mails dos últimos 3 dias…");
    const j = await fetch("/api/email/sync", { method: "POST" }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setAviso(j.erro ? "Erro: " + j.erro : `${j.threads} conversas conferidas · ${j.analisados} analisadas pela IA · ${j.tarefas} tarefa(s) nova(s).`);
    carregar();
  }

  if (ativo === false) return <><h1>E-mail</h1><div className="aviso erro">Falta a variável <b>GOOGLE_SERVICE_ACCOUNT_JSON</b> na Vercel (copie do projeto do Painel DP). Veja em Configuração.</div></>;

  const Compositor = ({ dados, set, resposta }: { dados: any; set: (d: any) => void; resposta: boolean }) => (
    <div className="card" style={{ marginTop: 10 }}>
      {!resposta && <label>Para<input value={dados.para} onChange={e => set({ ...dados, para: e.target.value })} placeholder="email@cliente.com.br" /></label>}
      {resposta && <div className="small muted">Para: <input value={dados.para} onChange={e => set({ ...dados, para: e.target.value })} style={{ display: "inline-block", width: "70%" }} /></div>}
      <label style={{ marginTop: 6 }}>Cc<input value={dados.cc} onChange={e => set({ ...dados, cc: e.target.value })} /></label>
      {!resposta && <label style={{ marginTop: 6 }}>Assunto<input value={dados.assunto} onChange={e => set({ ...dados, assunto: e.target.value })} /></label>}
      <textarea value={dados.corpo} onChange={e => set({ ...dados, corpo: e.target.value })} rows={8} style={{ marginTop: 8, width: "100%" }} placeholder="Escreva aqui… (ou peça pra IA escrever no painel ao lado)" autoFocus />
      <div className="acoes" style={{ marginTop: 6, alignItems: "center" }}>
        <button type="button" className="sec" onClick={() => inputArq.current?.click()}>📎 Anexar</button>
        <input ref={inputArq} type="file" multiple hidden onChange={e => { const novos = Array.from(e.target.files || []); e.target.value = ""; if (novos.length) setArquivos(a => [...a, ...novos]); }} />
        {arquivos.map((f, i) => <span key={i} className="chip">{f.name} <span className="muted">{kb(f.size)}</span> <button className="linkbtn" onClick={() => setArquivos(a => a.filter((_, k) => k !== i))}>✕</button></span>)}
        <div style={{ flex: 1 }} />
        <button className="sec" onClick={() => { resposta ? setResp(null) : setNovo(null); setArquivos([]); }}>Cancelar</button>
        <button onClick={() => enviar(dados, resposta)} disabled={enviando || !dados.para || !dados.corpo.trim()}>{enviando ? "Enviando…" : "Enviar"}</button>
      </div>
      {resposta && aberta && aberta.mensagens.some(m => m.anexos.length) && <div className="small" style={{ marginTop: 6 }}>Reenviar anexos deste e-mail: {aberta.mensagens.flatMap(m => m.anexos).map(a => {
        const k = `${a.msgId}|${a.attId}|${a.nome}|${a.mime}`;
        return <label key={k} style={{ display: "inline-flex", gap: 4, marginRight: 10, fontWeight: 400 }}><input type="checkbox" style={{ width: "auto" }} checked={anexosFw.has(k)} onChange={() => setAnexosFw(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })} />{a.nome}</label>;
      })}</div>}
    </div>
  );

  return (
    <>
      <div className="dg-topo" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>E-mail</h1>
        <span className="muted small">{conta}</span>
        <div className="acoes" style={{ marginLeft: "auto" }}>
          <button onClick={() => { setNovo({ para: "", cc: "", assunto: "", corpo: "" }); setAberta(null); setViewMobile("conversa"); }}>✉️ Novo e-mail</button>
          <button className="sec" onClick={sincronizar} disabled={carregando}>🔄 Sincronizar</button>
        </div>
      </div>
      {erro && <div className="aviso erro" style={{ marginTop: 8 }}>{erro}</div>}

      <div className={`dg-app dg-ver-${viewMobile}`}>
        <div className="dg-col1">
          <h4>Ver</h4>
          {FILTROS.map(([v, r]) => <div key={v} className={"dg-filtro" + (filtro === v ? " ativo" : "")} onClick={() => { setFiltro(v); carregar(v); setViewMobile("lista"); }}>
            {r} {v === "esperando" && <span className="n">{esperando}</span>}</div>)}
          <p className="muted small" style={{ padding: "8px 4px" }}>"Esperando resposta" = e-mails de pessoas (não de sistemas) em que a última palavra não foi sua.</p>
        </div>

        <div className="dg-col2">
          <div className="cab"><button className="dg-voltar" onClick={() => setViewMobile("atendentes")}>← Filtros</button><b>{lista.length} e-mail(s)</b></div>
          <input className="dg-busca" placeholder="Buscar (como no Gmail) + Enter" value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => { if (e.key === "Enter") carregar(); }} />
          {carregando && !lista.length && <p className="muted small" style={{ padding: 16 }}>Carregando…</p>}
          {!carregando && !lista.length && <p className="muted small" style={{ padding: 16 }}>{filtro === "esperando" ? "Nenhum e-mail esperando você. 🎉" : "Nada por aqui."}</p>}
          {lista.map(t => (
            <div key={t.id} className={"dg-chamado" + (aberta?.id === t.id ? " ativo" : "")} onClick={() => abrir(t.id)}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                  <span className="nome" style={{ fontWeight: t.naoLido ? 700 : 500 }}>{t.de}{t.mensagens > 1 ? ` (${t.mensagens})` : ""}</span>
                  <span className="hora">{hora(t.quando)}</span>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: t.naoLido ? 700 : 500, color: "var(--navy)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.temAnexo ? "📎 " : ""}{t.assunto}</div>
                <div className="prev">{t.controle?.resumo ? "🤖 " + t.controle.resumo : t.snippet}</div>
              </div>
            </div>
          ))}
          {proxima && <button className="linkbtn" style={{ margin: 10 }} onClick={() => carregar(filtro, proxima)}>carregar mais</button>}
        </div>

        <div className="dg-col3" style={{ overflowY: "auto" }}>
          {novo ? <div style={{ padding: 14 }}><b>Novo e-mail</b>{Compositor({ dados: novo, set: setNovo, resposta: false })}{aviso && <p className="small">{aviso}</p>}</div>
          : !aberta ? <p className="muted" style={{ margin: "40px auto" }}>{abrindo ? "Abrindo…" : "Escolha um e-mail."}</p>
          : <div style={{ padding: "12px 16px" }}>
              <div className="dg-conv-cab" style={{ position: "static", padding: 0, border: 0, marginBottom: 8 }}>
                <button className="dg-voltar" onClick={() => setViewMobile("lista")}>← E-mails</button>
                <b style={{ flex: 1, fontSize: 15 }}>{aberta.assunto}</b>
                <div className="acoes">
                  <button className="mini ok" onClick={() => acao("resolvido")} title="Tira de 'esperando resposta'">✓ Resolvido</button>
                  <button className="mini sec" onClick={() => acao("arquivar")}>Arquivar</button>
                  <button className="mini sec" onClick={() => acao("nao_lido")}>Não lido</button>
                  <button className="mini sec" onClick={() => acao("ignorar")} title="Não é pra mim / não precisa resposta">Ignorar</button>
                  <button className="mini" onClick={() => setTarefaAberta(true)} title="Vira tarefa com prazo">📌 Tarefa</button>
                  <button className="mini" onClick={() => setSetor(true)} title="Abre chamado no Acessórias">➡️ Setor</button>
                  <button className="mini sec" onClick={() => setMostrarIA(v => !v)}>🤖 IA</button>
                </div>
              </div>
              {aviso && <div className="aviso" style={{ margin: "6px 0" }}>{aviso}</div>}
              {aberta.mensagens.map(m => (
                <div key={m.id} className="card" style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div><b>{m.de}</b> <span className="muted small">&lt;{m.deEmail}&gt;</span><div className="muted small">para {m.para}{m.cc ? ` · cc ${m.cc}` : ""}</div></div>
                    <span className="muted small">{hora(m.data)}</span>
                  </div>
                  <div style={{ marginTop: 8 }}><CorpoEmail m={m} /></div>
                  {m.anexos.length > 0 && <div className="acoes" style={{ marginTop: 8 }}>
                    {m.anexos.map(a => <span key={a.attId} className="chip" style={{ cursor: "pointer" }} onClick={() => (a.mime.startsWith("image/") || a.mime.includes("pdf")) ? setVisor(a) : window.open(linkAnexo(a, true))}>
                      {a.mime.includes("pdf") ? "📄" : a.mime.startsWith("image/") ? "🖼️" : "📎"} {a.nome} <span className="muted">{kb(a.tamanho)}</span></span>)}
                  </div>}
                </div>
              ))}
              {!resp && <div className="acoes"><button onClick={() => responder(false)}>↩ Responder</button><button className="sec" onClick={() => responder(true)}>↩↩ Responder a todos</button>
                <button className="sec" onClick={() => { responder(false); perguntar("Escreva uma resposta para este e-mail."); }}>🤖 Responder com IA</button></div>}
              {resp && Compositor({ dados: resp, set: setResp, resposta: true })}
            </div>}
        </div>

        {aberta && !novo && (
          <div className={"dg-col4" + (mostrarIA ? " aberta" : "")}>
            <div className="dg-ia-cab"><b>Assistente</b><button className="sec mini" onClick={() => setMostrarIA(false)}>fechar</button></div>
            {aberta.controle?.resumo && <div className="trecho" style={{ fontStyle: "normal" }}>🤖 {aberta.controle.resumo}</div>}
            <b className="small" style={{ display: "block", marginTop: 12 }}>Tarefas deste e-mail</b>
            {!aberta.tarefas.length && <p className="muted small" style={{ margin: "4px 0" }}>Nenhuma tarefa aberta.</p>}
            {aberta.tarefas.map(t => (
              <div key={t.id} className="tarefa-mini">
                <span className={`selo ${t.tipo}`}>{t.tipo === "promessa" ? "Prometi" : t.tipo === "reuniao" ? "Reunião" : t.tipo === "pedido" ? "Pedido" : "Anotação"}</span>
                <div style={{ fontWeight: 600, margin: "3px 0" }}>{t.titulo}</div>
                {t.prazo && <div className="muted small">⏰ {hora(t.prazo)}</div>}
                {t.conflito && <div className="small" style={{ color: "var(--vermelho)" }}>⚠️ {t.conflito}</div>}
                <div className="acoes" style={{ marginTop: 4 }}>
                  <button className="mini ok" onClick={() => acaoTarefa(t.id, "feita")}>✓ Feito</button>
                  <button className="mini sec" onClick={() => acaoTarefa(t.id, "descartada")}>Descartar</button>
                </div>
              </div>
            ))}
            <button className="mini" style={{ marginTop: 6 }} onClick={analisar} disabled={analisando}>{analisando ? "Analisando…" : "🤖 Procurar tarefas agora"}</button>
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 10 }}>
              <b className="small">Conversar com a IA</b>
              <div className="ia-chat" style={{ marginTop: 6 }}>
                {chat.map((c, i) => c.role === "assistant" && !c.content.startsWith("⚠️")
                  ? <BolhaIA key={i} texto={c.content} aoUsar={(m) => setResp(r => ({ ...(r || { para: ultimaDeFora?.deEmail || "", cc: "" }), corpo: m } as any))} />
                  : <div key={i} className={"ia-bolha " + c.role}><div style={{ whiteSpace: "pre-wrap" }}>{c.content}</div></div>)}
                {pensando && <div className="ia-bolha assistant muted">pensando…</div>}
              </div>
              <div className="acoes" style={{ marginTop: 6, flexWrap: "nowrap" }}>
                <textarea value={pergunta} onChange={e => setPergunta(e.target.value)} rows={2} placeholder="Ex.: resume · o que ele pede? · responde dizendo que envio sexta"
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); perguntar(); } }} style={{ flex: 1, minHeight: 44 }} />
                <button className="mini" onClick={() => perguntar()} disabled={pensando || !pergunta.trim()}>Enviar</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {tarefaAberta && aberta && <TarefaDeEmail threadId={aberta.id} onFechar={(m) => { setTarefaAberta(false); if (m) { setAviso(m); abrir(aberta.id); } }} />}
      {setor && aberta && <MandarSetor threadId={aberta.id}
        anexosEmail={aberta.mensagens.flatMap(m => m.anexos).map(a => ({ chave: `${a.msgId}|${a.attId}|${a.nome}|${a.mime}`, nome: a.nome }))}
        onFechar={(msg) => { setSetor(false); if (msg) setAviso(msg); }} />}

      {visor && <div className="visor-fundo" onClick={e => { if (e.target === e.currentTarget) setVisor(null); }}>
        <div className="visor-topo"><span>{visor.nome}</span><div style={{ flex: 1 }} />
          <a className="visor-btn" href={linkAnexo(visor, true)}>⬇ Baixar</a><button className="visor-btn" onClick={() => setVisor(null)}>✕</button></div>
        {visor.mime.includes("pdf") ? <iframe src={linkAnexo(visor)} className="visor-pdf" title={visor.nome} /> : <img src={linkAnexo(visor)} alt="" className="visor-img" />}
      </div>}
    </>
  );
}
