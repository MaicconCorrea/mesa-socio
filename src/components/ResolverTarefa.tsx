"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Md from "./Md";

type Dest = { tipo: "conversa"; id: string; nome: string; instancia: string }
  | { tipo: "contato"; numero: string; nome: string; instancia: string }
  | { tipo: "email"; para: string; assunto: string; threadId?: string; nome?: string };
type Msg = { role: "user" | "assistant"; content: string };

const partes = (t: string) => {
  const out: { tipo: "txt" | "msg" | "doc"; v: string; titulo?: string }[] = [];
  const re = /\[MENSAGEM\]([\s\S]*?)\[\/MENSAGEM\]|\[DOCUMENTO(?:\s+titulo="([^"]*)")?\]([\s\S]*?)(?:\[\/DOCUMENTO\]|$)/g; let i = 0, m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    if (m.index > i) out.push({ tipo: "txt", v: t.slice(i, m.index) });
    if (m[1] !== undefined) out.push({ tipo: "msg", v: m[1].trim() });
    else out.push({ tipo: "doc", v: (m[3] || "").trim(), titulo: m[2] || "Documento" });
    i = re.lastIndex;
    if (m[0].length === 0) re.lastIndex++;
  }
  if (i < t.length) out.push({ tipo: "txt", v: t.slice(i) });
  return out.filter(p => p.v.trim());
};
const base64 = (f: File) => new Promise<string>((ok, nao) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = nao; r.readAsDataURL(f); });
const rotulo = (d: Dest | null, nums: any[]) => !d ? "" : d.tipo === "email" ? `✉️ ${d.nome || d.para}` :
  `${d.instancia === "gchat" ? "🗨️" : "📱"} ${d.nome}${d.instancia !== "gchat" ? ` (pelo ${nums.find(n => n.instancia === d.instancia)?.nome || d.instancia})` : ""}`;

