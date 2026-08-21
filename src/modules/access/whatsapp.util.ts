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

/**
 * DDDs que existem no plano de numeracao brasileiro. Serve para barrar digitacao
 * aleatoria e autopreenchimento errado antes de virar pedido de acesso.
 */
const BR_DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Roda DEPOIS da canonicalizacao, sobre um numero ja so com digitos.
 *
 * Brasileiro tem forma conhecida e por isso e checado de verdade: DDD que
 * existe, celular de 9 digitos comecando em 9, fixo de 8 comecando em 2-5.
 * Estrangeiro nao da para validar assim — fica so no comprimento.
 */
export function assertPlausibleWhatsapp(digits: string): void {
  if (/^(\d)\1+$/.test(digits)) {
    throw new InvalidWhatsappError('Numero invalido: digitos repetidos.');
  }

  if (!digits.startsWith('55')) {
    if (digits.length < 8 || digits.length > 15) {
      throw new InvalidWhatsappError(WHATSAPP_DIGITS_MESSAGE);
    }
    return;
  }

  const ddd = Number(digits.slice(2, 4));
  if (!BR_DDD.has(ddd)) {
    throw new InvalidWhatsappError(`DDD ${digits.slice(2, 4)} nao existe.`);
  }

  const rest = digits.slice(4);
  const celular = rest.length === 9 && rest.startsWith('9');
  const fixo = rest.length === 8 && '2345'.includes(rest[0] ?? '');
  if (!celular && !fixo) {
    throw new InvalidWhatsappError(
      'Numero brasileiro deve ter DDI 55, DDD e 9 digitos comecando em 9.',
    );
  }
}
