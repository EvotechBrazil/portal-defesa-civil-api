import { formatWhatsapp, normalizeWhatsapp } from './whatsapp.util';

describe('normalizeWhatsapp', () => {
  it('accepts digits with country code', () => {
    expect(normalizeWhatsapp('5543999999999')).toBe('5543999999999');
    expect(normalizeWhatsapp('17877180653')).toBe('17877180653');
    expect(normalizeWhatsapp('584129360151')).toBe('584129360151');
  });

  it('rejects punctuation and symbols', () => {
    expect(() => normalizeWhatsapp('+55 43 99999-9999')).toThrow(
      'Informe só números, com DDI (ex.: 5543999999999).',
    );
    expect(() => normalizeWhatsapp('(43) 99999-9999')).toThrow(
      'Informe só números, com DDI (ex.: 5543999999999).',
    );
    expect(() => normalizeWhatsapp('+1 (787) 718-0653')).toThrow(
      'Informe só números, com DDI (ex.: 5543999999999).',
    );
  });

  it('rejects too-short values', () => {
    expect(() => normalizeWhatsapp('439999')).toThrow(
      'Informe só números, com DDI (ex.: 5543999999999).',
    );
  });
});

describe('formatWhatsapp', () => {
  it('keeps digits only', () => {
    expect(formatWhatsapp('5543999999999')).toBe('5543999999999');
    expect(formatWhatsapp('17877180653')).toBe('17877180653');
  });
});
