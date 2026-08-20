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

  it('keeps explicit international country codes', () => {
    expect(normalizeWhatsapp('+1 (787) 718-0653')).toBe('17877180653');
    expect(normalizeWhatsapp('+58 412-9360151')).toBe('584129360151');
    expect(normalizeWhatsapp('+971 52 198 6227')).toBe('971521986227');
  });

  it('rejects too-short values', () => {
    expect(() => normalizeWhatsapp('439999')).toThrow(
      'Informe um WhatsApp válido com DDI (ex.: +55 43 99999-9999).',
    );
  });
});

describe('formatWhatsapp', () => {
  it('formats a 13-digit mobile', () => {
    expect(formatWhatsapp('5543999999999')).toBe('+55 (43) 99999-9999');
  });

  it('formats NANP numbers with country code', () => {
    expect(formatWhatsapp('17877180653')).toBe('+1 (787) 718-0653');
  });
});
