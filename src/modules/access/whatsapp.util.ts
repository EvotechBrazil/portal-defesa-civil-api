export class InvalidWhatsappError extends Error {
  constructor(message = 'Informe um WhatsApp válido com DDD.') {
    super(message);
    this.name = 'InvalidWhatsappError';
  }
}

/**
 * Normaliza para dígitos com DDI 55. Aceita (43) 99999-9999, 43999999999,
 * +55 43 99999-9999 e o zero de tronco (043...).
 */
export function normalizeWhatsapp(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (
    digits.startsWith('0') &&
    (digits.length === 11 || digits.length === 12)
  ) {
    digits = digits.slice(1);
  }

  if (!digits.startsWith('55')) {
    if (digits.length === 10 || digits.length === 11) {
      digits = `55${digits}`;
    }
  }

  const national = digits.startsWith('55') ? digits.slice(2) : digits;
  if (national.length !== 10 && national.length !== 11) {
    throw new InvalidWhatsappError();
  }
  if (!digits.startsWith('55')) {
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
  return digits;
}
