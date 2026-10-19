// dom.test.ts — smoke tests: page wiring, live preview, validation, tab switching
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, vi } from 'vitest';

/** Minimal 2D context stub — records nothing, just swallows all calls. */
function stubContext(): void {
  const target: Record<string | symbol, unknown> = {};
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return () => undefined;
    },
    set(t, prop, value) {
      t[prop] = value;
      return true;
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(proxy as unknown as CanvasRenderingContext2D);
}

function loadPage(): void {
  // vitest runs from the project root
  const html = readFileSync('index.html', 'utf8');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script').forEach((s) => s.remove());
  document.body.innerHTML = parsed.body.innerHTML;
}

async function typeInto(id: string, value: string): Promise<void> {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
  expect(el, `#${id} should exist`).toBeTruthy();
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function scanWarning(): HTMLElement {
  return document.querySelector('.scan-warning') as HTMLElement;
}

describe('app wiring', () => {
  beforeAll(async () => {
    loadPage();
    stubContext();
    // Node's native (disabled) localStorage getter shadows jsdom's here —
    // re-expose jsdom's real storage so persistence works under test.
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => (globalThis as unknown as { _localStorage?: Storage })._localStorage,
    });
    // run rAF callbacks synchronously so input → render is deterministic
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    await import('../src/main');
  });

  it('renders an empty-input validation error on startup', () => {
    const msg = document.querySelector('.validation-message')!;
    expect(msg.textContent).toBe('URL cannot be empty');
    expect((document.getElementById('download-png') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders a live preview when the input becomes valid', async () => {
    await typeInto('f-url', 'example.com');
    const msg = document.querySelector('.validation-message')!;
    expect(msg.textContent).toBe('');
    expect((document.getElementById('download-png') as HTMLButtonElement).disabled).toBe(false);
    expect((document.getElementById('copy-clipboard') as HTMLButtonElement).disabled).toBe(false);
    const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement;
    expect(canvas.width).toBeGreaterThan(0);
  });

  it('shows no scan warning for black on white', () => {
    const warn = scanWarning();
    expect(warn.hidden).toBe(true);
  });

  it('switches tabs and rebuilds the form fields', async () => {
    const wifiTab = document.querySelector<HTMLButtonElement>('[data-type="wifi"]')!;
    wifiTab.click();
    expect(wifiTab.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('f-ssid')).toBeTruthy();
    expect(document.getElementById('f-security')).toBeTruthy();

    const urlTab = document.querySelector<HTMLButtonElement>('[data-type="url"]')!;
    expect(urlTab.getAttribute('aria-selected')).toBe('false');

    // WiFi with empty SSID is invalid → validation + disabled export
    expect(document.querySelector('.validation-message')!.textContent).toBe('SSID cannot be empty');
    expect((document.getElementById('download-png') as HTMLButtonElement).disabled).toBe(true);

    // valid WiFi (WPA needs a password) enables export again
    await typeInto('f-ssid', 'MyNet');
    expect((document.getElementById('download-png') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('.validation-message')!.textContent).toContain('Password required');
    await typeInto('f-password', 'hunter2secret');
    expect((document.getElementById('download-png') as HTMLButtonElement).disabled).toBe(false);

    // switching back restores the URL form and its in-memory content
    urlTab.click();
    const urlField = document.getElementById('f-url') as HTMLInputElement;
    expect(urlField.value).toBe('example.com');
  });

  it('flags a light foreground as unscannable', async () => {
    const fg = document.getElementById('fg-color') as HTMLInputElement;
    fg.value = '#ffffff';
    fg.dispatchEvent(new Event('input', { bubbles: true }));
    const warn = scanWarning();
    expect(warn.hidden).toBe(false);
    // equal luminance falls to the low-contrast branch; strictly lighter hits the other
    expect(warn.textContent).toMatch(/lighter than background|Low contrast/);

    fg.value = '#000000';
    fg.dispatchEvent(new Event('input', { bubbles: true }));
    expect(scanWarning().hidden).toBe(true);

    // light-on-dark (the classic scannability killer)
    const bg = document.getElementById('bg-color') as HTMLInputElement;
    fg.value = '#ffffff';
    fg.dispatchEvent(new Event('input', { bubbles: true }));
    bg.value = '#000000';
    bg.dispatchEvent(new Event('input', { bubbles: true }));
    expect(scanWarning().textContent).toContain('lighter than background');

    // restore safe defaults
    fg.value = '#000000';
    fg.dispatchEvent(new Event('input', { bubbles: true }));
    bg.value = '#ffffff';
    bg.dispatchEvent(new Event('input', { bubbles: true }));
    expect(scanWarning().hidden).toBe(true);
  });

  it('persists settings but never content (privacy)', async () => {
    // type content into the URL field
    await typeInto('f-url', 'https://secret.example.com/token123');
    const stored = localStorage.getItem('shortifi:settings') ?? '';
    expect(stored).not.toContain('secret');
    expect(stored).not.toContain('token123');
    // settings are persisted
    const settings = JSON.parse(stored) as Record<string, unknown>;
    expect(settings).toHaveProperty('dotStyle');
    expect(settings).toHaveProperty('size');
  });
});