// Botões do cartão + janela "Resolver": IA que conhece a tarefa e envio da solução ao cliente
export default function ResolverTarefa({ t }: { t: { id: string; titulo: string; conversa_id?: string | null } }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [destino, setDestino] = useState<Dest | null>(null);
  const [numeros, setNumeros] = useState<{ instancia: string; nome: string }[]>([]);
  const [chat, setChat] = useState<Msg[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [pensando, setPensando] = useState(false);
  const [texto, setTexto] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [feito, setFeito] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [trocando, setTrocando] = useState(false);
  const [busca, setBusca] = useState("");
  const [contatos, setContatos] = useState<any[]>([]);
  const [instBusca, setInstBusca] = useState("");
  const inputArq = useRef<HTMLInputElement | null>(null);
  const inputDoc = useRef<HTMLInputElement | null>(null);
  const [docs, setDocs] = useState<{ id: string; nome: string; tamanho?: number; status?: string; paginas?: number; erro?: string }[]>([]);
  const [lido, setLido] = useState<{ nome: string; texto: string } | null>(null);
  const [subindo, setSubindo] = useState("");
  const fimChat = useRef<HTMLDivElement | null>(null);

  function abrir(foco: "ia" | "enviar") {
    setAberto(true); setAviso("");
    fetch(`/api/tarefas/ia?id=${t.id}`).then(r => r.json()).then(j => {
      setNumeros(j.numeros || []); setInstBusca(j.numeros?.[0]?.instancia || "");
      if (j.destino && !destino) setDestino(j.destino); else if (!j.destino) setTrocando(true);
    }).catch(() => {});
    fetch(`/api/tarefas/docs?tarefaId=${t.id}`).then(r => r.json()).then(j => setDocs(j.docs || [])).catch(() => {});

  }
  async function perguntar(p?: string) {
    const q = (p ?? pergunta).trim(); if (!q || pensando) return;
    const hist = chat; setChat([...hist, { role: "user", content: q }]); setPergunta(""); setPensando(true);
    try {
      const r = await fetch("/api/tarefas/ia", { method: "POST", body: JSON.stringify({ tarefaId: t.id, pergunta: q, historico: hist }) });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const j = await r.json();
      setPensando(false);
      setChat(c => [...c, { role: "assistant", content: j.erro ? "⚠️ " + j.erro : j.resposta }]);
    } catch (e: any) {
      setPensando(false);
      const msg = String(e?.message || e);
      setChat(c => [...c, { role: "assistant", content: "⚠️ Erro ao chamar a IA: " + msg + (msg.includes("504") || msg.includes("timeout") ? " (tente de novo — a IA pode estar processando um documento grande)" : "") }]);
    }
    setTimeout(() => fimChat.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }
  useEffect(() => {
    if (!trocando || busca.trim().length < 2) { setContatos([]); return; }
    const tm = setTimeout(() => fetch(`/api/chat/contatos?q=${encodeURIComponent(busca)}`).then(r => r.json()).then(j => setContatos(j.contatos || [])), 250);
    return () => clearTimeout(tm);
  }, [busca, trocando]);

  async function subirDocs(lista: FileList | null) {
    if (!lista?.length) return;
    for (const f of Array.from(lista)) {
      setSubindo(`Enviando ${f.name}…`);
      const tmp = "tmp" + Date.now();
      try {
        const p = await fetch("/api/tarefas/docs", { method: "POST", body: JSON.stringify({ tarefaId: t.id, etapa: "preparar", nome: f.name }) }).then(r => r.json());
        if (p.erro) throw new Error(p.erro);
        const fd = new FormData(); fd.append("cacheControl", "3600"); fd.append("", f);
        const up = await fetch(p.url, { method: "PUT", body: fd });
        if (!up.ok) throw new Error(`armazenamento ${up.status}`);
        setSubindo(`Lendo ${f.name}… (PDF escaneado grande pode levar 1–3 minutos)`);
        setDocs(d => [...d, { id: tmp, nome: f.name, status: "lendo" }]);
        const c = await fetch("/api/tarefas/docs", { method: "POST", body: JSON.stringify({ tarefaId: t.id, etapa: "confirmar", caminho: p.caminho, nome: f.name, mime: f.type, tamanho: f.size }) }).then(r => r.json());
        if (c.erro) throw new Error(c.erro);
        setDocs(d => d.map(x => x.id === tmp ? c.doc : x));
      } catch (e: any) { setAviso(`Não anexou ${f.name}: ${e?.message || e}`); setDocs(d => d.filter(x => x.id !== tmp)); }
    }
    setSubindo("");
  }
  async function reler(id: string) {
    setDocs(d => d.map(x => x.id === id ? { ...x, status: "lendo" } : x));
    const c = await fetch("/api/tarefas/docs", { method: "POST", body: JSON.stringify({ tarefaId: t.id, etapa: "reler", docId: id }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    if (c.doc) setDocs(d => d.map(x => x.id === id ? { ...x, ...c.doc } : x));
  }
  async function verLido(id: string) {
    const j = await fetch(`/api/tarefas/docs?texto=${id}`).then(r => r.json());
    setLido({ nome: j.nome, texto: j.texto || "(vazio)" });
  }
  async function tirarDoc(id: string) {
    await fetch("/api/tarefas/docs", { method: "DELETE", body: JSON.stringify({ id }) });
    setDocs(d => d.filter(x => x.id !== id));
  }
  async function arquivoDe(titulo: string, texto: string, formato: "pdf" | "docx"): Promise<File> {
    const r = await fetch("/api/documentos/docx", { method: "POST", body: JSON.stringify({ titulo, texto, formato }) });
    if (!r.ok) throw new Error("não gerou o arquivo");
    const nome = titulo.replace(/[\\/:*?"<>|]+/g, "");
    return new File([await r.blob()], `${nome}.${formato}`, { type: formato === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }
  async function baixar(titulo: string, texto: string, formato: "pdf" | "docx") {
    const f = await arquivoDe(titulo, texto, formato);
    const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function anexarAoEnvio(titulo: string, texto: string, formato: "pdf" | "docx") { const f = await arquivoDe(titulo, texto, formato); setArquivos(a => [...a, f]); }
  async function enviar() {
    if (!destino || (!texto.trim() && !arquivos.length)) return;
    setEnviando(true); setAviso("");
    try {
      const arqs = await Promise.all(arquivos.map(async f => ({ nome: f.name, mime: f.type || "application/octet-stream", base64: await base64(f) })));
      if (destino.tipo === "email") {
        const j = await fetch("/api/email/enviar", { method: "POST", body: JSON.stringify({ para: destino.para, assunto: destino.assunto, corpo: texto, threadId: destino.threadId, arquivos: arqs }) }).then(r => r.json());
        if (j.erro) throw new Error(j.erro);
      } else {
        let convId = destino.tipo === "conversa" ? destino.id : "";
        if (destino.tipo === "contato") {
          const j = await fetch("/api/chat/nova", { method: "POST", body: JSON.stringify({ instancia: destino.instancia, numero: destino.numero, nome: destino.nome, texto: arqs.length ? "" : texto }) }).then(r => r.json());
          if (j.erro) throw new Error(j.erro); convId = j.id;
        } else if (texto.trim() && !arqs.length) {
          const j = await fetch("/api/chat/enviar", { method: "POST", body: JSON.stringify({ id: convId, texto }) }).then(r => r.json());
          if (j.erro) throw new Error(j.erro);
        }
        for (let i = 0; i < arqs.length; i++) {
          const j = await fetch("/api/chat/enviar-arquivo", { method: "POST", body: JSON.stringify({ id: convId, ...arqs[i], legenda: i === 0 ? texto : "" }) }).then(r => r.json());
          if (j.erro) throw new Error(`${arqs[i].nome}: ${j.erro}`);
        }
      }
      if (feito) await fetch("/api/tarefas/acao", { method: "POST", body: JSON.stringify({ id: t.id, acao: "feita" }) });
      setAberto(false); setTexto(""); setArquivos([]); router.refresh();
    } catch (e: any) { setAviso("Não enviou: " + (e?.message || e)); }
    finally { setEnviando(false); }
  }

  return <>
    <button className="sec" onClick={() => abrir("ia")} title="Conversar com a IA sobre esta tarefa">🤖 Resolver com IA</button>
    <button className="sec" onClick={() => abrir("enviar")} title="Mandar a solução para o cliente">📤 Enviar ao cliente</button>
    {t.conversa_id && <a className="btn sec" href={`/whatsapp?c=${t.conversa_id}`} style={{ textDecoration: "none" }}>💬 Abrir conversa</a>}

    {lido && <div className="modal-fundo" style={{ zIndex: 200 }} onClick={e => { if (e.target === e.currentTarget) setLido(null); }}>
      <div className="modal-caixa" style={{ width: 900, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex" }}><b style={{ flex: 1 }}>O que a IA leu de "{lido.nome}"</b><button className="linkbtn" onClick={() => setLido(null)}>fechar</button></div>
        <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, marginTop: 8 }}>{lido.texto}</div>
      </div>
    </div>}
    {aberto && <div className="modal-fundo" onClick={e => { if (e.target === e.currentTarget) setAberto(false); }}>
      <div className="modal-caixa" style={{ width: 1180, maxWidth: "97vw", height: "94vh", maxHeight: "94vh", overflowY: "auto", display: "grid", gap: 10, alignContent: "start" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <b style={{ fontSize: 16, flex: 1 }}>{t.titulo}</b>
          <button className="linkbtn" onClick={() => setAberto(false)}>fechar</button>
        </div>

        {/* IA */}
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 10, background: "#fafbfe" }}>
          <b className="small">🤖 Conversar com a IA</b>
          <div style={{ maxHeight: "52vh", minHeight: 160, overflowY: "auto", display: "grid", gap: 10, marginTop: 6, alignContent: "start" }}>
            {!chat.length && <p className="muted small" style={{ margin: 0 }}>Converse como no Claude. A IA já conhece a tarefa, a conversa/e-mail de onde ela veio e os documentos anexados. Ex.: "gere o contrato de prestação de serviços de 13 meses, R$ 2 milhões, pago por medição mensal".</p>}
            {chat.map((m, i) => m.role === "user"
              ? <div key={i} style={{ background: "var(--navy)", color: "#fff", padding: "8px 12px", borderRadius: 10, justifySelf: "end", maxWidth: "80%", whiteSpace: "pre-wrap", fontSize: 13.5 }}>{m.content}</div>
              : <div key={i} style={{ display: "grid", gap: 6 }}>{partes(m.content).map((p, k) => p.tipo === "txt"
                  ? <div key={k}><Md texto={p.v.trim()} /></div>
                  : p.tipo === "doc" ? <div key={k} style={{ background: "#fff", border: "2px solid var(--laranja)", borderRadius: 8, padding: "8px 10px" }}>
                      <b className="small">📄 {p.titulo}</b>
                      <div style={{ maxHeight: 360, overflowY: "auto", marginTop: 6, background: "#fafbfe", padding: "8px 12px", borderRadius: 6 }}><Md texto={p.v} tamanho={12.5} /></div>
                      <div className="acoes" style={{ marginTop: 6 }}>
                        <button className="mini" onClick={() => baixar(p.titulo || "Documento", p.v, "pdf").catch(e => setAviso(String(e)))}>⬇ Baixar PDF</button>
                        <button className="mini" onClick={() => baixar(p.titulo || "Documento", p.v, "docx").catch(e => setAviso(String(e)))}>⬇ Baixar Word</button>
                        <button className="mini sec" onClick={() => anexarAoEnvio(p.titulo || "Documento", p.v, "pdf").catch(e => setAviso(String(e)))}>📎 Anexar PDF ao envio</button>
                        <button className="mini sec" onClick={() => anexarAoEnvio(p.titulo || "Documento", p.v, "docx").catch(e => setAviso(String(e)))}>📎 Anexar Word ao envio</button>
                        <button className="mini sec" onClick={() => navigator.clipboard.writeText(p.v)}>📋 Copiar</button>
                      </div>
                    </div>
                  : <div key={k} style={{ background: "#fff", border: "1px solid #d6e4fb", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5 }}>{p.v}</div>
                      <button className="mini" style={{ marginTop: 6 }} onClick={() => setTexto(p.v)}>Usar esta mensagem ↓</button>
                    </div>)}</div>)}
            {pensando && <p className="muted small" style={{ margin: 0 }}>Pensando… {docs.length ? "(um documento completo pode levar 1 a 2 minutos)" : ""}</p>}
            <div ref={fimChat} />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            <button className="mini sec" onClick={() => inputDoc.current?.click()} title="PDF, Word, imagem ou texto — a IA lê">📎 Anexar documento</button>
            <input ref={inputDoc} type="file" multiple hidden accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.txt,.csv,.md" onChange={e => { subirDocs(e.target.files); e.target.value = ""; }} />
            {docs.map(d => <span key={d.id} className="selo" style={{ display: "inline-flex", gap: 6, alignItems: "center", background: d.status === "erro" ? "#fdecec" : d.status === "lido" ? "#e9f7ef" : undefined }}>
              📄 {d.nome}
              {d.status === "lendo" && <span className="muted">· lendo…</span>}
              {d.status === "lido" && <><span style={{ color: "var(--verde)" }}>· ✓ lido{d.paginas ? ` · ${d.paginas} pág.` : ""}</span><button className="linkbtn small" onClick={() => verLido(d.id)}>ver o que foi lido</button></>}
              {d.status === "lendo" && d.paginas && d.paginas > 15 && <span className="muted" style={{ fontSize: 12 }}>— pode levar 2–3 min se for escaneado</span>}
              {d.status === "erro" && <><span style={{ color: "var(--vermelho)" }} title={d.erro}>· ⚠️ não consegui ler</span><button className="linkbtn small" onClick={() => reler(d.id)}>tentar de novo</button></>}
              <button className="linkbtn small" title="tirar" onClick={() => tirarDoc(d.id)}>✕</button>
            </span>)}
            {subindo && <span className="muted small">{subindo}</span>}
            {!docs.length && !subindo && <span className="muted small">Ex.: contratos sociais das empresas para a IA montar o contrato.</span>}
          </div>
          <div className="acoes" style={{ marginTop: 6 }}>
            <button className="mini sec" disabled={pensando} onClick={() => perguntar("Qual o caminho mais rápido pra resolver isso?")}>💡 Como resolvo?</button>
            <button className="mini sec" disabled={pensando} onClick={() => perguntar("Escreva a resposta pronta para eu mandar ao cliente.")}>✍️ Resposta pro cliente</button>
            <button className="mini sec" disabled={pensando} onClick={() => perguntar("Faça um rascunho do documento/texto que eu preciso entregar.")}>📄 Rascunho do documento</button>
            <button className="mini sec" disabled={pensando} onClick={() => perguntar("Isso deveria ir pra algum setor? Qual e o que eu escrevo no chamado?")}>➡️ É com qual setor?</button>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <textarea value={pergunta} onChange={e => setPergunta(e.target.value)} rows={3} placeholder="Escreva como no Claude… (Enter envia · Shift+Enter quebra linha)"
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); perguntar(); } }} style={{ flex: 1 }} />
            <button onClick={() => perguntar()} disabled={pensando || !pergunta.trim()}>Enviar</button>
          </div>
        </div>

        {/* Enviar */}
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 10 }}>
          <b className="small">📤 Enviar ao cliente</b>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
            <span className="small">Para: <b>{destino ? rotulo(destino, numeros) : "escolha abaixo"}</b></span>
            <button className="linkbtn small" onClick={() => setTrocando(v => !v)}>{trocando ? "fechar" : "trocar"}</button>
          </div>
          {trocando && <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔎 Nome ou número do contato… (ou um e-mail)" autoFocus />
              <select value={instBusca} onChange={e => setInstBusca(e.target.value)} style={{ maxWidth: 160 }}>
                {numeros.map(n => <option key={n.instancia} value={n.instancia}>📱 {n.nome}</option>)}
              </select>
            </div>
            {busca.includes("@") && <button className="mini sec" style={{ justifySelf: "start" }} onClick={() => { setDestino({ tipo: "email", para: busca.trim(), assunto: t.titulo }); setTrocando(false); }}>✉️ Mandar por e-mail para {busca.trim()}</button>}
            <div style={{ maxHeight: 180, overflowY: "auto", border: contatos.length ? "1px solid var(--line)" : "0", borderRadius: 8 }}>
              {contatos.map(c => <div key={c.numero} className="dg-chamado" style={{ padding: "6px 10px" }} onClick={() => {
                const conv = c.conversas.find((x: any) => x.instancia === instBusca);
                setDestino(conv ? { tipo: "conversa", id: conv.id, nome: c.nome || "+" + c.numero, instancia: instBusca } : { tipo: "contato", numero: c.numero, nome: c.nome || "+" + c.numero, instancia: instBusca });
                setTrocando(false); setBusca("");
              }}><div><b className="small">{c.nome || "(sem nome)"}</b> <span className="muted small">+{c.numero}</span></div></div>)}
            </div>
          </div>}
          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={5} placeholder="Mensagem para o cliente (use a sugestão da IA ou escreva)…" style={{ marginTop: 8 }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
            <button className="sec" onClick={() => inputArq.current?.click()}>📎 Anexar</button>
            <input ref={inputArq} type="file" multiple hidden onChange={e => { const novos = Array.from(e.target.files || []); e.target.value = ""; if (novos.length) setArquivos(a => [...a, ...novos]); }} />
            {arquivos.map((f, i) => <span key={i} className="selo" style={{ cursor: "pointer" }} title="tirar" onClick={() => setArquivos(a => a.filter((_, k) => k !== i))}>📄 {f.name} ✕</span>)}
            <label className="small" style={{ display: "flex", gap: 4, alignItems: "center", marginLeft: "auto" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={feito} onChange={e => setFeito(e.target.checked)} /> marcar tarefa como feita</label>
            <button onClick={enviar} disabled={enviando || !destino || (!texto.trim() && !arquivos.length)}>{enviando ? "Enviando…" : "Enviar"}</button>
          </div>
          {aviso && <div className="aviso erro small" style={{ marginTop: 6 }}>{aviso}</div>}
        </div>
      </div>
    </div>}
  </>;
}
