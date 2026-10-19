// main.ts — wiring + state
import './style.css';
import { initUI } from './ui';
import type { UIHandle } from './ui';
import { encode } from './encoder';
import type { EncodedQR } from './encoder';
import { render } from './renderer';
import type { RenderOptions } from './renderer';
import { formatPayload } from './payloads';
import { renderExport, downloadPNG, copyToClipboard, buildFilename } from './export';

const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement;
const downloadBtn = document.getElementById('download-png') as HTMLButtonElement;
const copyBtn = document.getElementById('copy-clipboard') as HTMLButtonElement;

let encoded: EncodedQR | null = null;
let raf = 0;

const ui: UIHandle = initUI(scheduleRender);

function buildOpts(): RenderOptions {
  const { settings, logo } = ui.getState();
  return {
    size: settings.size,
    margin: 4, // standards-compliant quiet zone
    fg: settings.fg,
    bg: settings.bg,
    transparentBg: settings.transparent,
    dotStyle: settings.dotStyle,
    eyeStyle: settings.eyeStyle,
    logo: logo ? { image: logo, scale: settings.logoSize / 100 } : null,
  };
}

function scheduleRender(): void {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    doRender();
  });
}

function doRender(): void {
  const { type, payload, logo } = ui.getState();
  encoded = null;

  const result = formatPayload(type, payload);
  if (!result.ok) {
    ui.setValidation(result.error);
    ui.setWarnings([]);
    ui.setExportEnabled(false);
    return;
  }

  // A logo covers modules, so force ECC level H (recovers ~30% damage); M otherwise
  const ecc = logo ? 'H' : 'M';
  let qr: EncodedQR;
  try {
    qr = encode(result.value, ecc);
  } catch (err) {
    ui.setValidation(err instanceof Error ? err.message : 'Could not encode QR code');
    ui.setWarnings([]);
    ui.setExportEnabled(false);
    return;
  }

  encoded = qr;
  ui.setValidation(null);

  const warnings = render(canvas, qr.matrix, buildOpts());

  if (logo && result.value.length > 400) {
    warnings.push('Long content plus a logo may exceed error-correction capacity — scan-test before printing.');
  }
  ui.setWarnings(warnings);
  ui.setExportEnabled(true);
}

/* ---------- export actions ---------- */

downloadBtn.addEventListener('click', async () => {
  if (!encoded) return;
  const { settings, type } = ui.getState();
  // renderExport overrides size with the chosen export size
  const offscreen = renderExport(encoded.matrix, buildOpts(), settings.exportSize as 512 | 1024 | 2048);
  await downloadPNG(offscreen, buildFilename(type));
});

copyBtn.addEventListener('click', async () => {
  if (!encoded) return;
  const { settings } = ui.getState();
  const offscreen = renderExport(encoded.matrix, buildOpts(), settings.exportSize as 512 | 1024 | 2048);
  try {
    await copyToClipboard(offscreen);
    ui.setValidation(null);
  } catch {
    ui.setValidation('Clipboard not available in this browser — use Download PNG instead.');
  }
});

doRender();

/* ---------- offline support (production only) ---------- */

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline mode is a bonus, never break the app */
    });
  });
}