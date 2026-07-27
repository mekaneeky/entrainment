const path = require("path");
process.env.NODE_PATH = path.resolve(__dirname, "../desktop/node_modules");
require("module").Module._initPaths();
const { app, BrowserWindow, session } = require("electron");
const fs = require("fs");
const http = require("http");

const ROOT = path.resolve(__dirname, "..");
const SHOTS = path.join(__dirname, "screenshots");
const MIME = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

function assert(condition, message) { if (!condition) throw new Error(message); }
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "");
      let file = path.resolve(ROOT, relative || "consumer-app/index.html");
      if (!file.startsWith(`${ROOT}${path.sep}`)) { response.writeHead(403).end(); return; }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
      if (!fs.existsSync(file)) { response.writeHead(404).end(); return; }
      response.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
      fs.createReadStream(file).pipe(response);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function run(win, source) {
  try { return await win.webContents.executeJavaScript(source); }
  catch (error) { throw new Error(`${error.message}\nRenderer source: ${source}`); }
}
async function click(win, selector) {
  const found = await run(win, `(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; node.click(); return true; })()`);
  assert(found, `Missing click target: ${selector}`);
  await wait(80);
}
async function screen(win, expected) {
  const actual = await run(win, `document.querySelector('[data-screen]:not([hidden])')?.dataset.screen`);
  assert(actual === expected, `Expected ${expected}, got ${actual}`);
}
async function capture(win, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  win.webContents.invalidate();
  await wait(220);
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SHOTS, name), image.toPNG());
}

