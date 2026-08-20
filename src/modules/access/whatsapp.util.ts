export class InvalidWhatsappError extends Error {
  constructor(
    message = 'Informe um WhatsApp válido com DDI (ex.: +55 43 99999-9999).',
  ) {
    super(message);
    this.name = 'InvalidWhatsappError';
  }
}

/**
 * Normaliza para dígitos E.164, sem o "+".
 * - Número com + ou 00: usa o DDI informado (Brasil, EUA/PR, Venezuela, etc.).
 * - 10 ou 11 dígitos sem DDI: assume Brasil (55).
 */
export function normalizeWhatsapp(raw: string): string {
  const trimmed = raw.trim();
  const hasExplicitCc = trimmed.startsWith('+') || trimmed.startsWith('00');
  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (
    !hasExplicitCc &&
    digits.startsWith('0') &&
    (digits.length === 11 || digits.length === 12)
  ) {
    digits = digits.slice(1);
  }
  if (
    !hasExplicitCc &&
    !digits.startsWith('55') &&
    (digits.length === 10 || digits.length === 11)
  ) {
    digits = `55${digits}`;
  }
  if (digits.length < 8 || digits.length > 15) {
    throw new InvalidWhatsappError();
  }
  return digits;
}

export function formatWhatsapp(digits: string): string {
  if (digits.startsWith('55') && digits.length === 13) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.startsWith('55') && digits.length === 12) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  if (digits.startsWith('1') && digits.length === 11) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return `+${digits}`;
}
