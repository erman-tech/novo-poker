# Novo Poker (online)

Kasaya karşı Novo Poker, arkadaşlarla online. Masayı açan bir kod alır, öteki oyuncular kodla katılır.

- Site: GitHub Pages (`index.html`, `js/`, `css/`)
- Sunucu: Cloudflare Worker + Durable Object (`online/worker.js`, `online/wrangler.toml`)
- Oyun mantığı: `js/novo.js` (kurallar), `online/oda.js` (masa odası: sıra, geri sayım, gizleme)
- Yerel deneme: `node online/yerel.mjs` (ws://localhost:8787) ve sayfayı localhost'tan aç
- Testler: `node --test test/`

İnternetsiz (uçak) sürüm ayrı adreste: https://erman-tech.github.io/poker-masasi/
