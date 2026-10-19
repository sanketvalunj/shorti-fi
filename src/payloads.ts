/**
 * Payload formatters — pure functions that return the exact string to encode.
 * Each returns { ok: true, value: string } | { ok: false, error: string }.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function escapeWifi(s: string): string {
  return s.replace(/[\\;,:"]/g, (ch) => '\\' + ch);
}

function escapeVCard(s: string): string {
  return s.replace(/[,\r;]/g, (ch) => '\\' + ch).replace(/\n/g, '\\n');
}

export function url(input: string): Result<string> {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'URL cannot be empty' };
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : 'https://' + trimmed;
  return { ok: true, value: withScheme };
}

export function text(input: string): Result<string> {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'Text cannot be empty' };
  return { ok: true, value: trimmed };
}

export function phone(number: string): Result<string> {
  const cleaned = number.replace(/[\s\-()]/g, '');
  if (!cleaned) return { ok: false, error: 'Phone number cannot be empty' };
  const withPlus = cleaned.startsWith('+') ? cleaned : '+' + cleaned;
  if (!/^\+?\d{7,15}$/.test(withPlus)) {
    return { ok: false, error: 'Invalid phone number format' };
  }
  return { ok: true, value: `tel:${withPlus}` };
}

export interface EmailInput {
  to: string;
  subject?: string;
  body?: string;
}

export function email(input: EmailInput): Result<string> {
  if (!input.to?.trim()) return { ok: false, error: 'Recipient email is required' };
  const params = new URLSearchParams();
  if (input.subject) params.set('subject', input.subject);
  if (input.body) params.set('body', input.body);
  const query = params.toString();
  return { ok: true, value: `mailto:${input.to.trim()}${query ? '?' + query : ''}` };
}

export interface WifiInput {
  ssid: string;
  password: string;
  security: 'WPA' | 'WEP' | 'nopass';
  hidden?: boolean;
}

export function wifi(input: WifiInput): Result<string> {
  if (!input.ssid?.trim()) return { ok: false, error: 'SSID cannot be empty' };
  if (input.security !== 'nopass' && !input.password) {
    return { ok: false, error: 'Password required for WPA/WEP' };
  }
  const parts = [
    'WIFI:T:' + input.security,
    'S:' + escapeWifi(input.ssid.trim()),
  ];
  if (input.security !== 'nopass') {
    parts.push('P:' + escapeWifi(input.password));
  }
  if (input.hidden) parts.push('H:true');
  return { ok: true, value: parts.join(';') + ';;' };
}

export interface VCardInput {
  firstName: string;
  lastName: string;
  org?: string;
  title?: string;
  phone?: string;
  email?: string;
  url?: string;
  address?: string;
}

export function vcard(input: VCardInput): Result<string> {
  if (!input.firstName?.trim() || !input.lastName?.trim()) {
    return { ok: false, error: 'First and last name are required' };
  }
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeVCard(input.lastName.trim())};${escapeVCard(input.firstName.trim())};;;`,
    `FN:${escapeVCard(input.firstName.trim())} ${escapeVCard(input.lastName.trim())}`,
  ];
  if (input.org) lines.push(`ORG:${escapeVCard(input.org)}`);
  if (input.title) lines.push(`TITLE:${escapeVCard(input.title)}`);
  if (input.phone) lines.push(`TEL:${escapeVCard(input.phone)}`);
  if (input.email) lines.push(`EMAIL:${escapeVCard(input.email)}`);
  if (input.url) lines.push(`URL:${escapeVCard(input.url)}`);
  if (input.address) lines.push(`ADR:${escapeVCard(input.address)}`);
  lines.push('END:VCARD');
  return { ok: true, value: lines.join('\r\n') };
}

export type ContentType = 'url' | 'text' | 'phone' | 'email' | 'wifi' | 'vcard';
export type PayloadInput =
  | string
  | EmailInput
  | WifiInput
  | VCardInput;

export function formatPayload(type: ContentType, input: PayloadInput): Result<string> {
  switch (type) {
    case 'url': return url(input as string);
    case 'text': return text(input as string);
    case 'phone': return phone(input as string);
    case 'email': return email(input as EmailInput);
    case 'wifi': return wifi(input as WifiInput);
    case 'vcard': return vcard(input as VCardInput);
  }
}