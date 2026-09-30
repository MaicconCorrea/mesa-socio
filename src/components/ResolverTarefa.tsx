"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Dest = { tipo: "conversa"; id: string; nome: string; instancia: string }
  | { tipo: "contato"; numero: string; nome: string; instancia: string }
  | { tipo: "email"; para: string; assunto: string; threadId?: string; nome?: string };
type Msg = { role: "user" | "assistant"; content: string };

const partes = (t: string) => {
  const out: { tipo: "txt" | "msg"; v: string }[] = [];
  const re = /\[MENSAGEM\]([\s\S]*?)\[\/MENSAGEM\]/g; let i = 0, m: RegExpExecArray | null;
  while ((m = re.exec(t))) { if (m.index > i) out.push({ tipo: "txt", v: t.slice(i, m.index) }); out.push({ tipo: "msg", v: m[1].trim() }); i = re.lastIndex; }
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
  const fimChat = useRef<HTMLDivElement | null>(null);

  function abrir(foco: "ia" | "enviar") {
    setAberto(true); setAviso("");
    fetch(`/api/tarefas/ia?id=${t.id}`).then(r => r.json()).then(j => {
      setNumeros(j.numeros || []); setInstBusca(j.numeros?.[0]?.instancia || "");
      if (j.destino && !destino) setDestino(j.destino); else if (!j.destino) setTrocando(true);
    }).catch(() => {});
    if (foco === "ia" && !chat.length) perguntar("Me ajuda a resolver isso agora: qual o caminho mais rápido e o que eu mando pro cliente?");
  }
  async function perguntar(p?: string) {
    const q = (p ?? pergunta).trim(); if (!q || pensando) return;
    const hist = chat; setChat([...hist, { role: "user", content: q }]); setPergunta(""); setPensando(true);
    const j = await fetch("/api/tarefas/ia", { method: "POST", body: JSON.stringify({ tarefaId: t.id, pergunta: q, historico: hist }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setPensando(false);
    setChat(c => [...c, { role: "assistant", content: j.erro ? "⚠️ " + j.erro : j.resposta }]);
    setTimeout(() => fimChat.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }
  useEffect(() => {
    if (!trocando || busca.trim().length < 2) { setContatos([]); return; }
    const tm = setTimeout(() => fetch(`/api/chat/contatos?q=${encodeURIComponent(busca)}`).then(r => r.json()).then(j => setContatos(j.contatos || [])), 250);
    return () => clearTimeout(tm);
  }, [busca, trocando]);

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

    {aberto && <div className="modal-fundo" onClick={e => { if (e.target === e.currentTarget) setAberto(false); }}>
      <div className="modal-caixa" style={{ width: 760, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto", display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <b style={{ fontSize: 16, flex: 1 }}>{t.titulo}</b>
          <button className="linkbtn" onClick={() => setAberto(false)}>fechar</button>
        </div>

        {/* IA */}
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 10, background: "#fafbfe" }}>
          <b className="small">🤖 Conversar com a IA</b>
          <div style={{ maxHeight: 320, overflowY: "auto", display: "grid", gap: 8, marginTop: 6 }}>
            {!chat.length && <p className="muted small" style={{ margin: 0 }}>A IA já conhece a tarefa e a conversa/e-mail de onde ela veio.</p>}
            {chat.map((m, i) => m.role === "user"
              ? <div key={i} className="small" style={{ alignSelf: "end", background: "var(--navy)", color: "#fff", padding: "6px 10px", borderRadius: 10, justifySelf: "end", maxWidth: "85%" }}>{m.content}</div>
              : <div key={i} style={{ display: "grid", gap: 6 }}>{partes(m.content).map((p, k) => p.tipo === "txt"
                  ? <div key={k} className="small" style={{ whiteSpace: "pre-wrap" }}>{p.v.trim()}</div>
                  : <div key={k} style={{ background: "#fff", border: "1px solid #d6e4fb", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5 }}>{p.v}</div>
                      <button className="mini" style={{ marginTop: 6 }} onClick={() => setTexto(p.v)}>Usar esta mensagem ↓</button>
                    </div>)}</div>)}
            {pensando && <p className="muted small" style={{ margin: 0 }}>Pensando…</p>}
            <div ref={fimChat} />
          </div>
          <div className="acoes" style={{ marginTop: 6 }}>
            <button className="mini sec" disabled={pensando} onClick={() => perguntar("Escreva a resposta pronta para eu mandar ao cliente.")}>✍️ Resposta pro cliente</button>
            <button className="mini sec" disabled={pensando} onClick={() => perguntar("Faça um rascunho do documento/texto que eu preciso entregar.")}>📄 Rascunho do documento</button>
            <button className="mini sec" disabled={pensando} onClick={() => perguntar("Isso deveria ir pra algum setor? Qual e o que eu escrevo no chamado?")}>➡️ É com qual setor?</button>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input value={pergunta} onChange={e => setPergunta(e.target.value)} placeholder="Pergunte ou peça algo sobre esta tarefa…" onKeyDown={e => { if (e.key === "Enter") perguntar(); }} />
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
            <input ref={inputArq} type="file" multiple hidden onChange={e => { setArquivos(a => [...a, ...Array.from(e.target.files || [])]); e.target.value = ""; }} />
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
