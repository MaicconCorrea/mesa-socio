const $ = (id) => document.getElementById(id);
const mostrar = (id) => ["config", "pronto", "gravando"].forEach((x) => ($(x).hidden = x !== id));
const msg = (t, erro) => ($("msg").innerHTML = t ? `<div class="aviso ${erro ? "erro" : ""}">${t}</div>` : "");

async function iniciar() {
  const { url, chave, gravando } = await chrome.storage.local.get(["url", "chave", "gravando"]);
  if (!chave) { mostrar("config"); if (url) $("url").value = url; return; }
  if (gravando) { mostrar("gravando"); $("tituloG").textContent = gravando.titulo; return; }
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("titulo").value = (aba?.title || "Reunião").replace(/^Meet\s*[-–]\s*/i, "").replace(/\s*[-–|]\s*(Google Meet|Zoom|Microsoft Teams).*$/i, "").slice(0, 120);
  mostrar("pronto");
}

$("salvar").onclick = async () => {
  const url = $("url").value.trim().replace(/\/+$/, ""), chave = $("chave").value.trim();
  if (!chave.startsWith("mesa_")) return msg("A chave começa com mesa_ — copie de novo na Configuração da Mesa.", true);
  await chrome.storage.local.set({ url, chave });
  msg("Salvo ✓"); iniciar();
};
$("trocar").onclick = async () => { await chrome.storage.local.remove("chave"); iniciar(); };

$("gravar").onclick = async () => {
  msg("");
  try {
    const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!aba || /^chrome/.test(aba.url || "")) return msg("Abra a aba da reunião (Meet, Zoom, Teams) e clique de novo.", true);
    // precisa ser chamado aqui (clique do usuário)
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: aba.id });
    const titulo = $("titulo").value.trim() || "Reunião";
    const q = new URLSearchParams({ stream: streamId, titulo, tab: String(aba.id) });
    await chrome.windows.create({ url: `gravador.html?${q}`, type: "popup", width: 380, height: 330, focused: true });
    window.close();
  } catch (e) { msg("Não consegui gravar esta aba: " + (e.message || e), true); }
};

$("parar").onclick = () => { chrome.runtime.sendMessage({ tipo: "parar" }); msg("Parando… a janelinha mostra o resultado."); };

iniciar();
