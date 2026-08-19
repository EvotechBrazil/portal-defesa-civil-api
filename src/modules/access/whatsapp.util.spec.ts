import { formatWhatsapp, normalizeWhatsapp } from './whatsapp.util';

describe('normalizeWhatsapp', () => {
  it('accepts local mobile with punctuation', () => {
    expect(normalizeWhatsapp('(43) 99999-9999')).toBe('5543999999999');
  });

  it('accepts digits-only DDD + number', () => {
    expect(normalizeWhatsapp('43988887777')).toBe('5543988887777');
  });

  it('accepts +55 and trunk zero', () => {
    expect(normalizeWhatsapp('+55 43 98888-7777')).toBe('5543988887777');
    expect(normalizeWhatsapp('043 98888-7777')).toBe('5543988887777');
  });

  it('rejects too-short values', () => {
    expect(() => normalizeWhatsapp('439999')).toThrow(
      'Informe um WhatsApp válido com DDD.',
    );
  });
});

describe('formatWhatsapp', () => {
  it('formats a 13-digit mobile', () => {
    expect(formatWhatsapp('5543999999999')).toBe('+55 (43) 99999-9999');
  });
});
