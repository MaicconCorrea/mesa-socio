// Login com a conta Google da Outtax (sem senha, sem chave). Usado pelo popup e pela janela de gravação.
// v2.1 (virada): a Mesa mudou para o Painel Outtax. O endereço em uso fica em chrome.storage ("mesaUrl").
// Começa na Mesa antiga; quando ela responder "mudouPara" (MESA_REDIRECIONAR_PARA no mesa-socio), a extensão
// passa a usar o portal sozinha. Só aceita os endereços abaixo (os mesmos de host_permissions no manifest.json).
const MESA_ANTIGA = "https://mesa-socio.vercel.app";
const ENDERECOS_ACEITOS = [MESA_ANTIGA, "https://painel-outtax.vercel.app"];

async function mesaBase() {
  const { mesaUrl } = await chrome.storage.local.get(["mesaUrl"]);
  return ENDERECOS_ACEITOS.includes(mesaUrl) ? mesaUrl : MESA_ANTIGA;
}

async function lerConfig() {
  let base = await mesaBase();
  let cfg = await fetch(base + "/api/ext/config").then((r) => r.json());
  if (cfg.mudouPara && cfg.mudouPara !== base && ENDERECOS_ACEITOS.includes(cfg.mudouPara)) {
    base = cfg.mudouPara;
    await chrome.storage.local.set({ mesaUrl: base });
    cfg = await fetch(base + "/api/ext/config").then((r) => r.json()).catch(() => cfg);
  }
  return cfg;
}

async function pegarToken(interativo) {
  const { tk, tkExp, email } = await chrome.storage.local.get(["tk", "tkExp", "email"]);
  if (tk && tkExp > Date.now() + 120000) return tk;
  const cfg = await lerConfig();
  if (!cfg.clientId) throw new Error("A Mesa ainda não tem o login Google configurado (EXT_OAUTH_CLIENT_ID).");
  const q = new URLSearchParams({
    client_id: cfg.clientId, response_type: "token", redirect_uri: chrome.identity.getRedirectURL(),
    scope: "openid email profile", hd: "outtax.com.br", ...(email ? { login_hint: email } : {}),
    ...(interativo ? { prompt: email ? "consent" : "select_account" } : { prompt: "none" }),
  });
  const volta = await chrome.identity.launchWebAuthFlow({ url: "https://accounts.google.com/o/oauth2/v2/auth?" + q, interactive: !!interativo });
  const p = new URLSearchParams(new URL(volta).hash.slice(1));
  const token = p.get("access_token");
  if (!token) throw new Error(p.get("error") || "Login não concluído.");
  await chrome.storage.local.set({ tk: token, tkExp: Date.now() + Number(p.get("expires_in") || 3600) * 1000 });
  return token;
}

async function mesa(caminho, opts = {}, interativo = false) {
  let token;
  try { token = await pegarToken(false); } catch { token = await pegarToken(interativo); }
  const r = await fetch((await mesaBase()) + caminho, { ...opts, headers: { Authorization: "Bearer " + token, ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { await chrome.storage.local.remove(["tk", "tkExp"]); }
  if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
  return j;
}
