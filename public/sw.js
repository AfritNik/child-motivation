self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Персональные страницы намеренно не кешируются: без сети приложение честно
// показывает ошибку браузера и не раскрывает данные предыдущего пользователя.
