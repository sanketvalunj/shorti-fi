import { describe, it, expect } from 'vitest';
import { url, text, phone, email, wifi, vcard } from '../src/payloads';

function assertOk<T>(result: { ok: boolean; value?: T; error?: string }): asserts result is { ok: true; value: T } {
  if (!result.ok) throw new Error(result.error);
}

describe('payloads', () => {
  describe('url', () => {
    it('adds https:// when no scheme', () => {
      const result = url('example.com');
      assertOk(result);
      expect(result.value).toBe('https://example.com');
    });
    it('keeps existing scheme', () => {
      let result = url('https://example.com');
      assertOk(result);
      expect(result.value).toBe('https://example.com');
      result = url('http://example.com');
      assertOk(result);
      expect(result.value).toBe('http://example.com');
    });
    it('trims whitespace', () => {
      const result = url('  example.com  ');
      assertOk(result);
      expect(result.value).toBe('https://example.com');
    });
    it('rejects empty', () => {
      expect(url('')).toEqual({ ok: false, error: 'URL cannot be empty' });
      expect(url('   ')).toEqual({ ok: false, error: 'URL cannot be empty' });
    });
  });

  describe('text', () => {
    it('returns trimmed text', () => {
      const result = text('  hello world  ');
      assertOk(result);
      expect(result.value).toBe('hello world');
    });
    it('rejects empty', () => {
      expect(text('')).toEqual({ ok: false, error: 'Text cannot be empty' });
    });
  });

  describe('phone', () => {
    it('adds + and strips formatting', () => {
      const result = phone('1 555-123-4567');
      assertOk(result);
      expect(result.value).toBe('tel:+15551234567');
    });
    it('keeps leading +', () => {
      const result = phone('+44 20 7946 0958');
      assertOk(result);
      expect(result.value).toBe('tel:+442079460958');
    });
    it('rejects too short', () => {
      expect(phone('123')).toEqual({ ok: false, error: 'Invalid phone number format' });
    });
    it('rejects empty', () => {
      expect(phone('')).toEqual({ ok: false, error: 'Phone number cannot be empty' });
    });
  });

  describe('email', () => {
    it('basic mailto', () => {
      const result = email({ to: 'test@example.com' });
      assertOk(result);
      expect(result.value).toBe('mailto:test@example.com');
    });
    it('with subject and body', () => {
      const result = email({ to: 'a@b.com', subject: 'Hello', body: 'World' });
      assertOk(result);
      expect(result.value).toContain('mailto:a@b.com');
      expect(result.value).toContain('subject=Hello');
      expect(result.value).toContain('body=World');
    });
    it('encodes special chars in subject/body only', () => {
      const result = email({ to: 'a@b.com', subject: 'Hello, World!' });
      assertOk(result);
      // URLSearchParams encodes spaces as + not %20
      expect(result.value).toContain('subject=Hello%2C+World%21');
      // email address itself should NOT be encoded
      expect(result.value).toContain('mailto:a@b.com');
    });
    it('rejects missing to', () => {
      expect(email({ to: '' })).toEqual({ ok: false, error: 'Recipient email is required' });
    });
  });

  describe('wifi', () => {
    it('WPA with password', () => {
      const result = wifi({ ssid: 'MyNet', password: 'pass123', security: 'WPA' });
      assertOk(result);
      expect(result.value).toBe('WIFI:T:WPA;S:MyNet;P:pass123;;');
    });
    it('escapes special chars in ssid/password', () => {
      const result = wifi({ ssid: 'My;Net', password: 'p"ass:word', security: 'WPA' });
      assertOk(result);
      expect(result.value).toContain('S:My\\;Net');
      expect(result.value).toContain('P:p\\"ass\\:word');
    });
    it('nopass requires no password', () => {
      const result = wifi({ ssid: 'OpenNet', password: '', security: 'nopass' });
      assertOk(result);
      expect(result.value).toBe('WIFI:T:nopass;S:OpenNet;;');
    });
    it('rejects missing password for WPA', () => {
      expect(wifi({ ssid: 'Net', password: '', security: 'WPA' }))
        .toEqual({ ok: false, error: 'Password required for WPA/WEP' });
    });
    it('rejects empty ssid', () => {
      expect(wifi({ ssid: '', password: 'pass', security: 'WPA' }))
        .toEqual({ ok: false, error: 'SSID cannot be empty' });
    });
    it('includes hidden flag', () => {
      const result = wifi({ ssid: 'Hidden', password: 'pass', security: 'WPA', hidden: true });
      assertOk(result);
      expect(result.value).toContain('H:true');
    });
  });

  describe('vcard', () => {
    it('minimal vCard', () => {
      const result = vcard({ firstName: 'John', lastName: 'Doe' });
      assertOk(result);
      expect(result.value).toContain('BEGIN:VCARD');
      expect(result.value).toContain('VERSION:3.0');
      expect(result.value).toContain('N:Doe;John;;;');
      expect(result.value).toContain('FN:John Doe');
      expect(result.value).toContain('END:VCARD');
      expect(result.value).toContain('\r\n');
    });
    it('escapes commas, semicolons, newlines', () => {
      const result = vcard({ firstName: 'John, Jr.', lastName: 'Doe;Smith', org: 'Acme\nCorp' });
      assertOk(result);
      // vCard N field: Last;First;Middle;Prefix;Suffix (5 fields)
      expect(result.value).toContain('N:Doe\\;Smith;John\\, Jr.;;;');
      // newline escaped as literal \n
      expect(result.value).toContain('ORG:Acme\\nCorp');
    });
    it('includes optional fields', () => {
      const result = vcard({
        firstName: 'Jane',
        lastName: 'Smith',
        org: 'Acme',
        title: 'CEO',
        phone: '+15551234567',
        email: 'jane@acme.com',
        url: 'https://acme.com',
        address: '123 Main St',
      });
      assertOk(result);
      expect(result.value).toContain('ORG:Acme');
      expect(result.value).toContain('TITLE:CEO');
      expect(result.value).toContain('TEL:+15551234567');
      expect(result.value).toContain('EMAIL:jane@acme.com');
      expect(result.value).toContain('URL:https://acme.com');
      expect(result.value).toContain('ADR:123 Main St');
    });
    it('rejects missing names', () => {
      expect(vcard({ firstName: '', lastName: 'Doe' })).toEqual({ ok: false, error: 'First and last name are required' });
      expect(vcard({ firstName: 'John', lastName: '' })).toEqual({ ok: false, error: 'First and last name are required' });
    });
  });
});