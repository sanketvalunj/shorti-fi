// ui.ts — tabs, form building, controls, logo handling, settings persistence
import type { ContentType, PayloadInput } from './payloads';
import type { DotStyle, EyeStyle } from './renderer';

/* ---------- form config (single source of truth, no repeated markup) ---------- */

interface Field {
  name: string;
  label: string;
  type?: 'text' | 'password' | 'email' | 'tel' | 'url';
  textarea?: boolean;
  select?: { value: string; label: string }[];
  checkbox?: boolean;
  required?: boolean;
  placeholder?: string;
  value?: string;
}

const FORM_CONFIG: Record<ContentType, Field[]> = {
  url: [
    { name: 'url', label: 'Website URL', placeholder: 'example.com', required: true },
  ],
  text: [
    { name: 'text', label: 'Text', textarea: true, required: true, placeholder: 'Any text…' },
  ],
  phone: [
    { name: 'phone', label: 'Phone number', type: 'tel', required: true, placeholder: '+1 555 123 4567' },
  ],
  email: [
    { name: 'to', label: 'To', type: 'email', required: true, placeholder: 'someone@example.com' },
    { name: 'subject', label: 'Subject (optional)', placeholder: 'Hello!' },
    { name: 'body', label: 'Body (optional)', textarea: true },
  ],
  wifi: [
    { name: 'ssid', label: 'Network name (SSID)', required: true },
    { name: 'password', label: 'Password', type: 'password', placeholder: 'Leave empty for open networks' },
    {
      name: 'security',
      label: 'Security',
      select: [
        { value: 'WPA', label: 'WPA/WPA2/WPA3' },
        { value: 'WEP', label: 'WEP' },
        { value: 'nopass', label: 'No password' },
      ],
      value: 'WPA',
    },
    { name: 'hidden', label: 'Hidden network', checkbox: true },
  ],
  vcard: [
    { name: 'firstName', label: 'First name', required: true },
    { name: 'lastName', label: 'Last name', required: true },
    { name: 'org', label: 'Organization' },
    { name: 'title', label: 'Job title' },
    { name: 'phone', label: 'Phone', type: 'tel' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'url', label: 'Website', type: 'url' },
    { name: 'address', label: 'Address' },
  ],
};

export function collectPayload(type: ContentType, values: Record<string, string>): PayloadInput {
  const v = (k: string) => values[k] ?? '';
  switch (type) {
    case 'url': return v('url');
    case 'text': return v('text');
    case 'phone': return v('phone');
    case 'email': return { to: v('to'), subject: v('subject') || undefined, body: v('body') || undefined };
    case 'wifi':
      return {
        ssid: v('ssid'),
        password: v('password'),
        security: (v('security') || 'WPA') as 'WPA' | 'WEP' | 'nopass',
        hidden: v('hidden') === 'true',
      };
    case 'vcard':
      return {
        firstName: v('firstName'),
        lastName: v('lastName'),
        org: v('org') || undefined,
        title: v('title') || undefined,
        phone: v('phone') || undefined,
        email: v('email') || undefined,
        url: v('url') || undefined,
        address: v('address') || undefined,
      };
  }
}

/* ---------- settings (persisted; content is NOT persisted — privacy) ---------- */

export interface Settings {
  type: ContentType;
  fg: string;
  bg: string;
  transparent: boolean;
  dotStyle: DotStyle;
  eyeStyle: EyeStyle;
  size: number;
  exportSize: number;
  logoSize: number; // percent 10–25
}

const DEFAULTS: Settings = {
  type: 'url',
  fg: '#000000',
  bg: '#ffffff',
  transparent: false,
  dotStyle: 'square',
  eyeStyle: 'square',
  size: 320,
  exportSize: 1024,
  logoSize: 20,
};

const LS_KEY = 'shortifi:settings';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* corrupted storage → defaults */
  }
  return { ...DEFAULTS };
}

