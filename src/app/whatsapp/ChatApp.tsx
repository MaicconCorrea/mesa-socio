"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ligarPush, statusPush } from "@/lib/push-cliente";
import MandarSetor from "@/components/MandarSetor";
import BolhaIA from "@/components/BolhaIA";

type Conversa = {
  id: string; instancia: string; jid: string; nome: string; is_grupo: boolean; modo: string;
  ultima_msg_em: string | null; ultima_msg_de_mim: boolean | null; ultima_msg_texto: string | null;
  nao_lidas: number; precisa_resposta: boolean; sem_retorno: boolean; resumo: string | null; foto_url?: string | null;
};
type Msg = {
  id: string; msg_id: string; de_mim: boolean; autor: string | null; texto: string | null; enviada_em: string;
  me_citou: boolean; tipo: string | null; midia_mime: string | null; midia_nome: string | null; tem_midia: boolean; citada_texto?: string | null; transcricao?: string | null; transcricao_erro?: string | null;
};
const MAX_ARQ = 3 * 1024 * 1024; // limite da Vercel pro envio (~3 MB)

function lerBase64(f: Blob): Promise<string> {
  return new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = () => falha(r.error); r.readAsDataURL(f); });
}
function bip() {
  try { const ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.18); } catch {}
}

const MODOS: Record<string, string> = {
  auto: "🤖 Automático", grupo: "👥 Grupo do escritório", pessoal: "🏠 Pessoal", ignorada: "🚫 Ignorada",
};
const VISOES: [string, string][] = [
  ["todas", "Todas"], ["naolidas", "Não lidas"], ["esperando", "Esperando você"],
  ["auto", "🤖 Automático"], ["grupo", "👥 Grupos do escritório"], ["pessoal", "🏠 Pessoal"], ["ignorada", "🚫 Ignoradas"],
];

const hora = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso), hoje = new Date();
  const mesmoDia = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === hoje.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return d.toLocaleString("pt-BR", mesmoDia
    ? { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }
    : { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};
const semMarcador = (t?: string | null) => (t || "").replace(/^\[(imagem|vídeo|áudio|documento[^\]]*)\]\s*/, "");
const iniciais = (n: string) => (n || "?").replace(/[^A-Za-zÀ-ú0-9 ]/g, "").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?";

