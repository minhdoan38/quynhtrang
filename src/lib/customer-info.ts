export interface CustomerInfo {
  fullName: string;
  phone: string;
  shippingAddress: string;
}

export interface CustomerInfoInput {
  fullName?: string;
  phone?: string;
  shippingAddress?: string;
}

export interface CustomerInfoValidationErrors {
  fullName?: string;
  phone?: string;
  shippingAddress?: string;
}

export interface CustomerInfoValidationResult {
  isValid: boolean;
  errors: CustomerInfoValidationErrors;
  normalized: CustomerInfo;
}

export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 100;
export const MIN_PHONE_DIGITS = 8;
export const MAX_PHONE_DIGITS = 15;
export const MIN_ADDRESS_LENGTH = 8;
export const MAX_ADDRESS_LENGTH = 300;

export const CUSTOMER_INFO_ERROR_MESSAGES = {
  fullName: 'Nhập họ và tên.',
  phone: 'Kiểm tra lại số điện thoại.',
  shippingAddress: 'Nhập địa chỉ nhận hàng đầy đủ hơn.',
} as const;

export function normalizePhoneForValidation(phone: string): string {
  return phone.replace(/[\s().-]/g, '');
}

export function normalizeCustomerInfo(input: CustomerInfoInput): CustomerInfo {
  return {
    fullName: (input.fullName ?? '').trim(),
    phone: (input.phone ?? '').trim(),
    shippingAddress: (input.shippingAddress ?? '').trim(),
  };
}

export function validateCustomerInfo(input: CustomerInfoInput): CustomerInfoValidationResult {
  const normalized = normalizeCustomerInfo(input);
  const errors: CustomerInfoValidationErrors = {};

  if (normalized.fullName.length < MIN_NAME_LENGTH || normalized.fullName.length > MAX_NAME_LENGTH) {
    errors.fullName = CUSTOMER_INFO_ERROR_MESSAGES.fullName;
  }

  const rawPhone = input.phone ?? '';
  const validationPhone = normalizePhoneForValidation(normalized.phone);
  const digitsOnly = validationPhone.replace(/\D/g, '');
  const hasInvalidPhoneChars = /[^\d\s().+-]/.test(rawPhone);
  const validPlusPrefix = !validationPhone.includes('+') || validationPhone.startsWith('+');
  const validPlusCount = (validationPhone.match(/\+/g) ?? []).length <= 1;

  if (
    hasInvalidPhoneChars ||
    !validPlusPrefix ||
    !validPlusCount ||
    digitsOnly.length < MIN_PHONE_DIGITS ||
    digitsOnly.length > MAX_PHONE_DIGITS
  ) {
    errors.phone = CUSTOMER_INFO_ERROR_MESSAGES.phone;
  }

  if (
    normalized.shippingAddress.length < MIN_ADDRESS_LENGTH ||
    normalized.shippingAddress.length > MAX_ADDRESS_LENGTH
  ) {
    errors.shippingAddress = CUSTOMER_INFO_ERROR_MESSAGES.shippingAddress;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalized,
  };
}
