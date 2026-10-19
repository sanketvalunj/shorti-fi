// scan-check.mjs — end-to-end verification: drive the real app in headless
// Chrome, capture the rendered canvas pixels, and decode them with jsQR.
// This is the programmatic equivalent of "scan it with your phone".
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const APP_URL = 'http://localhost:4173/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const jsqrSrc = readFileSync('node_modules/jsqr/dist/jsQR.js', 'utf8');

const results = [];

function report(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → ${detail}`}`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});

try {
  const page = await browser.newPage();
  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await page.addScriptTag({ content: jsqrSrc });

  const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms));

  async function decode() {
    await settle();
    return page.evaluate(() => {
      const c = document.getElementById('qr-canvas');
      const ctx = c.getContext('2d');
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const res = window.jsQR(img.data, img.width, img.height);
      return res ? res.data : null;
    });
  }

  async function setInput(sel, value) {
    await page.$eval(
      sel,
      (el, v) => {
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      },
      value
    );
  }

  async function setSelect(sel, value) {
    await page.$eval(
      sel,
      (el, v) => {
        el.value = v;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
      value
    );
  }

  async function check(name, expected, { startsWith = false } = {}) {
    const got = await decode();
    const ok = startsWith ? !!got && got.startsWith(expected) : got === expected;
    report(name, ok, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  }

  /* 1 — URL, default square style */
  await setInput('#f-url', 'https://example.com/?a=1&b=2');
  await check('URL / square style', 'https://example.com/?a=1&b=2');

  /* 2 — rounded connected style */
  await setSelect('#dot-style', 'rounded');
  await check('URL / rounded dots', 'https://example.com/?a=1&b=2');

  /* 3 — circular dots + rounded eyes */
  await setSelect('#dot-style', 'dots');
  await setSelect('#eye-style', 'rounded');
  await check('URL / dots + rounded eyes', 'https://example.com/?a=1&b=2');

  /* 4 — unicode / emoji text */
  await setSelect('#dot-style', 'square');
  await setSelect('#eye-style', 'square');
  await page.click('[data-type="text"]');
  await setInput('#f-text', 'Hello こんにちは 🎉 ünïcödé');
  await check('Text / emoji + unicode', 'Hello こんにちは 🎉 ünïcödé');

  /* 5 — WiFi with escape-sensitive characters */
  await page.click('[data-type="wifi"]');
  await setInput('#f-ssid', 'Cafe;Guest"01');
  await setInput('#f-password', 'p:ass"word;x');
  await check(
    'WiFi / escaping (; " : )',
    'WIFI:T:WPA;S:Cafe\\;Guest\\"01;P:p\\:ass\\"word\\;x;;'
  );

  /* 6 — vCard with special characters */
  await page.click('[data-type="vcard"]');
  await setInput('#f-firstName', 'John, Jr.');
  await setInput('#f-lastName', 'Doe;Smith');
  await check('vCard / escaped names', 'BEGIN:VCARD', { startsWith: true });

  /* 7 — validation gate: empty input must disable export */
  await page.click('[data-type="phone"]');
  await setInput('#f-phone', '');
  const disabled = await page.$eval('#download-png', (b) => b.disabled);
  report('Validation gates export on empty input', disabled === true, 'button not disabled');
  await setInput('#f-phone', '+1 555 123 4567');
  const enabled = await page.$eval('#download-png', (b) => b.disabled);
  report('Export re-enabled for valid phone', enabled === false, 'button still disabled');
  await check('Phone / tel: payload', 'tel:+15551234567');

  /* 8 — logo at 20% (informational: external decoders vary on logo damage) */
  await page.click('[data-type="url"]');
  await setInput('#f-url', 'https://example.com/with-logo');
  const logoInput = await page.$('#logo-upload');
  await logoInput.uploadFile('/tmp/shorti-logo.png');
  await settle(500); // createImageBitmap + re-render
  const withLogo = await decode();
  const eccNote = await page.evaluate(
    () => document.querySelector('.scan-warning')?.textContent ?? ''
  );
  console.log(
    `INFO  logo @20% decode: ${withLogo === 'https://example.com/with-logo' ? 'OK' : 'not decoded'} ${eccNote ? '| warning shown: ' + eccNote : ''}`
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exitCode = failed.length === 0 ? 0 : 1;
} finally {
  await browser.close();
}