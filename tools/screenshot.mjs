// Render the local site in headless Chrome (system install) and capture
// screenshots at iPhone width so I can actually see what the UI looks like.

import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outDir = resolve(__dirname, "shots");
await mkdir(outDir, { recursive: true });

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 8911;

console.log("Starting local server...");
const server = spawn(process.execPath, ["-e", `
  const http = require('http');
  const fs = require('fs');
  const path = require('path');
  const root = ${JSON.stringify(root)};
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  http.createServer((req, res) => {
    let p = req.url.split('?')[0];
    if (p === '/') p = '/index.html';
    const f = path.join(root, p);
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
      res.end(data);
    });
  }).listen(${PORT}, () => console.log('listening'));
`], { stdio: ["ignore", "pipe", "pipe"] });

await new Promise((ok) => server.stdout.once("data", ok));
console.log(`Server ready on http://localhost:${PORT}`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox"],
});

async function shoot(name, fn) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0" });
  // Override SW so cached old assets don't load
  await page.evaluate(async () => {
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }
  });
  await page.reload({ waitUntil: "networkidle0" });
  if (fn) await fn(page);
  await new Promise((r) => setTimeout(r, 400)); // settle animations
  const file = resolve(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`✓ ${file}`);
  await page.close();
}

// 1) Home with 400 questions all in B1 (default fresh state)
await shoot("01-home-fresh");

// 2) Home with simulated mixed mastery state
await shoot("02-home-mixed", async (page) => {
  await page.evaluate(() => {
    const progress = {};
    for (let i = 1; i <= 400; i++) {
      let box;
      if (i <= 200) box = 1;
      else if (i <= 290) box = 2;
      else if (i <= 350) box = 3;
      else if (i <= 385) box = 4;
      else box = 5;
      progress[i] = { box, lastSeenSession: 1, lastSeenAt: new Date(Date.now() - 1).toISOString(), timesCorrect: 0, timesWrong: 0 };
    }
    localStorage.setItem("quiz.v1.state", JSON.stringify({ progress, sessionCount: 5, lastSession: new Date().toISOString() }));
  });
  await page.reload({ waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800)); // wait for bar fill animation
});

// 3) Session screen (mid-question)
await shoot("03-session", async (page) => {
  await page.click("#start-btn");
  await new Promise((r) => setTimeout(r, 400));
});

// 4) Session — after answering wrong
await shoot("04-session-answered", async (page) => {
  await page.click("#start-btn");
  await new Promise((r) => setTimeout(r, 200));
  await page.click(".choice"); // click first visible choice (might be right or wrong, that's fine)
  await new Promise((r) => setTimeout(r, 600));
});

// 5) Dark mode
await (async () => {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    const progress = {};
    for (let i = 1; i <= 400; i++) {
      let box;
      if (i <= 200) box = 1;
      else if (i <= 290) box = 2;
      else if (i <= 350) box = 3;
      else if (i <= 385) box = 4;
      else box = 5;
      progress[i] = { box, lastSeenSession: 1, lastSeenAt: new Date(Date.now() - 1).toISOString(), timesCorrect: 0, timesWrong: 0 };
    }
    localStorage.setItem("quiz.v1.state", JSON.stringify({ progress, sessionCount: 5, lastSession: new Date().toISOString() }));
  });
  await page.reload({ waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));
  const file = resolve(outDir, "05-home-dark.png");
  await page.screenshot({ path: file, fullPage: true });
  console.log(`✓ ${file}`);
  await page.close();
})();

await browser.close();
server.kill();
console.log("Done.");
