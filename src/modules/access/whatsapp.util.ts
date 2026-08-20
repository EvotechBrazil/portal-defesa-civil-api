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

export function formatWhatsapp(digits: string): string {
  return digits;
}
