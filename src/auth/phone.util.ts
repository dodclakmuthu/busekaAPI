const SRI_LANKA_DIAL_CODE = '+94';
const sriLankanMobilePattern = /^7\d{8}$/;

function sanitizePhoneValue(value: string): string {
  return value.trim().replace(/[\s()-]/g, '');
}

export function normalizeAuthMobileNumber(value: string): string | null {
  const compact = sanitizePhoneValue(value);
  if (!compact) return null;

  if (compact.startsWith('+')) {
    if (!/^\+\d+$/.test(compact) || !compact.startsWith(SRI_LANKA_DIAL_CODE)) {
      return null;
    }

    const nationalNumber = compact.slice(SRI_LANKA_DIAL_CODE.length);
    if (!sriLankanMobilePattern.test(nationalNumber)) {
      return null;
    }

    return `${SRI_LANKA_DIAL_CODE}${nationalNumber}`;
  }

  const digits = compact.replace(/\D/g, '');
  let nationalNumber = digits;

  if (digits.startsWith('94')) {
    nationalNumber = digits.slice(2);
  } else if (digits.startsWith('0')) {
    nationalNumber = digits.slice(1);
  }

  if (!sriLankanMobilePattern.test(nationalNumber)) {
    return null;
  }

  return `${SRI_LANKA_DIAL_CODE}${nationalNumber}`;
}

export function getAuthMobileLookupVariants(value: string): string[] {
  const normalized = normalizeAuthMobileNumber(value);
  const variants = new Set<string>();
  const trimmed = value.trim();

  if (trimmed) {
    variants.add(trimmed);
  }

  if (!normalized) {
    return Array.from(variants);
  }

  const nationalNumber = normalized.slice(SRI_LANKA_DIAL_CODE.length);
  variants.add(normalized);
  variants.add(`0${nationalNumber}`);
  variants.add(nationalNumber);
  variants.add(`94${nationalNumber}`);

  return Array.from(variants);
}

export const INVALID_SRI_LANKAN_PHONE_MESSAGE = 'Invalid Sri Lanka mobile number. Use 0771045601 or +94771045601.';