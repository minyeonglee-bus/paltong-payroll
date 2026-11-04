// Minimal service worker so the app can be installed ("Add to Home Screen").
// Always goes to the network — payroll data must never be stale.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
// 사장님 승인 알림 (웹 푸시) — 휴가 신청 · 출퇴근 사유 · 가불 · 캐시북 현금 부족 · 매일 승인 대기 요약
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "빨통 급여", {
    body: d.body || "", tag: d.tag || "pr", renotify: true,
    icon: "/icon-192.png", badge: "/icon-192.png", vibrate: [300, 120, 300],
    data: { url: d.url || "/" } }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if (new URL(c.url).origin === self.location.origin) { c.focus(); c.postMessage({ type: "pr-open" }); return; } }
    return self.clients.openWindow(url);
  }));
});
