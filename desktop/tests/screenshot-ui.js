const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "screenshots");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeWindow(file) {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "screenshot-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
    },
  });
  await win.loadFile(path.join(ROOT, file));
  await wait(350);
  return win;
}

async function capture(win, name) {
  const image = await win.webContents.capturePage();
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), image.toPNG());
}

async function click(win, selector) {
  await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)})?.click()`);
  await wait(160);
}

async function renderNfSamples(win) {
  await win.webContents.executeJavaScript(`
    window.dispatchEvent(new Event('resize'));
    const trainTab = document.querySelector('[data-view="train"]');
    trainTab.click();
    window.dispatchEvent(new Event('resize'));
  `);
  await click(win, "#startTrainBtn");
  await wait(180);
  await capture(win, "nf-train.png");
  await click(win, "#browseProtocolBtn");
  await wait(100);
  await capture(win, "nf-protocol-picker.png");
  await click(win, "#closeProtocolDialogBtn");
  await click(win, '[data-view="programs"]');
  await wait(100);
  await capture(win, "nf-programs.png");
  await click(win, "#runProgramBtn");
  await wait(500);
  await capture(win, "nf-programs-run.png");
  await click(win, '[data-view="progress"]');
  await click(win, "#analyzeProgressBtn");
  await wait(100);
  await capture(win, "nf-progress.png");
  await click(win, '[data-view="baseline"]');
  await capture(win, "nf-baseline.png");
}

async function renderClinicalSamples(win) {
  await win.webContents.executeJavaScript(`
    const sample = {
      metrics: [
        { location: 'O1', metric: 'Theta/Beta ratio', value: 2.6, normal_range: '<=2.2', status: 'OUT_OF_RANGE', probe: 'Sleep onset / rumination?' },
        { location: 'Cz', metric: 'SMR amplitude', value: 5.1, normal_range: '>=4', status: 'IN_RANGE' },
        { location: 'Fz', metric: 'HiBeta/Beta ratio', value: 0.62, normal_range: '0.45-0.55', status: 'OUT_OF_RANGE', probe: 'Tension / worry?' },
        { location: 'F3', metric: 'Theta/Alpha', value: 1.4, normal_range: '1.2-1.6', status: 'IN_RANGE' },
        { location: 'F4', metric: 'Theta/Alpha', value: 1.9, normal_range: '1.2-1.6', status: 'OUT_OF_RANGE', probe: 'Right frontal activation?' }
      ]
    };
    window.renderResults ? window.renderResults(sample, 'screenshot sample') : null;
    document.querySelector('.results')?.scrollIntoView();
    window.dispatchEvent(new Event('resize'));
  `);
  await wait(250);
  await capture(win, "clinicalq-headmap.png");
}

async function main() {
  await app.whenReady();
  const nf = await makeWindow("nf.html");
  await renderNfSamples(nf);
  nf.close();

  const clinical = await makeWindow("index.html");
  await renderClinicalSamples(clinical);
  clinical.close();
  app.quit();
}

main().catch((err) => {
  console.error(err);
  app.exit(1);
});
