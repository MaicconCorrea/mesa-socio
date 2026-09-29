const $ = (id) => document.getElementById(id);
const mostrar = (id) => ["entrar", "pronto", "gravando"].forEach((x) => ($(x).hidden = x !== id));
const msg = (t, erro) => ($("msg").innerHTML = t ? `<div class="aviso ${erro ? "erro" : ""}">${t}</div>` : "");

async function iniciar() {
  const { gravando, setorPadrao } = await chrome.storage.local.get(["gravando", "setorPadrao"]);
  if (gravando) { mostrar("gravando"); $("tituloG").textContent = gravando.titulo; return; }
  let eu;
  try { eu = await mesa("/api/ext/eu"); } catch (e) { mostrar("entrar"); if (!/HTTP 401|Login|conta Google/.test(e.message)) msg(e.message, true); return; }
  await chrome.storage.local.set({ email: eu.email });
  $("ola").textContent = `Olá, ${eu.nome.split(" ")[0]}!`;
  if (!eu.setores.length) { mostrar("pronto"); $("gravar").disabled = true; return msg("Você ainda não está no grupo do seu setor no Google. Fale com o Maiccon.", true); }
  $("setor").innerHTML = eu.setores.map((s) => `<option value="${s.codigo}">${s.nome}</option>`).join("");
  if (setorPadrao && eu.setores.some((s) => s.codigo === setorPadrao)) $("setor").value = setorPadrao;
  $("caixaSetor").hidden = eu.setores.length < 2;
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("titulo").value = (aba?.title || "Reunião").replace(/^Meet\s*[-–]\s*/i, "").replace(/\s*[-–|]\s*(Google Meet|Zoom|Microsoft Teams).*$/i, "").slice(0, 120);
  mostrar("pronto");
}

$("login").onclick = async () => {
  msg("");
  try { await pegarToken(true); iniciar(); } catch (e) { msg("Não entrou: " + e.message, true); }
};

$("gravar").onclick = async () => {
  msg("");
  try {
    const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!aba || /^chrome/.test(aba.url || "")) return msg("Abra a aba da reunião (Meet, Zoom, Teams) e clique de novo.", true);
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: aba.id });
    const titulo = $("titulo").value.trim() || "Reunião";
    const setor = $("setor").value;
    await chrome.storage.local.set({ setorPadrao: setor });
    const q = new URLSearchParams({ stream: streamId, titulo, setor });
    await chrome.windows.create({ url: `gravador.html?${q}`, type: "popup", width: 380, height: 340, focused: true });
    window.close();
  } catch (e) { msg("Não consegui gravar esta aba: " + (e.message || e), true); }
};

$("parar").onclick = () => { chrome.runtime.sendMessage({ tipo: "parar" }); msg("Parando… a janelinha mostra o resultado."); };

iniciar();
