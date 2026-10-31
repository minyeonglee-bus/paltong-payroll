// Minimal service worker so the app can be installed ("Add to Home Screen").
// Always goes to the network — payroll data must never be stale.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
