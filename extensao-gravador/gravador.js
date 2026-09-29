// Janela de gravação: som da aba + microfone → pedaços de áudio → Mesa (transcreve) → no fim, resumo e tarefas
const p = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const titulo = p.get("titulo") || "Reunião";
$("titulo").textContent = titulo;
document.title = "🔴 " + titulo;

let reuniaoId, segundosPedaco = 55, recorder, mix, ctx, streams = [], n = 0, inicio, parando = false;
const fila = []; let enviando = false, enviados = 0, falhas = 0;
const status = (t) => ($("status").textContent = t);

const api = (caminho, opts = {}) => mesa(caminho, opts, false);

async function comecar() {
  // 1) som da aba
  const aba = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: p.get("stream") } }, video: false });
  streams.push(aba);
  ctx = new AudioContext();
  const destino = ctx.createMediaStreamDestination();
  const fonteAba = ctx.createMediaStreamSource(aba);
  fonteAba.connect(destino);
  fonteAba.connect(ctx.destination); // você continua ouvindo a reunião
  // 2) microfone (se permitir)
  try {
    const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    streams.push(mic);
    ctx.createMediaStreamSource(mic).connect(destino);
  } catch { status("Sem microfone — gravando só o som da reunião."); }
  mix = destino.stream;
  // 3) cria a reunião na Mesa
  const r = await api("/api/ext/iniciar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo, setor: p.get("setor") }) });
  reuniaoId = r.id; segundosPedaco = r.segundosPedaco || 55;
  document.getElementById("titulo").textContent = `${titulo} · ${r.setor?.nome || ""}`;
  await chrome.storage.local.set({ gravando: { titulo, id: reuniaoId } });
  inicio = Date.now();
  setInterval(() => { const s = Math.floor((Date.now() - inicio) / 1000); $("tempo").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }, 1000);
  novoPedaco();
}

// Cada pedaço é um arquivo completo (para/recomeça o gravador) → a Mesa transcreve na hora
function novoPedaco() {
  if (parando) return;
  const tipo = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
  const partes = [];
  recorder = new MediaRecorder(mix, { mimeType: tipo, audioBitsPerSecond: 32000 });
  const meu = n++;
  recorder.ondataavailable = (e) => e.data.size && partes.push(e.data);
  recorder.onstop = () => { fila.push({ n: meu, blob: new Blob(partes, { type: "audio/webm" }) }); enviarFila(); if (!parando) novoPedaco(); };
  recorder.start();
  status(`Gravando… ${enviados} trecho(s) já transcrito(s)${falhas ? ` · ${falhas} falha(s)` : ""}`);
  setTimeout(() => { if (recorder && recorder.state === "recording" && !parando) recorder.stop(); }, segundosPedaco * 1000);
}

async function enviarFila() {
  if (enviando) return; enviando = true;
  while (fila.length) {
    const item = fila[0];
    let ok = false;
    for (let t = 0; t < 3 && !ok; t++) {
      try { await api(`/api/ext/pedaco?id=${reuniaoId}&n=${item.n}`, { method: "POST", headers: { "Content-Type": "audio/webm" }, body: item.blob }); ok = true; }
      catch (e) { await new Promise((r) => setTimeout(r, 3000)); if (t === 2) { falhas++; } }
    }
    if (ok) enviados++;
    fila.shift();
    if (!parando) status(`Gravando… ${enviados} trecho(s) já transcrito(s)${falhas ? ` · ${falhas} falha(s)` : ""}`);
  }
  enviando = false;
}

async function parar() {
  if (parando) return; parando = true;
  $("parar").disabled = true;
  status("Enviando o último trecho…");
  // parar o gravador dispara o onstop do pedaço atual, que entra na fila (e não recomeça, porque parando = true)
  if (recorder && recorder.state === "recording") {
    await new Promise((res) => { const antes = recorder.onstop; recorder.onstop = (ev) => { antes && antes(ev); res(); }; recorder.stop(); });
  }
  streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
  while (fila.length || enviando) { await enviarFila(); await new Promise((r) => setTimeout(r, 500)); }
  status("🤖 A IA está lendo a reunião…");
  try {
    const r = await api("/api/ext/finalizar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: reuniaoId, titulo }) });
    status(`Pronto! Resumo e ${r.criadas} tarefa(s) já estão no painel do setor.`);
  } catch (e) { status("Erro: " + e.message); }
  await chrome.storage.local.remove("gravando");
}

$("parar").onclick = parar;
chrome.runtime.onMessage.addListener((m) => { if (m?.tipo === "parar") parar(); });
window.addEventListener("beforeunload", (e) => { if (!parando) { e.preventDefault(); e.returnValue = ""; } });
comecar().catch(async (e) => { status("Não consegui começar: " + (e.message || e)); $("parar").disabled = true; await chrome.storage.local.remove("gravando"); });
