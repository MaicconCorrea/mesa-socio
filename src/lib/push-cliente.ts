// (roda no navegador) Liga os avisos push deste aparelho
function chaveParaBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
export async function statusPush(): Promise<"ligado" | "desligado" | "bloqueado" | "sem-suporte"> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "sem-suporte";
  if (Notification.permission === "denied") return "bloqueado";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "ligado" : "desligado";
}
export async function ligarPush(): Promise<string | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "Este navegador não aceita avisos. No iPhone: instale a Mesa na tela inicial primeiro.";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "Avisos bloqueados — libere nas configurações do navegador para este site.";
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const { chave } = await fetch("/api/push/chave").then(r => r.json());
  if (!chave) return "Falta VAPID_PUBLIC_KEY na Vercel (copie do Painel DP).";
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chave) });
  const aparelho = /Android|iPhone|iPad/i.exec(navigator.userAgent)?.[0] || (navigator.userAgent.includes("Windows") ? "Windows" : "Computador");
  const r = await fetch("/api/push/assinar", { method: "POST", body: JSON.stringify({ subscription: sub.toJSON(), aparelho }) }).then(r => r.json());
  return r.erro || null;
}
export async function desligarPush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await fetch("/api/push/assinar", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
}
