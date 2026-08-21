import {
  canonicalWhatsapp,
  formatWhatsapp,
  normalizeWhatsapp,
  whatsappAliases,
} from './whatsapp.util';

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

describe('canonicalWhatsapp', () => {
  it('inserts the ninth digit on a 12-digit Brazilian mobile', () => {
    expect(canonicalWhatsapp('553591783500')).toBe('5535991783500');
    expect(canonicalWhatsapp('554497057668')).toBe('5544997057668');
  });

  it('leaves a 13-digit Brazilian mobile unchanged', () => {
    expect(canonicalWhatsapp('5544997057668')).toBe('5544997057668');
    expect(canonicalWhatsapp('5535991783500')).toBe('5535991783500');
  });

  it('does not add 9 to a 12-digit Brazilian landline', () => {
    expect(canonicalWhatsapp('553130260000')).toBe('553130260000');
  });

  it('does not touch an 11-digit US/Puerto Rico number', () => {
    expect(canonicalWhatsapp('17877180653')).toBe('17877180653');
  });

  it('lists canonical and short aliases for a Brazilian mobile', () => {
    expect(whatsappAliases('553591783500')).toEqual([
      '5535991783500',
      '553591783500',
    ]);
    expect(whatsappAliases('5544997057668')).toEqual([
      '5544997057668',
      '554497057668',
    ]);
  });
});

describe('formatWhatsapp', () => {
  it('keeps digits only', () => {
    expect(formatWhatsapp('5543999999999')).toBe('5543999999999');
    expect(formatWhatsapp('17877180653')).toBe('17877180653');
  });
});