export default function ChatApp() {
  const [conexoes, setConexoes] = useState<string[]>([]);
  const [lista, setLista] = useState<Conversa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState("");
  const [visao, setVisao] = useState("todas");
  const [conexao, setConexao] = useState("todas");
  const [busca, setBusca] = useState("");
  const [ativoId, setAtivoId] = useState<string | null>(null);
  const [conv, setConv] = useState<any>(null);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [mostrarIA, setMostrarIA] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [pensando, setPensando] = useState(false);
  const [viewMobile, setViewMobile] = useState<"atendentes" | "lista" | "conversa">("lista");
  const [novasAbaixo, setNovasAbaixo] = useState(0);
  const msgsRef = useRef<HTMLDivElement | null>(null);
  const grudado = useRef(true);
  const ultimaQtd = useRef(0);
  const [citada, setCitada] = useState<Msg | null>(null);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const inputArq = useRef<HTMLInputElement | null>(null);
  const [gravando, setGravando] = useState(false);
  const [segGravando, setSegGravando] = useState(0);
  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const cancelarGravacao = useRef(false);
  const [avisos, setAvisos] = useState(false);
  const [modalNova, setModalNova] = useState(false);
  const [nova, setNova] = useState({ instancia: "", numero: "", nome: "", texto: "" });
  const [sincronizando, setSincronizando] = useState("");
  const anteriores = useRef<Map<string, number> | null>(null);
  const historicoPedido = useRef<Set<string>>(new Set());
  const [carregandoAntigas, setCarregandoAntigas] = useState(false);
  const [visor, setVisor] = useState<Msg | null>(null); // foto/PDF aberto por cima
  const [setor, setSetor] = useState(false);
  const [selecionando, setSelecionando] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [transcrevendo, setTranscrevendo] = useState<Set<string>>(new Set());
  const [sugerindo, setSugerindo] = useState(false);
  const [dispensada, setDispensada] = useState<string | null>(null);
  const [instrucao, setInstrucao] = useState<string | null>(null);

  const midiasVisor = useMemo(() => (msgs || []).filter(m => m.tem_midia && (m.tipo === "imagem" || (m.midia_mime || "").includes("pdf"))), [msgs]);
  const moverVisor = useCallback((d: number) => {
    setVisor(v => {
      if (!v) return v;
      const i = midiasVisor.findIndex(m => m.id === v.id);
      const n = midiasVisor[i + d];
      return n || v;
    });
  }, [midiasVisor]);
  useEffect(() => {
    if (!visor) return;
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVisor(null);
      if (e.key === "ArrowLeft") moverVisor(-1);
      if (e.key === "ArrowRight") moverVisor(1);
    };
    window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f);
  }, [visor, moverVisor]);
  useEffect(() => {
    try {
      setAvisos(localStorage.getItem("avisos-whats") === "1" && "Notification" in window && Notification.permission === "granted");
    } catch {}
  }, []);

  const cx = (inst: string) => `cx cx-${Math.max(0, conexoes.indexOf(inst)) % 3}`;
  const rotuloCx = (inst: string) => "📱 " + inst.replace(/^socio-/, "");

  // ---- lista (atualiza a cada 4s) ----
  const carregarLista = useCallback(async () => {
    try {
      const j = await fetch("/api/chat/lista", { cache: "no-store" }).then(r => r.json());
      if (j.erro) { setErroLista(j.erro); return; }
      const convs: Conversa[] = j.conversas || [];
      setConexoes(j.conexoes || []); setLista(convs); setErroLista("");
      // avisos de mensagem nova (conversas individuais e pessoais; grupos só quando falam com você)
      const antes = anteriores.current;
      const agora = new Map(convs.map(c => [c.id, c.nao_lidas || 0]));
      if (antes) {
        const novas = convs.filter(c => c.modo !== "ignorada" && (c.nao_lidas || 0) > (antes.get(c.id) || 0)
          && (c.modo !== "grupo" || c.precisa_resposta));
        if (novas.length) avisarNovas(novas);
      }
      anteriores.current = agora;
      const total = convs.filter(c => c.modo === "auto" || c.modo === "pessoal").reduce((s2, c) => s2 + (c.nao_lidas || 0), 0);
      document.title = (total ? `(${total}) ` : "") + "WhatsApp · Mesa do Sócio";
    } catch { /* rede */ } finally { setCarregando(false); }
  }, []);
  const avisosRef = useRef(false); avisosRef.current = avisos;
  const pushLigado = useRef(false);
  useEffect(() => { statusPush().then(s => { pushLigado.current = s === "ligado"; }).catch(() => {}); }, [avisos]);
  const ativoRef = useRef<string | null>(null); ativoRef.current = ativoId;
  function avisarNovas(novas: Conversa[]) {
    if (!avisosRef.current) return;
    const relevantes = novas.filter(c => document.hidden || c.id !== ativoRef.current);
    if (!relevantes.length) return;
    bip();
    if (pushLigado.current) return; // o aviso do sistema já vem pelo push (evita duplicar)
    for (const c of relevantes.slice(0, 3)) {
      try {
        const n = new Notification(`${c.nome} · 📱 ${c.instancia.replace(/^socio-/, "")}`, { body: c.ultima_msg_texto || "Mensagem nova", tag: c.id, icon: "/icone-192.png" });
        n.onclick = () => { window.focus(); setAtivoId(c.id); setViewMobile("conversa"); n.close(); };
      } catch {}
    }
  }
  useEffect(() => {
    carregarLista();
    const t = setInterval(() => { if (document.visibilityState === "visible") carregarLista(); }, 4000);
    return () => clearInterval(t);
  }, [carregarLista]);

  // abre a conversa vinda de um link (?c=id)
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) { setAtivoId(c); setViewMobile("conversa"); }
  }, []);

  // ---- conversa ativa (atualiza a cada 3s) ----
  const irProFim = () => { const el = msgsRef.current; if (el) el.scrollTop = el.scrollHeight; setNovasAbaixo(0); };
  const carregarConversa = useCallback(async (id: string, primeira = false) => {
    const j = await fetch(`/api/chat/conversa?id=${id}`, { cache: "no-store" }).then(r => r.json()).catch(() => null);
    if (!j || j.erro) return;
    setConv(j.conversa); setTarefas(j.tarefas || []);
    setMsgs(j.mensagens || []);
    const qtd = (j.mensagens || []).length;
    if (primeira) { ultimaQtd.current = qtd; grudado.current = true; setTimeout(irProFim, 30); }
    else if (qtd > ultimaQtd.current) {
      if (grudado.current) setTimeout(irProFim, 30); else setNovasAbaixo(n => n + (qtd - ultimaQtd.current));
      ultimaQtd.current = qtd;
    }
    if (j.conversa?.nao_lidas > 0) {
      fetch("/api/chat/lida", { method: "POST", body: JSON.stringify({ id }) });
      setLista(l => l.map(c => c.id === id ? { ...c, nao_lidas: 0 } : c));
    }
  }, []);
  useEffect(() => {
    if (!ativoId) return;
    setMsgs(null); setChat([]); setAviso(""); setNovasAbaixo(0); setCitada(null); setArquivos([]);
    setSelecionando(false); setSel(new Set()); setInstrucao(null);
    carregarConversa(ativoId, true);
    if (!historicoPedido.current.has(ativoId)) {
      historicoPedido.current.add(ativoId);
      const id = ativoId;
      fetch("/api/chat/historico", { method: "POST", body: JSON.stringify({ id }) }).then(r => r.json())
        .then(j => { if (j.importadas) carregarConversa(id, true); }).catch(() => {});
    }
    const t = setInterval(() => { if (document.visibilityState === "visible") carregarConversa(ativoId); }, 3000);
    // rede de segurança: a cada 20s confere na Evolution se tem mensagem que não chegou pelo webhook (ex.: enviada pelo celular)
    const id = ativoId;
    const conf = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/chat/historico", { method: "POST", body: JSON.stringify({ id, conferir: true, qtd: 20 }) }).then(r => r.json())
        .then(j => { if (j.importadas) carregarConversa(id); }).catch(() => {});
    }, 20000);
    return () => { clearInterval(t); clearInterval(conf); };
  }, [ativoId, carregarConversa]);

  const aoRolar = () => {
    const el = msgsRef.current; if (!el) return;
    grudado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (grudado.current) setNovasAbaixo(0);
  };

  // ---- filtros ----
  const filtrada = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return lista.filter(c => {
      if (conexao !== "todas" && c.instancia !== conexao) return false;
      if (visao === "ignorada") { if (c.modo !== "ignorada") return false; }
      else if (c.modo === "ignorada") return false;
      if (visao === "naolidas" && !c.nao_lidas) return false;
      if (visao === "esperando" && !(c.precisa_resposta && !c.ultima_msg_de_mim)) return false;
      if (["auto", "grupo", "pessoal"].includes(visao) && c.modo !== visao) return false;
      if (b && !(`${c.nome} ${c.jid}`.toLowerCase().includes(b))) return false;
      return true;
    });
  }, [lista, visao, conexao, busca]);

  const contar = (v: string) => lista.filter(c => {
    if (v === "ignorada") return c.modo === "ignorada";
    if (c.modo === "ignorada") return false;
    if (conexao !== "todas" && c.instancia !== conexao) return false;
    if (v === "naolidas") return c.nao_lidas > 0;
    if (v === "esperando") return c.precisa_resposta && !c.ultima_msg_de_mim;
    if (["auto", "grupo", "pessoal"].includes(v)) return c.modo === v;
    return true;
  }).length;
  const naoLidasCx = (inst: string) => lista.filter(c => c.instancia === inst && c.modo !== "ignorada").reduce((s, c) => s + (c.nao_lidas || 0), 0);

  const ativo = lista.find(c => c.id === ativoId) || conv;

  // ---- ações ----
  async function enviar() {
    const t = texto.trim(); if ((!t && !arquivos.length) || !ativoId) return;
    setEnviando(true); setAviso("");
    if (arquivos.length) { setEnviando(false); return enviarArquivos(); }
    const j = await fetch("/api/chat/enviar", { method: "POST", body: JSON.stringify({ id: ativoId, texto: t, citadaId: citada?.id || null }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setEnviando(false);
    if (j.erro) { setAviso("Não enviou: " + j.erro); return; }
    setTexto(""); setCitada(null); grudado.current = true; carregarConversa(ativoId); carregarLista();
  }
  async function mudarModo(modo: string) {
    if (!ativoId) return;
    if (modo === "ignorada" && !confirm("Ignorar esta conversa? As mensagens guardadas dela serão apagadas do painel e nada novo será guardado.")) return;
    await fetch("/api/chat/modo", { method: "POST", body: JSON.stringify({ id: ativoId, modo }) });
    carregarLista(); carregarConversa(ativoId);
  }
  async function analisar() {
    if (!ativoId) return;
    setAnalisando(true);
    const j = await fetch("/api/chat/analisar", { method: "POST", body: JSON.stringify({ id: ativoId }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setAnalisando(false);
    setAviso(j.erro ? "IA: " + j.erro : j.criadas ? `IA criou ${j.criadas} tarefa(s).` : "IA analisou: nenhuma tarefa nova.");
    carregarConversa(ativoId);
  }
  async function acaoTarefa(id: string, acao: "feita" | "descartada") {
    await fetch("/api/tarefas/acao", { method: "POST", body: JSON.stringify({ id, acao }) });
    setTarefas(t => t.filter(x => x.id !== id));
  }
  function perguntarRapido(p: string, ids?: string[]) { setPergunta(""); perguntar(p, ids); }
  async function transcrever(id: string) {
    setTranscrevendo(s0 => new Set(s0).add(id));
    const j = await fetch("/api/chat/transcrever", { method: "POST", body: JSON.stringify({ id }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setTranscrevendo(s0 => { const n = new Set(s0); n.delete(id); return n; });
    if (j.erro) setAviso("Transcrição: " + j.erro);
    if (ativoId) carregarConversa(ativoId);
  }
  async function sugerir(instr = "") {
    if (!ativoId) return;
    setSugerindo(true); setDispensada(null);
    const j = await fetch("/api/chat/sugerir", { method: "POST", body: JSON.stringify({ id: ativoId, instrucao: instr }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setSugerindo(false); setInstrucao(null);
    if (j.erro) setAviso("IA: " + j.erro); else setConv((c: any) => ({ ...c, sugestao: j.texto, sugestao_em: new Date().toISOString() }));
  }
  function alternarSel(id: string) { setSel(s0 => { const n = new Set(s0); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  async function tarefaDaSelecao() {
    if (!ativoId || !sel.size) return;
    setAviso("🤖 Criando tarefa das mensagens selecionadas…");
    const j = await fetch("/api/chat/tarefas-selecao", { method: "POST", body: JSON.stringify({ id: ativoId, ids: Array.from(sel) }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setAviso(j.erro ? "IA: " + j.erro : `${j.criadas} tarefa(s) criada(s).`); setSelecionando(false); setSel(new Set()); carregarConversa(ativoId);
  }
  async function perguntar(texto?: string, ids?: string[]) {
    const p = (texto ?? pergunta).trim(); if (!p || !ativoId) return;
    const hist = chat; setChat([...hist, { role: "user", content: p }]); setPergunta(""); setPensando(true);
    const j = await fetch("/api/chat/ia", { method: "POST", body: JSON.stringify({ id: ativoId, historico: hist, pergunta: p, selecionadas: ids || [] }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    setPensando(false); setMostrarIA(true);
    setChat(c => [...c, { role: "assistant", content: j.erro ? "⚠️ " + j.erro : j.resposta }]);
  }

  async function enviarArquivos() {
    if (!ativoId || !arquivos.length) return;
    setEnviando(true); setAviso("");
    try {
      for (let i = 0; i < arquivos.length; i++) {
        const f = arquivos[i];
        if (f.size > MAX_ARQ) { setAviso(`"${f.name}" passa de 3 MB — mande pelo celular por enquanto.`); continue; }
        const base64 = await lerBase64(f);
        const j = await fetch("/api/chat/enviar-arquivo", { method: "POST", body: JSON.stringify({ id: ativoId, base64, mime: f.type || "application/octet-stream", nome: f.name, legenda: i === 0 ? texto.trim() : "" }) }).then(r => r.json());
        if (j.erro) { setAviso("Não enviou " + f.name + ": " + j.erro); break; }
      }
      setArquivos([]); setTexto(""); grudado.current = true; carregarConversa(ativoId); carregarLista();
    } finally { setEnviando(false); }
  }
  function adicionarArquivos(fl: FileList | null) {
    if (!fl?.length) return;
    setArquivos(a => [...a, ...Array.from(fl)]);
  }
  async function iniciarGravacao() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus") ? "audio/ogg;codecs=opus" : "audio/webm;codecs=opus";
      const rec = new MediaRecorder(stream, { mimeType: tipo });
      pedacos.current = []; cancelarGravacao.current = false;
      rec.ondataavailable = e => { if (e.data.size) pedacos.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setGravando(false);
        if (cancelarGravacao.current || !ativoId) return;
        const blob = new Blob(pedacos.current, { type: tipo });
        setEnviando(true);
        const base64 = await lerBase64(blob);
        const j = await fetch("/api/chat/enviar-audio", { method: "POST", body: JSON.stringify({ id: ativoId, base64 }) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
        setEnviando(false);
        if (j.erro) setAviso("Áudio não enviou: " + j.erro); else { grudado.current = true; carregarConversa(ativoId); carregarLista(); }
      };
      gravador.current = rec; rec.start(); setGravando(true); setSegGravando(0);
    } catch { setAviso("Não consegui usar o microfone — permita o acesso no navegador."); }
  }
  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => setSegGravando(s2 => s2 + 1), 1000);
    return () => clearInterval(t);
  }, [gravando]);
  function pararGravacao(cancelar = false) { cancelarGravacao.current = cancelar; gravador.current?.stop(); }

  async function alternarAvisos() {
    if (avisos) { setAvisos(false); try { localStorage.setItem("avisos-whats", "0"); } catch {} return; }
    if (!("Notification" in window)) { setAviso("Este navegador não suporta notificações."); return; }
    const p = await Notification.requestPermission();
    if (p === "granted") {
      setAvisos(true); bip(); try { localStorage.setItem("avisos-whats", "1"); } catch {}
      const e = await ligarPush().catch(err => String(err)); // também liga o aviso com a Mesa fechada
      if (e) setAviso(e);
    }
    else setAviso("Notificações bloqueadas — libere nas configurações do navegador para este site.");
  }
  async function sincronizar() {
    setSincronizando("Buscando conversas no celular…");
    const j = await fetch("/api/chat/sincronizar", { method: "POST" }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    if (j.erro) setSincronizando("Erro: " + j.erro);
    else {
      const tot = Object.values(j.novas || {}).reduce((a: number, b: any) => a + Number(b), 0);
      const det = Object.entries(j.encontradas || {}).map(([k, v]) => `📱 ${k.replace(/^socio-/, "")}: ${v} no celular`).join(" · ");
      setSincronizando(`${tot} conversa(s) nova(s) trazidas. ${det}`); carregarLista();
    }
    setTimeout(() => setSincronizando(""), 12000);
  }
  async function criarNova() {
    setAviso("");
    const j = await fetch("/api/chat/nova", { method: "POST", body: JSON.stringify(nova) }).then(r => r.json()).catch(e => ({ erro: String(e) }));
    if (j.erro) { setAviso(j.erro); return; }
    setModalNova(false); setNova({ instancia: nova.instancia, numero: "", nome: "", texto: "" });
    await carregarLista(); setAtivoId(j.id); setViewMobile("conversa");
  }
  async function carregarAntigas() {
    if (!ativoId) return;
    setCarregandoAntigas(true);
    await fetch("/api/chat/historico", { method: "POST", body: JSON.stringify({ id: ativoId, forcar: true, qtd: 200 }) }).catch(() => {});
    setCarregandoAntigas(false);
    const el = msgsRef.current; const alturaAntes = el?.scrollHeight || 0;
    await carregarConversa(ativoId);
    setTimeout(() => { if (el) el.scrollTop = el.scrollHeight - alturaAntes; }, 50);
  }

  if (carregando) return <><h1>WhatsApp</h1><p className="muted">Carregando…</p></>;

  return (
    <>
      <div className="dg-topo" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>WhatsApp</h1>
        <span className="muted small">Atualiza sozinho · {conexoes.map(c => <span key={c} className={cx(c)} style={{ marginRight: 4 }}>{rotuloCx(c)}</span>)}</span>
        <div className="acoes" style={{ marginLeft: "auto" }}>
          <button onClick={() => { setNova(n => ({ ...n, instancia: n.instancia || conexoes[0] || "" })); setModalNova(true); }}>+ Nova conversa</button>
          <button className="sec" onClick={sincronizar} title="Traz pro painel as conversas dos últimos 90 dias do celular">🔄 Sincronizar conversas</button>
          <button className="sec" onClick={alternarAvisos} title="Som e notificação quando chegar mensagem">{avisos ? "🔔 Avisos ligados" : "🔕 Ligar avisos"}</button>
        </div>
      </div>
      {sincronizando && <div className="aviso" style={{ marginTop: 8 }}>{sincronizando}</div>}
      {erroLista && <div className="aviso erro" style={{ marginTop: 8 }}>{erroLista}</div>}

      <div className={`dg-app dg-ver-${viewMobile}`}>
        {/* coluna 1: filtros */}
        <div className="dg-col1">
          <h4>Ver</h4>
          {VISOES.map(([v, r]) => (
            <div key={v} className={"dg-filtro" + (visao === v ? " ativo" : "")} onClick={() => { setVisao(v); setViewMobile("lista"); }}>
              {r} <span className="n">{contar(v)}</span>
            </div>
          ))}
          <h4>Conexão</h4>
          <div className={"dg-filtro" + (conexao === "todas" ? " ativo" : "")} onClick={() => { setConexao("todas"); setViewMobile("lista"); }}>Todos os números</div>
          {conexoes.map(c => {
            const n = naoLidasCx(c);
            return (
              <div key={c} className={"dg-atendente" + (conexao === c ? " ativo" : "")} onClick={() => { setConexao(c); setViewMobile("lista"); }}>
                <span className={cx(c)}>{rotuloCx(c)}</span>
                <div style={{ flex: 1 }} />
                <div className={"dg-badge" + (n === 0 ? " zero" : "")}>{n}</div>
              </div>
            );
          })}
        </div>

        {/* coluna 2: conversas */}
        <div className="dg-col2">
          <div className="cab"><button className="dg-voltar" onClick={() => setViewMobile("atendentes")}>← Filtros</button><b>{filtrada.length} conversa(s)</b></div>
          <input className="dg-busca" placeholder="Buscar nome ou número…" value={busca} onChange={e => setBusca(e.target.value)} />
          {filtrada.length === 0 && <p className="muted small" style={{ padding: 16 }}>Nada por aqui.</p>}
          {filtrada.map(c => (
            <div key={c.id} className={"dg-chamado" + (c.id === ativoId ? " ativo" : "")} onClick={() => { setAtivoId(c.id); setViewMobile("conversa"); }}>
              <div className="dg-avatar" style={{ width: 32, height: 32, fontSize: 11, background: c.is_grupo ? "var(--ink-2)" : c.modo === "pessoal" ? "#7a3db8" : "var(--azul)" }}>
                {c.foto_url ? <img src={c.foto_url} alt="" style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /> : c.is_grupo ? "👥" : iniciais(c.nome)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                  <span className="nome" style={{ fontWeight: c.nao_lidas ? 700 : 600 }}>{c.nome}</span>
                  <span className="hora" style={{ color: c.nao_lidas ? "#1fa855" : undefined }}>{hora(c.ultima_msg_em)}</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <div className="prev" style={{ flex: 1 }}>{c.ultima_msg_texto}</div>
                  {c.nao_lidas > 0 && <span className="nl">{c.nao_lidas}</span>}
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                  <span className={cx(c.instancia)}>{rotuloCx(c.instancia)}</span>
                  {c.precisa_resposta && !c.ultima_msg_de_mim && <span className="pill p-ambar" style={{ fontSize: 10 }}>⏳ esperando você</span>}
                  {c.sem_retorno && <span className="pill p-erro" style={{ fontSize: 10 }}>sem retorno do time</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* coluna 3: chat */}
        <div className="dg-col3">
          {!ativo ? <p className="muted" style={{ margin: "40px auto" }}>Escolha uma conversa.</p> : (
            <>
              <div className="dg-conv-cab">
                <button className="dg-voltar" onClick={() => setViewMobile("lista")}>← Conversas</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{ativo.is_grupo ? "👥 " : ""}{ativo.nome}</b>
                  <div className="muted small" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={cx(ativo.instancia)}>{rotuloCx(ativo.instancia)}</span>
                    <span>{MODOS[ativo.modo] || ativo.modo}</span>
                    {!ativo.is_grupo && <span>· {ativo.jid?.split("@")[0]}</span>}
                  </div>
                </div>
                <div className="acoes">
                  <select value={ativo.modo} onChange={e => mudarModo(e.target.value)} style={{ width: "auto", fontSize: 12.5, padding: "5px 8px" }} title="Modo da conversa">
                    {Object.entries(MODOS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                  </select>
                  <button className={selecionando ? "" : "sec"} onClick={() => { setSelecionando(v => !v); setSel(new Set()); }} title="Selecionar mensagens para a IA">☑️ {selecionando ? "Selecionando" : "Selecionar"}</button>
                  <button className="sec" onClick={() => setMostrarIA(v => !v)}>🤖 IA</button>
                </div>
              </div>

              <div className="dg-msgs" ref={msgsRef} onScroll={aoRolar}>
                {msgs && msgs.length > 0 && <button className="linkbtn" style={{ alignSelf: "center", margin: "0 0 6px" }} onClick={carregarAntigas} disabled={carregandoAntigas}>{carregandoAntigas ? "buscando…" : "⬆ carregar mensagens mais antigas"}</button>}
                {msgs === null && <p className="muted">Carregando conversa…</p>}
                {msgs?.length === 0 && <p className="muted small">Sem mensagens guardadas ainda. As novas aparecem aqui na hora.</p>}
                {msgs?.map(m => {
                  const link = `/api/chat/midia?id=${m.id}`;
                  const txt = m.tipo === "audio" ? "" : m.tem_midia ? semMarcador(m.texto) : m.texto;
                  return (
                    <div key={m.id} className={"dg-msg " + (m.de_mim ? "equipe" : "cliente")}
                      onClick={selecionando ? () => alternarSel(m.id) : undefined}
                      style={selecionando ? { cursor: "pointer", outline: sel.has(m.id) ? "3px solid var(--laranja)" : "1px dashed rgba(0,0,0,.15)", outlineOffset: 2 } : undefined}>
                      {selecionando && <span style={{ float: "right", marginLeft: 6 }}>{sel.has(m.id) ? "☑️" : "⬜"}</span>}
                      {!m.de_mim && ativo.is_grupo && m.autor && <div className="dg-autor" style={{ fontSize: 11, fontWeight: 700, color: "var(--azul)" }}>{m.autor}</div>}
                      {m.me_citou && <span className="citou">📣 falou com você</span>}
                      {m.citada_texto && <div style={{ borderLeft: "3px solid var(--laranja)", background: m.de_mim ? "rgba(255,255,255,.15)" : "var(--paper)", padding: "3px 7px", borderRadius: 5, fontSize: 11.5, marginBottom: 4, opacity: .9 }}>{m.citada_texto.slice(0, 160)}</div>}
                      {m.tem_midia && (
                        m.tipo === "imagem" ? <img className="midia" src={link} alt="imagem" loading="lazy" onClick={() => setVisor(m)} onLoad={() => { if (grudado.current) irProFim(); }} />
                        : m.tipo === "audio" ? <div>
                            <audio controls preload="none" src={link} />
                            {m.transcricao
                              ? <div style={{ fontSize: 12.5, fontStyle: "italic", marginTop: 4, opacity: .95, whiteSpace: "pre-wrap" }}>📝 {m.transcricao}</div>
                              : <div style={{ marginTop: 2 }}>
                                  <button className="linkbtn" style={{ color: "inherit", fontSize: 11.5 }} disabled={transcrevendo.has(m.id)} onClick={e => { e.stopPropagation(); transcrever(m.id); }}>
                                    {transcrevendo.has(m.id) ? "transcrevendo…" : "📝 transcrever áudio"}</button>
                                  {m.transcricao_erro && <span style={{ fontSize: 11, opacity: .8 }}> · {m.transcricao_erro.slice(0, 80)}</span>}
                                </div>}
                          </div>
                        : m.tipo === "video" ? <video controls preload="none" src={link} style={{ maxWidth: 240 }} />
                        : (m.midia_mime || "").includes("pdf")
                          ? <a href={link} className="dg-doc" onClick={e => { e.preventDefault(); setVisor(m); }}>📄 {m.midia_nome || "documento"}</a>
                          : <a href={link} target="_blank" className="dg-doc">📄 {m.midia_nome || "documento"}</a>
                      )}
                      {m.tem_midia && m.tipo !== "imagem" && <a href={`${link}&baixar=1`} className="small" style={{ marginLeft: 6, opacity: .8 }}>⬇ baixar</a>}
                      {txt ? <div style={{ whiteSpace: "pre-wrap" }}>{txt}</div> : null}
                      <span className="qd">{hora(m.enviada_em)} <button className="linkbtn" style={{ color: "inherit", fontSize: 10, marginLeft: 6 }} onClick={() => setCitada(m)} title="Responder citando">↩ responder</button></span>
                    </div>
                  );
                })}
              </div>
              {novasAbaixo > 0 && <button className="dg-novas" onClick={() => { grudado.current = true; irProFim(); }}>↓ {novasAbaixo} mensagem(ns) nova(s)</button>}

              <div className="dg-compositor">
                {ativo.modo === "ignorada"
                  ? <p className="muted small">Conversa ignorada: nada é guardado. Mude o modo acima pra voltar a acompanhar.</p>
                  : <>
                    {selecionando && <div className="small" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", background: "var(--ambar-bg)", padding: "6px 8px", borderRadius: 8 }}>
                      <b>{sel.size} selecionada(s)</b> <span className="muted">— toque nas mensagens</span>
                      <div style={{ flex: 1 }} />
                      <button className="mini" disabled={!sel.size || pensando} onClick={() => perguntarRapido("Resuma estas mensagens e diga o que precisa ser feito.", Array.from(sel))}>🤖 Resumir</button>
                      <button className="mini" disabled={!sel.size || pensando} onClick={() => perguntarRapido("Sugira a minha resposta para estas mensagens.", Array.from(sel))}>✍️ Sugerir resposta</button>
                      <button className="mini" disabled={!sel.size} onClick={tarefaDaSelecao}>📌 Criar tarefa</button>
                      <button className="mini" disabled={!sel.size} onClick={() => setSetor(true)}>➡️ Setor</button>
                      <button className="mini sec" onClick={() => { setSelecionando(false); setSel(new Set()); }}>Cancelar</button>
                    </div>}
                    {!selecionando && !ativo.ultima_msg_de_mim && (conv?.sugestao || conv?.resumo) && dispensada !== (conv?.sugestao_em || "x") && <div style={{ background: "#f3f8ff", border: "1px solid #d6e4fb", borderRadius: 8, padding: "7px 10px" }}>
                      {conv?.resumo && <div className="small muted">🤖 {conv.resumo}</div>}
                      {conv?.sugestao && <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 4 }}>
                        <div style={{ flex: 1, whiteSpace: "pre-wrap", fontSize: 13.5 }}><span className="small muted">💡 Sugestão: </span>{conv.sugestao}</div>
                        <div className="acoes" style={{ flexWrap: "nowrap" }}>
                          <button className="mini" onClick={() => { setTexto(conv.sugestao); setDispensada(conv.sugestao_em || "x"); }}>Usar</button>
                          <button className="mini sec" title="Gerar outra" disabled={sugerindo} onClick={() => sugerir()}>{sugerindo ? "…" : "↻"}</button>
                          <button className="mini sec" title="Dizer como quer responder" onClick={() => setInstrucao("")}>✏️</button>
                          <button className="mini sec" title="Esconder" onClick={() => setDispensada(conv.sugestao_em || "x")}>✕</button>
                        </div>
                      </div>}
                      {!conv?.sugestao && <button className="mini" style={{ marginTop: 4 }} disabled={sugerindo} onClick={() => sugerir()}>{sugerindo ? "Pensando…" : "💡 Sugerir resposta"}</button>}
                      {instrucao !== null && <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <input value={instrucao} onChange={e => setInstrucao(e.target.value)} placeholder="Ex.: diz que envio amanhã de manhã e pede o CNPJ" autoFocus
                          onKeyDown={e => { if (e.key === "Enter") sugerir(instrucao); }} />
                        <button className="mini" disabled={sugerindo || !instrucao.trim()} onClick={() => sugerir(instrucao)}>Gerar</button>
                      </div>}
                    </div>}
                    {citada && <div className="small" style={{ display: "flex", gap: 8, alignItems: "center", borderLeft: "3px solid var(--laranja)", background: "var(--paper)", padding: "4px 8px", borderRadius: 6 }}>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>↩ Respondendo {citada.de_mim ? "você" : (citada.autor || "contato")}: {semMarcador(citada.texto) || "[mídia]"}</span>
                      <button className="linkbtn" onClick={() => setCitada(null)}>✕</button></div>}
                    {arquivos.length > 0 && <div className="small" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {arquivos.map((f, i) => <span key={i} className="chip">{f.type.startsWith("image") ? "🖼️" : f.type.includes("pdf") ? "📄" : "📎"} {f.name} <span className="muted">{f.size < 1048576 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1048576).toFixed(1).replace(".", ",")} MB`}</span>{f.size > MAX_ARQ && <b style={{ color: "var(--vermelho)" }}> grande demais</b>}
                        <button className="linkbtn" onClick={() => setArquivos(a => a.filter((_, k) => k !== i))}>✕</button></span>)}
                      <span className="muted">O texto vai como legenda do primeiro arquivo.</span></div>}
                    {gravando
                      ? <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ color: "var(--vermelho)", fontWeight: 700 }}>● Gravando {Math.floor(segGravando / 60)}:{String(segGravando % 60).padStart(2, "0")}</span>
                          <div style={{ flex: 1 }} />
                          <button className="sec" onClick={() => pararGravacao(true)}>Cancelar</button>
                          <button className="ok" onClick={() => pararGravacao(false)}>Enviar áudio</button>
                        </div>
                      : <div style={{ display: "flex", gap: 8 }}
                          onDragOver={e => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
                          onDrop={e => { if (e.dataTransfer.files?.length) { e.preventDefault(); adicionarArquivos(e.dataTransfer.files); } }}>
                          <button type="button" className="sec" title="Anexar foto, PDF ou arquivo (até 3 MB)" onClick={() => inputArq.current?.click()}>📎</button>
                          <input ref={inputArq} type="file" multiple hidden onChange={e => { adicionarArquivos(e.target.files); e.target.value = ""; }} />
                          <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2}
                            onPaste={e => { if (e.clipboardData.files?.length) { e.preventDefault(); adicionarArquivos(e.clipboardData.files); } }}
                            placeholder={arquivos.length ? "Legenda (opcional)…" : `Mensagem pelo ${rotuloCx(ativo.instancia)}… (Enter envia · Shift+Enter quebra linha · Win+. emojis)`}
                            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                            style={{ flex: 1, minHeight: 44, resize: "none" }} />
                          {texto.trim() || arquivos.length
                            ? <button onClick={enviar} disabled={enviando}>{enviando ? "Enviando…" : arquivos.length ? `Enviar ${arquivos.length}` : "Enviar"}</button>
                            : <button className="sec" title="Gravar áudio" onClick={iniciarGravacao} disabled={enviando}>{enviando ? "…" : "🎤"}</button>}
                        </div>}
                  </>}
                {aviso && <p className="small" style={{ color: aviso.startsWith("Não") || aviso.startsWith("IA:") ? "var(--vermelho)" : "var(--verde)", margin: 0 }}>{aviso}</p>}
              </div>
            </>
          )}
        </div>

        {/* coluna 4: IA e tarefas */}
        {ativo && (
          <div className={"dg-col4" + (mostrarIA ? " aberta" : "")}>
            <div className="dg-ia-cab"><b>Assistente</b><button className="sec mini" onClick={() => setMostrarIA(false)}>fechar</button></div>
            {conv?.resumo && <div className="trecho" style={{ fontStyle: "normal" }}>🤖 {conv.resumo}</div>}
            {conv?.ia_erro && <div className="aviso erro small" style={{ marginTop: 6 }}>{conv.ia_erro}</div>}

            <b className="small" style={{ display: "block", marginTop: 12 }}>Tarefas desta conversa</b>
            {!tarefas.length && <p className="muted small" style={{ margin: "4px 0" }}>Nenhuma tarefa aberta.</p>}
            {tarefas.map(t => (
              <div key={t.id} className="tarefa-mini">
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span className={`selo ${t.tipo}`}>{t.tipo === "promessa" ? "Prometi" : t.tipo === "reuniao" ? "Reunião" : t.tipo === "pedido" ? "Pedido" : "Anotação"}</span>
                  {t.categoria === "pessoal" && <span className="selo pessoal">🏠</span>}
                </div>
                <div style={{ fontWeight: 600, margin: "3px 0" }}>{t.titulo}</div>
                {t.prazo && <div className="muted small">⏰ {hora(t.prazo)}</div>}
                <div className="acoes" style={{ marginTop: 4 }}>
                  <button className="mini ok" onClick={() => acaoTarefa(t.id, "feita")}>✓ Feito</button>
                  <button className="mini sec" onClick={() => acaoTarefa(t.id, "descartada")}>Descartar</button>
                </div>
              </div>
            ))}
            <div className="acoes" style={{ marginTop: 6 }}>
              <button className="mini" onClick={analisar} disabled={analisando}>{analisando ? "Analisando…" : "🤖 Procurar tarefas agora"}</button>
              <button className="mini" onClick={() => setSetor(true)} title="Abre chamado no Acessórias com o que o cliente pediu">➡️ Mandar pro setor</button>
            </div>

            <div style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 10 }}>
              <b className="small">Conversar com a IA</b>
              <div className="acoes" style={{ margin: "4px 0 6px" }}>
                <button className="mini" onClick={() => perguntarRapido("Sugira a minha resposta para a última mensagem.")} disabled={pensando}>✍️ Sugerir resposta</button>
                <button className="mini sec" onClick={() => perguntarRapido("O que a pessoa está pedindo? Resuma em 2 linhas.")} disabled={pensando}>O que ela quer?</button>
              </div>
              <div className="ia-chat">
                {chat.map((c, i) => c.role === "assistant" && !c.content.startsWith("⚠️")
                  ? <BolhaIA key={i} texto={c.content} aoUsar={(m) => { setTexto(m); setMostrarIA(false); }} />
                  : <div key={i} className={"ia-bolha " + c.role}><div style={{ whiteSpace: "pre-wrap" }}>{c.content}</div></div>)}
                {pensando && <div className="ia-bolha assistant muted">pensando…</div>}
              </div>
              <div className="acoes" style={{ marginTop: 6, flexWrap: "nowrap" }}>
                <textarea value={pergunta} onChange={e => setPergunta(e.target.value)} rows={2} placeholder="Pergunte algo sobre esta conversa…"
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); perguntar(); } }} style={{ flex: 1, resize: "vertical", minHeight: 44 }} />
                <button className="mini" onClick={() => perguntar()} disabled={pensando || !pergunta.trim()}>Enviar</button>
              </div>
              {chat.length > 0 && <button className="linkbtn small" onClick={() => setChat([])}>limpar conversa</button>}
            </div>
          </div>
        )}
      </div>

      {visor && (() => {
        const link = `/api/chat/midia?id=${visor.id}`;
        const i = midiasVisor.findIndex(m => m.id === visor.id);
        const ehPdf = (visor.midia_mime || "").includes("pdf");
        const legenda = semMarcador(visor.texto);
        return <div className="visor-fundo" onClick={e => { if (e.target === e.currentTarget) setVisor(null); }}>
          <div className="visor-topo">
            <span>{visor.de_mim ? "Você" : (visor.autor || ativo?.nome)} · {hora(visor.enviada_em)}{midiasVisor.length > 1 ? ` · ${i + 1} de ${midiasVisor.length}` : ""}</span>
            <div style={{ flex: 1 }} />
            <a className="visor-btn" href={`${link}&baixar=1`}>⬇ Baixar</a>
            <button className="visor-btn" onClick={() => { setCitada(visor); setVisor(null); }}>↩ Responder</button>
            <button className="visor-btn" onClick={() => setVisor(null)}>✕</button>
          </div>
          {i > 0 && <button className="visor-seta esq" onClick={() => moverVisor(-1)}>‹</button>}
          {ehPdf
            ? <iframe src={link} className="visor-pdf" title={visor.midia_nome || "PDF"} />
            : <img src={link} alt="" className="visor-img" onClick={e => e.stopPropagation()} />}
          {i < midiasVisor.length - 1 && <button className="visor-seta dir" onClick={() => moverVisor(1)}>›</button>}
          {legenda && <div className="visor-legenda">{legenda}</div>}
        </div>;
      })()}

      {setor && ativoId && <MandarSetor conversaId={ativoId}
        midias={(msgs || []).filter(m => m.tem_midia && (!sel.size || sel.has(m.id))).slice(-15).reverse().map(m => ({ id: m.id, nome: `${m.tipo === "imagem" ? "📷" : m.tipo === "audio" ? "🎤" : "📄"} ${m.midia_nome || m.tipo} · ${hora(m.enviada_em)}` }))}
        onFechar={(msg) => { setSetor(false); if (msg) { setAviso(msg); setSelecionando(false); setSel(new Set()); } }} />}

      {modalNova && <div className="modal-fundo" onClick={e => { if (e.target === e.currentTarget) setModalNova(false); }}>
        <div className="modal-caixa">
          <b style={{ fontSize: 16 }}>Nova conversa</b>
          <label style={{ marginTop: 10 }}>Enviar pelo número
            <select value={nova.instancia} onChange={e => setNova({ ...nova, instancia: e.target.value })}>
              {conexoes.map(c => <option key={c} value={c}>{rotuloCx(c)}</option>)}
            </select></label>
          <label style={{ marginTop: 8 }}>Telefone (DDD + número)<input value={nova.numero} onChange={e => setNova({ ...nova, numero: e.target.value })} placeholder="21 99999-9999" /></label>
          <label style={{ marginTop: 8 }}>Nome (opcional)<input value={nova.nome} onChange={e => setNova({ ...nova, nome: e.target.value })} /></label>
          <label style={{ marginTop: 8 }}>Primeira mensagem (opcional)<textarea value={nova.texto} onChange={e => setNova({ ...nova, texto: e.target.value })} rows={3} /></label>
          {aviso && <p className="small" style={{ color: "var(--vermelho)" }}>{aviso}</p>}
          <div className="acoes" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <button className="sec" onClick={() => setModalNova(false)}>Cancelar</button>
            <button onClick={criarNova} disabled={!nova.numero.trim()}>Abrir conversa</button>
          </div>
        </div>
      </div>}
    </>
  );
}