async function main() {
  app.disableHardwareAcceleration();
  await app.whenReady();
  const server = await serve();
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/consumer-app/`;
  const partition = `listening-room-test-${Date.now()}`;
  const win = new BrowserWindow({
    width: 390,
    height: 844,
    show: false,
    webPreferences: { partition, offscreen: true, backgroundThrottling: false },
  });
  win.webContents.on("console-message", (_event, _level, message) => console.log(`renderer: ${message}`));
  await win.loadURL(url);
  await wait(500);
  await screen(win, "welcome");
  await capture(win, "welcome.png");
  const accessibility = await run(win, `(() => ({
    unnamedButtons: [...document.querySelectorAll('button')].filter((node) => !node.textContent.trim() && !node.getAttribute('aria-label')).length,
    unlabeledControls: [...document.querySelectorAll('input:not([type="file"]), textarea, select')].filter((node) => !node.getAttribute('aria-label') && !node.getAttribute('aria-labelledby') && !document.querySelector('label[for="' + node.id + '"]')).length,
  }))()`);
  assert(accessibility.unnamedButtons === 0 && accessibility.unlabeledControls === 0, "Interactive controls need accessible names");

  await click(win, '[data-screen="welcome"] [data-nav="safety"]');
  await screen(win, "safety");
  await capture(win, "safety.png");
  await click(win, '[data-screen="safety"] [data-nav="setup"]');
  await screen(win, "setup");
  await capture(win, "setup.png");
  assert(await run(win, `getComputedStyle(document.querySelector('[data-screen="setup"] .back')).display !== 'none'`), "Setup must keep a visible way back");
  assert(await run(win, `document.querySelector('#setup-title').getBoundingClientRect().bottom < document.querySelector('[data-screen="setup"] .lead').getBoundingClientRect().top`), "Setup heading and support copy must not collide");
  await run(win, `
    document.querySelector('#goal-label').value = 'Feel calmer';
    document.querySelector('#goal-question').value = 'How calm do you feel right now?';
    document.querySelector('#low-label').value = 'Not calm';
    document.querySelector('#high-label').value = 'Very calm';
  `);
  await click(win, '#continue-goal');
  await screen(win, "measure");
  await capture(win, "measure.png");
  await run(win, `document.querySelector('#goal-form').requestSubmit()`);
  await wait(100);
  await screen(win, "home");
  const homeLayout = await run(win, `(() => { const mark = document.querySelector('.room-button'); const rect = mark.getBoundingClientRect(); return { immersive: document.querySelector('.app-shell').classList.contains('immersive-mode'), globalHeader: Boolean(document.querySelector('.app-header')), markRect: [rect.x, rect.y, rect.width, rect.height], scrollY }; })()`);
  assert(!homeLayout.immersive && !homeLayout.globalHeader && homeLayout.markRect[2] >= 44, "Home must use the quiet in-room mark, not global app chrome");
  assert(homeLayout.scrollY === 0, `Home opened scrolled to ${homeLayout.scrollY}`);
  assert((await run(win, `window.__listeningRoom.store.load().goals[0].question`)) === "How calm do you feel right now?", "Tracking question was not persisted");
  await capture(win, "home.png");

  await click(win, '.begin-session[data-nav="before"]');
  await run(win, `
    const slider = document.querySelector('#before-rating');
    slider.value = '4'; slider.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#before-note').value = 'Shoulders feel tight';
  `);
  await click(win, "#save-before");
  await screen(win, "plan");
  assert((await run(win, `[...document.querySelector('#profile-select').options].some((option) => option.value === 'example-cycle')`)), "Built-in profiles were not loaded");
  await capture(win, "plan.png");
  await run(win, `
    (() => {
      const custom = {
        format: 'entrainment-profile', version: 1, method: 'hemispheric', id: 'test-cycle', name: 'Test cycle',
        description: 'Two-second silent hemispheric integration profile.', masterVolume: 0, rampSec: 0.01,
        channels: {
          left: { segments: [{ durationSec: 2, carrierHz: 210, pulseHz: 10, phaseDeg: 0 }] },
          right: { delaySec: 0.2, segments: [{ durationSec: 2, carrierHz: 240, pulseHz: 7, phaseDeg: 180 }] },
        },
      };
      const input = document.querySelector('#profile-file');
      Object.defineProperty(input, 'files', { configurable: true, value: [new File([JSON.stringify(custom)], 'test.json', { type: 'application/json' })] });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })();
  `);
  await wait(100);
  assert((await run(win, `document.querySelector('#profile-select').selectedOptions[0]?.textContent`)) === "Test cycle", "Custom profile file was not imported and selected");
  await run(win, `document.querySelector('#toast').classList.remove('visible')`);
  await click(win, '[data-screen="plan"] [data-nav="prepare"]');
  await screen(win, "prepare");
  await capture(win, "prepare.png");

  await click(win, "#start-session");
  await screen(win, "listening");
  assert(await run(win, `(() => { const tone = window.__listeningRoom.runner.tone; return Boolean(tone.ctx && tone.merger && tone.channels.left.osc && tone.channels.right.osc && tone.channels.left.gate && tone.channels.right.gate && tone.channels.left.carrierHz === 210 && tone.channels.right.carrierHz === 240 && tone.channels.right.phaseDeg === 180 && tone.channels.right.startDelaySec === 0.2); })()`), "Independent left/right Web Audio graph or delayed phase schedule was not created");
  assert(await run(win, `document.querySelector('#listening-title').getBoundingClientRect().bottom <= document.querySelector('.signal-method').getBoundingClientRect().top`), "Session name and method label must not overlap");
  await capture(win, "listening.png");
  await click(win, "#end-session");
  await screen(win, "return");
  await capture(win, "return.png");
  await click(win, "#return-checkin");
  await screen(win, "after");
  await capture(win, "after.png");
  await run(win, `
    const afterSlider = document.querySelector('#after-rating');
    afterSlider.value = '7'; afterSlider.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#after-note').value = 'Breathing feels easier';
  `);
  await click(win, "#save-after");
  await screen(win, "result");
  await capture(win, "result.png");
  assert(await run(win, `document.querySelector('[data-screen="result"] .screen-actions').getBoundingClientRect().bottom <= innerHeight`), "Result actions must fit in the first phone viewport");
  const saved = await run(win, `window.__listeningRoom.store.load()`);
  assert(saved.sessions.length === 1, "Session was not saved exactly once");
  assert(saved.sessions[0].before[saved.goals[0].id] === 4, "Before rating was not saved");
  assert(saved.sessions[0].after[saved.goals[0].id] === 7, "After rating was not saved");
  assert(saved.sessions[0].beforeNote === "Shoulders feel tight" && saved.sessions[0].afterNote === "Breathing feels easier", "Session notes were not saved");

  await run(win, `(() => {
    const app = window.__listeningRoom;
    const saved = app.store.load();
    const goal = saved.goals[0];
    const profile = saved.profiles[0];
    for (const [id, days, before, after] of [['older', 20, 3, 5], ['recent', 9, 5, 6]]) {
      const ended = new Date(Date.now() - days * 86400000);
      app.store.recordSession({ id: 'session_' + id, profileId: profile.id, startedAt: new Date(ended - 600000).toISOString(), endedAt: ended.toISOString(), status: 'completed', before: { [goal.id]: before }, after: { [goal.id]: after } });
    }
  })()`);

  await click(win, '[data-screen="result"] [data-nav="progress"]');
  await screen(win, "progress");
  assert((await run(win, `document.querySelectorAll('#progress-points circle').length`)) === 3, "Stored progress was not drawn");
  assert(await run(win, `document.querySelector('#progress-path').getAttribute('d').includes('C')`), "Progress thread must use the approved flowing signal path");
  assert((await run(win, `document.querySelectorAll('#progress-before-points circle, #progress-change-lines line').length`)) === 6, "Before/after session context was not drawn");
  assert(await run(win, `getComputedStyle(document.querySelector('#progress-empty-line')).display === 'none'`), "The dormant empty-state thread must disappear when real data exists");
  await capture(win, "progress.png");
  await click(win, '#main-nav [data-nav="sessions"]');
  assert((await run(win, `document.querySelectorAll('.session-row').length`)) === 3, "Session history was not rendered");
  assert((await run(win, `scrollY`)) === 0, "Session history must open at the top");
  assert(await run(win, `(() => { const box = document.querySelector('[data-screen="sessions"] .screen-heading').getBoundingClientRect(); return scrollX === 0 && box.left >= 20 && box.top >= 20 && document.documentElement.scrollWidth === innerWidth; })()`), "Session history must not clip or scroll sideways");
  await capture(win, "sessions.png");

  for (const width of [320, 430]) {
    win.setSize(width, 844);
    for (const name of ["home", "progress", "sessions"]) {
      await run(win, `window.__listeningRoom.navigate(${JSON.stringify(name)}, false)`);
      assert(await run(win, `scrollX === 0 && document.documentElement.scrollWidth === innerWidth`), `${name} must fit a ${width}px phone without sideways scrolling`);
    }
  }
  win.setSize(390, 844);

  await run(win, `navigator.serviceWorker.ready.then(() => true)`);
  if (!(await run(win, `Boolean(navigator.serviceWorker.controller)`))) {
    await win.reload();
    await wait(500);
  }
  assert(await run(win, `Boolean(navigator.serviceWorker.controller)`), "Service worker did not control the app");
  await new Promise((resolve) => server.close(resolve));
  await win.reload();
  await wait(500);
  assert((await run(win, `document.querySelector('.room-mark span')?.textContent`)) === "Listening Room", "Offline shell did not reload from cache");

  win.close();
  await session.fromPartition(partition).clearStorageData();
  console.log("consumer app end-to-end checks passed");
  app.quit();
}

main().catch((error) => {
  console.error(error);
  app.exit(1);
});
