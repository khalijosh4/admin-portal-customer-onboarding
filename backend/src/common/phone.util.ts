/**
 * Kenyan phone number helpers. Accepts any Kenyan mobile prefix
 * (Safaricom 07XX, Airtel 01XX/010X, Telkom 011X, Faiba 0745, etc.),
 * in local (07.., 7..) or international (2547.., +2547..) format.
 * Normalizes to international MSISDN 254XXXXXXXXX.
 */

const KENYA_REGEX = /^(?:\+?254|0)?(1|7)\d{8}$/;

/** Validate a Kenyan mobile number in local or +254 international format. */
export function isValidKenyanPhone(input: string): boolean {
  return KENYA_REGEX.test(input.replace(/\s+/g, ''));
}

/** Normalize any valid Kenyan mobile number to international 254XXXXXXXXX. */
export function normalizeKenyanPhone(input: string): string {
  let digits = input.replace(/\s+/g, '').replace(/^\+/, '');
  if (digits.startsWith('254')) {
    return digits;
  }
  // Local format: leading 0 or bare 7/1
  return '254' + digits.replace(/^0/, '');
}
