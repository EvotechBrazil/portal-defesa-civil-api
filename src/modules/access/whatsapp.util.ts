export const WHATSAPP_DIGITS_MESSAGE =
  'Informe só números, com DDI (ex.: 5543999999999).';

export class InvalidWhatsappError extends Error {
  constructor(message = WHATSAPP_DIGITS_MESSAGE) {
    super(message);
    this.name = 'InvalidWhatsappError';
  }
}

/**
 * Só dígitos, com DDI. Qualquer +, espaço, hífen ou parêntese é recusado
 * — não desbloqueia cadastro.
 */
export function normalizeWhatsapp(raw: string): string {
  const trimmed = raw.trim();
  if (!/^\d{8,15}$/.test(trimmed)) {
    throw new InvalidWhatsappError();
  }
  return trimmed;
}

/**
 * Completa o nono dígito de celular BR antigo (12 dígitos) sem tocar
 * em fixo (assinante 2–5) nem em números de outros DDIs.
 *
 * 55 + DDD(2) + [6-9] + 7 dígitos  →  insere 9 depois do DDD.
 * 55 + 13 dígitos já canônicos     →  devolve igual.
 * Qualquer outro caso              →  devolve igual.
 */
export function canonicalWhatsapp(digits: string): string {
  const afterDdd = digits[4];
  if (
    digits.startsWith('55') &&
    digits.length === 12 &&
    afterDdd !== undefined &&
    '6789'.includes(afterDdd)
  ) {
    return `${digits.slice(0, 4)}9${digits.slice(4)}`;
  }
  return digits;
}

/** Canônico primeiro; inclui o 12 dígitos antigo para achar linha ainda não migrada. */
export function whatsappAliases(digits: string): string[] {
  const canonical = canonicalWhatsapp(digits);
  if (
    canonical.startsWith('55') &&
    canonical.length === 13 &&
    canonical[4] === '9'
  ) {
    const short = `${canonical.slice(0, 4)}${canonical.slice(5)}`;
    if (short !== canonical) {
      return [canonical, short];
    }
  }
  return [canonical];
}

export function formatWhatsapp(digits: string): string {
  return digits;
}