/* ---------- init ---------- */

export type LogoImage = ImageBitmap | HTMLImageElement;

export interface UIState {
  type: ContentType;
  settings: Settings;
  payload: PayloadInput;
  logo: LogoImage | null;
}

export interface UIHandle {
  getState(): UIState;
  setValidation(msg: string | null): void;
  setWarnings(warnings: string[]): void;
  setExportEnabled(enabled: boolean): void;
}

async function loadLogo(file: File): Promise<LogoImage> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> path (e.g. some SVGs) */
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unsupported image'));
    };
    img.src = url;
  });
}

export function initUI(onChange: () => void): UIHandle {
  const settings = loadSettings();
  // Per-type content stays in memory only
  const values: Record<ContentType, Record<string, string>> = {
    url: {}, text: {}, phone: {}, email: {}, wifi: {}, vcard: {},
  };
  let logo: LogoImage | null = null;

  const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;
  const fieldsBox = $<HTMLElement>('#form-fields');
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const validationEl = $<HTMLElement>('.validation-message');
  const warningsEl = $<HTMLElement>('.scan-warning');
  const fgInput = $<HTMLInputElement>('#fg-color');
  const bgInput = $<HTMLInputElement>('#bg-color');
  const transparentInput = $<HTMLInputElement>('#transparent-bg');
  const dotSelect = $<HTMLSelectElement>('#dot-style');
  const eyeSelect = $<HTMLSelectElement>('#eye-style');
  const sizeInput = $<HTMLInputElement>('#qr-size');
  const sizeValue = $<HTMLElement>('#qr-size-value');
  const exportSelect = $<HTMLSelectElement>('#export-size');
  const logoInput = $<HTMLInputElement>('#logo-upload');
  const logoSize = $<HTMLInputElement>('#logo-size');
  const logoSizeValue = $<HTMLElement>('#logo-size-value');
  const logoWarning = $<HTMLElement>('.logo-warning');
  const removeLogoBtn = $<HTMLButtonElement>('#remove-logo');

  const save = () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(settings));
    } catch {
      /* private mode */
    }
  };

  /* ---- form building ---- */

  function buildForm(): void {
    const type = settings.type;
    const fields = FORM_CONFIG[type];
    fieldsBox.innerHTML = '';
    for (const f of fields) {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const id = `f-${f.name}`;
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = f.label + (f.required ? ' *' : '');
      wrap.appendChild(label);

      let input: HTMLElement;
      if (f.textarea) {
        input = document.createElement('textarea');
        (input as HTMLTextAreaElement).rows = 3;
      } else if (f.select) {
        input = document.createElement('select');
        for (const opt of f.select) {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          input.appendChild(o);
        }
      } else if (f.checkbox) {
        input = document.createElement('input');
        (input as HTMLInputElement).type = 'checkbox';
      } else {
        input = document.createElement('input');
        (input as HTMLInputElement).type = f.type ?? 'text';
      }
      input.id = id;
      input.setAttribute('name', f.name);
      if (f.placeholder && 'placeholder' in input) input.placeholder = f.placeholder;
      if (f.required) input.setAttribute('aria-required', 'true');

      const stored = values[type][f.name];
      if (f.checkbox) {
        (input as HTMLInputElement).checked = stored === 'true';
      } else if (stored !== undefined) {
        (input as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = stored;
      } else if (f.value !== undefined) {
        (input as HTMLSelectElement).value = f.value;
      }
      wrap.appendChild(input);
      fieldsBox.appendChild(wrap);
    }
  }

  // Delegated listener survives form rebuilds
  fieldsBox.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    if (!el.name) return;
    values[settings.type][el.name] = el.type === 'checkbox' ? String(el.checked) : el.value;
    onChange();
  });

  /* ---- tabs ---- */

  function setTab(type: ContentType): void {
    settings.type = type;
    for (const t of tabs) {
      const active = t.dataset.type === type;
      t.setAttribute('aria-selected', String(active));
      t.tabIndex = active ? 0 : -1;
    }
    buildForm();
    save();
    onChange();
  }

  for (const t of tabs) {
    t.addEventListener('click', () => setTab(t.dataset.type as ContentType));
    t.addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
      e.preventDefault();
      const i = tabs.indexOf(t);
      const next = tabs[(i + (key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!;
      next.focus();
      setTab(next.dataset.type as ContentType);
    });
  }

  /* ---- customization controls ---- */

  const bind = (el: HTMLElement, event: string, fn: () => void) => el.addEventListener(event, fn);

  bind(fgInput, 'input', () => { settings.fg = fgInput.value; save(); onChange(); });
  bind(bgInput, 'input', () => { settings.bg = bgInput.value; save(); onChange(); });
  bind(transparentInput, 'change', () => { settings.transparent = transparentInput.checked; save(); onChange(); });
  bind(dotSelect, 'change', () => { settings.dotStyle = dotSelect.value as DotStyle; save(); onChange(); });
  bind(eyeSelect, 'change', () => { settings.eyeStyle = eyeSelect.value as EyeStyle; save(); onChange(); });
  bind(sizeInput, 'input', () => {
    settings.size = Number(sizeInput.value);
    sizeValue.textContent = sizeInput.value;
    save();
    onChange();
  });
  bind(exportSelect, 'change', () => { settings.exportSize = Number(exportSelect.value); save(); });

  /* ---- messages ---- */

  function setValidation(msg: string | null): void {
    validationEl.textContent = msg;
    validationEl.classList.toggle('has-error', msg !== null);
  }

  /* ---- logo ---- */

  bind(logoSize, 'input', () => {
    settings.logoSize = Math.min(25, Math.max(10, Number(logoSize.value)));
    logoSizeValue.textContent = String(settings.logoSize);
    logoWarning.hidden = settings.logoSize <= 20;
    save();
    onChange();
  });

  bind(logoInput, 'change', async () => {
    const file = logoInput.files?.[0];
    if (!file) return;
    try {
      logo = await loadLogo(file);
    } catch {
      setValidation('Could not load that image. Use PNG, JPG or SVG.');
      return;
    }
    removeLogoBtn.hidden = false;
    logoSize.disabled = false;
    onChange();
  });

  bind(removeLogoBtn, 'click', () => {
    logo = null;
    logoInput.value = '';
    removeLogoBtn.hidden = true;
    logoSize.disabled = true;
    onChange();
  });

  /* ---- sync controls from persisted settings ---- */

  fgInput.value = settings.fg;
  bgInput.value = settings.bg;
  transparentInput.checked = settings.transparent;
  dotSelect.value = settings.dotStyle;
  eyeSelect.value = settings.eyeStyle;
  sizeInput.value = String(settings.size);
  sizeValue.textContent = String(settings.size);
  exportSelect.value = String(settings.exportSize);
  logoSize.value = String(settings.logoSize);
  logoSizeValue.textContent = String(settings.logoSize);
  logoSize.disabled = true;
  logoWarning.hidden = true;
  buildForm();
  for (const t of tabs) {
    const active = t.dataset.type === settings.type;
    t.setAttribute('aria-selected', String(active));
    t.tabIndex = active ? 0 : -1;
  }

  /* ---- public handle ---- */

  return {
    getState(): UIState {
      return {
        type: settings.type,
        settings,
        payload: collectPayload(settings.type, values[settings.type]),
        logo,
      };
    },
    setValidation,
    setWarnings(warnings: string[]): void {
      warningsEl.hidden = warnings.length === 0;
      warningsEl.textContent = warnings.join(' ');
    },
    setExportEnabled(enabled: boolean): void {
      ($<HTMLButtonElement>('#download-png')).disabled = !enabled;
      ($<HTMLButtonElement>('#copy-clipboard')).disabled = !enabled;
    },
  };
}