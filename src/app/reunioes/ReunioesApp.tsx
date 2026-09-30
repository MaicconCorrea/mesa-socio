"use client";
import { useEffect, useMemo, useState } from "react";

type R = { id: string; titulo: string; data: string | null; link: string | null; origem: string; resumo: string | null; decisoes: string[] | null; participantes: string[] | null; analisada_em: string | null; ia_erro: string | null;
  setor?: string | null; autor_nome?: string | null; tarefas_equipe?: { quem: string; titulo: string; prazo: string | null }[] | null };
const SETOR_NOME: Record<string, string> = { DP: "DP", CONTABIL: "Contábil", BPO: "BPO", FISCAL: "Fiscal", LEGALIZACAO: "Legalização", FINANCEIRO: "Financeiro", ATENDIMENTO: "Atendimento", SOCIOS: "Sócios" };
const dt = (s?: string | null) => s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export default function ReunioesApp() {
  const [lista, setLista] = useState<R[]>([]);
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [colar, setColar] = useState<{ titulo: string; data: string; texto: string } | null>(null);
  const [email, setEmail] = useState<{ para: string; texto: string } | null>(null);
  const [transcricao, setTranscricao] = useState<{ id: string; texto: string; falhas: string[] } | null>(null);
  const [verTexto, setVerTexto] = useState(false);
  const [buscaTexto, setBuscaTexto] = useState("");
  const [aba, setAba] = useState("minhas");

  async function carregar() {
    const j = await fetch("/api/reunioes/lista").then(r => r.json());
    setLista(j.reunioes || []); setTarefas(j.tarefas || []);
    return j.reunioes || [];
  }
  useEffect(() => { carregar().then(l => { const r = new URLSearchParams(location.search).get("r"); setSel(r || l[0]?.id || null); }); }, []);

  const r = lista.find(x => x.id === sel) || null;
  const setoresComReuniao = Array.from(new Set(lista.map(x => x.setor).filter(s => s && s !== "SOCIOS"))) as string[];
  const visiveis = lista.filter(x => aba === "minhas" ? (!x.setor || x.setor === "SOCIOS") : aba === "equipe" ? (x.setor && x.setor !== "SOCIOS") : x.setor === aba);
  useEffect(() => { setVerTexto(false); setBuscaTexto(""); }, [sel]);
  async function abrirTexto() {
    setVerTexto(v => !v);
    if (!sel || transcricao?.id === sel) return;
    const j = await fetch(`/api/reunioes/texto?id=${sel}`).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setTranscricao({ id: sel, texto: j.erro ? "Erro: " + j.erro : j.texto || "(sem texto)", falhas: j.falhas || [] });
  }
  function baixarTexto() {
    if (!transcricao || !r) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([transcricao.texto], { type: "text/plain;charset=utf-8" }));
    a.download = `${r.titulo.replace(/[^\w\sÀ-ú-]/g, "").slice(0, 60)}.txt`; a.click();
  }
  const minhas = useMemo(() => tarefas.filter(t => t.reuniao_id === sel), [tarefas, sel]);

  async function buscar() {
    setOcupado("Procurando anotações do Meet no seu Drive…"); setAviso("");
    const j = await fetch("/api/reunioes/buscar", { method: "POST" }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setOcupado("");
    setAviso(j.erro ? j.erro : `${j.encontrados} documento(s) de reunião nos últimos 14 dias · ${j.novos} novo(s) · ${j.analisadas} analisado(s) agora.`);
    carregar();
  }
  async function analisar(id: string) {
    setOcupado("🤖 Lendo a reunião…");
    const j = await fetch("/api/reunioes/analisar", { method: "POST", body: JSON.stringify({ id }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setOcupado(""); setAviso(j.erro ? "Erro: " + j.erro : `Pronto: ${j.criadas} tarefa(s) criada(s).`); carregar();
  }
  async function salvarColado() {
    if (!colar) return;
    setOcupado("🤖 Lendo o que você colou…");
    const j = await fetch("/api/reunioes/colar", { method: "POST", body: JSON.stringify(colar) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setOcupado("");
    if (j.erro) { setAviso(j.erro); return; }
    setColar(null); setAviso(`Pronto: ${j.criadas} tarefa(s).`); await carregar(); setSel(j.id);
  }
  async function acaoTarefa(id: string, acao: string) {
    await fetch("/api/tarefas/acao", { method: "POST", body: JSON.stringify({ id, acao }) });
    setTarefas(t => t.map(x => x.id === id ? { ...x, status: acao } : x));
  }
  function prepararEmail() {
    if (!r) return;
    const minhasAbertas = minhas.filter(t => !t.titulo.startsWith("Cobrar"));
    const outros = minhas.filter(t => t.titulo.startsWith("Cobrar"));
    const txt = [`Olá, pessoal!`, ``, `Segue o resumo da nossa reunião${r.data ? " de " + dt(r.data).slice(0, 5) : ""}:`, ``, r.resumo || "",
      ...(r.decisoes?.length ? [``, `Decisões:`, ...r.decisoes.map(d => `• ${d}`)] : []),
      ...(minhasAbertas.length || outros.length ? [``, `Próximos passos:`, ...minhasAbertas.map(t => `• Outtax: ${t.titulo}${t.prazo ? " — até " + dt(t.prazo).slice(0, 5) : ""}`),
        ...outros.map(t => `• ${t.quem || ""}: ${t.titulo.replace(/^Cobrar [^:]+:\s*/, "")}${t.prazo ? " — até " + dt(t.prazo).slice(0, 5) : ""}`)] : []),
      ``, `Qualquer ajuste, me avisem.`, ``, `Abraço,`, `Maiccon Correa`, `Outtax`].join("\n");
    setEmail({ para: "", texto: txt });
  }
  async function enviarEmail() {
    if (!email || !r) return;
    setOcupado("Enviando…");
    const j = await fetch("/api/reunioes/enviar-resumo", { method: "POST", body: JSON.stringify({ id: r.id, ...email }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setOcupado(""); if (j.erro) setAviso(j.erro); else { setEmail(null); setAviso("Resumo enviado por e-mail ✓"); }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Reuniões</h1>
        <div className="acoes" style={{ marginLeft: "auto" }}>
          <button onClick={buscar} disabled={!!ocupado}>🔍 Buscar no Drive (Meet)</button>
          <button className="sec" onClick={() => setColar({ titulo: "", data: hoje(), texto: "" })}>📋 Colar anotações</button>
        </div>
      </div>
      <p className="muted small">A cada 10 min a Mesa procura no seu Drive as <b>anotações do Gemini</b> e as <b>transcrições</b> do Meet. Pra gravar qualquer reunião (Meet, Zoom, Teams) use a <b>extensão do Chrome</b> (Configuração → Gravador). Ou "Colar anotações".</p>
      {ocupado && <div className="aviso">{ocupado}</div>}
      {aviso && <div className="aviso" style={{ marginTop: 6 }}>{aviso}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px,320px) 1fr", gap: 16, marginTop: 12 }}>
        <div>
          <div className="abas" style={{ marginBottom: 8 }}>
            <a href="#" className={aba === "minhas" ? "ativa" : ""} onClick={e => { e.preventDefault(); setAba("minhas"); }}>Minhas</a>
            <a href="#" className={aba === "equipe" ? "ativa" : ""} onClick={e => { e.preventDefault(); setAba("equipe"); }}>Equipe (todas)</a>
            {setoresComReuniao.map(s0 => <a key={s0} href="#" className={aba === s0 ? "ativa" : ""} onClick={e => { e.preventDefault(); setAba(s0); }}>{SETOR_NOME[s0] || s0}</a>)}
          </div>
          {!visiveis.length && <p className="muted small">Nenhuma reunião aqui.</p>}
          {visiveis.map(x => (
            <div key={x.id} className="card" onClick={() => setSel(x.id)} style={{ cursor: "pointer", borderLeft: x.id === sel ? "4px solid var(--laranja)" : undefined, padding: "8px 12px" }}>
              <div style={{ fontWeight: 600, color: "var(--navy)", fontSize: 13.5 }}>{x.titulo}</div>
              <div className="meta">{x.setor && x.setor !== "SOCIOS" ? <b>{SETOR_NOME[x.setor] || x.setor} · {x.autor_nome} · </b> : null}{dt(x.data)} · {x.origem === "colado" ? "📋 colado" : x.origem === "gravada" ? "🔴 gravada" : "🎥 Meet"} · {x.analisada_em ? `${tarefas.filter(t => t.reuniao_id === x.id).length} tarefa(s)` : x.ia_erro ? "⚠️ erro" : "⏳ a analisar"}</div>
            </div>
          ))}
        </div>
        <div>
          {!r ? <p className="muted">Escolha uma reunião.</p> : (
            <div className="card">
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ fontSize: 16, color: "var(--navy)", flex: 1 }}>{r.titulo}</b>
                {r.link && <a className="botao" href={r.link} target="_blank">Abrir documento</a>}
                <button className="sec" onClick={() => analisar(r.id)} disabled={!!ocupado}>🤖 {r.analisada_em ? "Reanalisar" : "Analisar"}</button>
                {r.analisada_em && <button onClick={prepararEmail}>✉️ Mandar resumo aos participantes</button>}
              </div>
              <div className="meta">{r.setor && r.setor !== "SOCIOS" ? `${SETOR_NOME[r.setor] || r.setor} · gravada por ${r.autor_nome} · ` : ""}{dt(r.data)}{r.participantes?.length ? " · " + r.participantes.join(", ") : ""}</div>
              {r.ia_erro && <div className="aviso erro small" style={{ marginTop: 8 }}>{r.ia_erro}</div>}
              {r.resumo && <><h2>Resumo</h2><p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{r.resumo}</p></>}
              {!!r.decisoes?.length && <><h2>Decisões</h2><ul style={{ margin: 0 }}>{r.decisoes.map((d, i) => <li key={i}>{d}</li>)}</ul></>}
              <h2 style={{ cursor: "pointer" }} onClick={abrirTexto}>📝 {r.origem === "gravada" ? "Transcrição completa" : "Texto completo"} <span className="small" style={{ fontWeight: 400 }}>{verTexto ? "▲ esconder" : "▼ mostrar"}</span></h2>
              {verTexto && (!transcricao || transcricao.id !== sel ? <p className="muted small">Carregando…</p> : <>
                {transcricao.falhas.length > 0 && <div className="aviso small">⚠️ {transcricao.falhas.length} trecho(s) não foram transcritos: {transcricao.falhas[0]}</div>}
                <div className="acoes" style={{ margin: "4px 0 6px" }}>
                  <input value={buscaTexto} onChange={e => setBuscaTexto(e.target.value)} placeholder="Procurar no texto…" style={{ maxWidth: 260 }} />
                  <button className="mini sec" onClick={() => navigator.clipboard.writeText(transcricao.texto)}>Copiar</button>
                  <button className="mini sec" onClick={baixarTexto}>⬇ Baixar .txt</button>
                </div>
                <div style={{ whiteSpace: "pre-wrap", maxHeight: 420, overflowY: "auto", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", fontSize: 13.5, lineHeight: 1.55 }}
                  dangerouslySetInnerHTML={{ __html: (() => {
                    const esc = transcricao.texto.replace(/&/g, "&amp;").replace(/</g, "&lt;");
                    const b = buscaTexto.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    return b.length >= 2 ? esc.replace(new RegExp(b, "gi"), m => `<mark>${m}</mark>`) : esc;
                  })() }} />
              </>)}

              {r.setor && r.setor !== "SOCIOS" ? <>
                <h2>Tarefas combinadas</h2>
                {!r.tarefas_equipe?.length && <p className="muted small">Nenhuma.</p>}
                {(r.tarefas_equipe || []).map((t, i) => <div key={i} className="tarefa-mini"><b>{t.quem}:</b> {t.titulo}{t.prazo ? <span className="muted small"> · até {dt(t.prazo)}</span> : null}</div>)}
              </> : <>
              <h2>Tarefas</h2>
              {!minhas.length && <p className="muted small">Nenhuma.</p>}
              {minhas.map(t => (
                <div key={t.id} className="tarefa-mini" style={{ opacity: t.status === "aberta" ? 1 : .5 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={`selo ${t.tipo}`}>{t.titulo.startsWith("Cobrar") ? "Cobrar" : t.tipo === "promessa" ? "Eu faço" : t.tipo === "reuniao" ? "Reunião" : "Pedido"}</span>
                    <b>{t.titulo}</b>
                  </div>
                  {t.prazo && <div className="muted small">⏰ {dt(t.prazo)}</div>}
                  {t.status === "aberta" ? <div className="acoes" style={{ marginTop: 4 }}>
                    <button className="mini ok" onClick={() => acaoTarefa(t.id, "feita")}>✓ Feito</button>
                    <button className="mini sec" onClick={() => acaoTarefa(t.id, "descartada")}>Descartar</button>
                  </div> : <span className="small muted">{t.status}</span>}
                </div>
              ))}
              </>}
            </div>
          )}
        </div>
      </div>

      {colar && <div className="modal-fundo" onClick={e => { if (e.target === e.currentTarget) setColar(null); }}>
        <div className="modal-caixa" style={{ width: 640 }}>
          <b style={{ fontSize: 16 }}>Colar anotações ou transcrição</b>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
            <label>Reunião<input value={colar.titulo} onChange={e => setColar({ ...colar, titulo: e.target.value })} placeholder="Ex.: Reunião com Tiago (SP)" /></label>
            <label>Dia<input type="date" value={colar.data} onChange={e => setColar({ ...colar, data: e.target.value })} /></label>
          </div>
          <label>Texto<textarea rows={12} value={colar.texto} onChange={e => setColar({ ...colar, texto: e.target.value })} placeholder="Cole aqui as anotações, a ata ou a transcrição (Zoom, Teams, WhatsApp, caderno…)" /></label>
          <div className="acoes" style={{ justifyContent: "flex-end" }}>
            <button className="sec" onClick={() => setColar(null)}>Cancelar</button>
            <button onClick={salvarColado} disabled={!!ocupado || colar.texto.trim().length < 40}>🤖 Analisar</button>
          </div>
        </div>
      </div>}

      {email && <div className="modal-fundo" onClick={e => { if (e.target === e.currentTarget) setEmail(null); }}>
        <div className="modal-caixa" style={{ width: 620 }}>
          <b style={{ fontSize: 16 }}>Mandar resumo por e-mail</b>
          <label>Para (e-mails separados por vírgula)<input value={email.para} onChange={e => setEmail({ ...email, para: e.target.value })} autoFocus /></label>
          <label>Texto (pode editar)<textarea rows={14} value={email.texto} onChange={e => setEmail({ ...email, texto: e.target.value })} /></label>
          <div className="acoes" style={{ justifyContent: "flex-end" }}>
            <button className="sec" onClick={() => setEmail(null)}>Cancelar</button>
            <button onClick={enviarEmail} disabled={!email.para.includes("@") || !!ocupado}>Enviar</button>
          </div>
        </div>
      </div>}
    </>
  );
}
