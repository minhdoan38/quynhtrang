export type CatalogStatus = 'draft' | 'active' | 'archived';

export type PaymentPolicy =
 | { kind: 'full_payment' }
 | { kind: 'fixed_deposit'; depositAmount: number };

export type VolumeTier = {
 minimumQuantity: number;
 unitPrice: number;
};

export type CommercialVariantRule = {
 variantId: string;
 minimumQuantity: number;
 quantityStep: number;
 maximumQuantity: number | null;
 tiers: readonly VolumeTier[];
};

export type CommercialConfigVersion = {
 id: string;
 productId: string;
 versionNumber: number;
 currency: 'VND';
 paymentPolicy: PaymentPolicy;
 variantRules: readonly CommercialVariantRule[];
};

export type PriceCalculation = {
 commercialConfigVersionId: string;
 productId: string;
 variantId: string;
 currency: 'VND';
 quantity: number;
 appliedTier: VolumeTier;
 unitPrice: number;
 subtotal: number;
 totalAmount: number;
 paymentPolicy: PaymentPolicy;
 amountDueNow: number;
 remainingAmount: number;
};

const isSafePositiveInteger = (value: number): boolean => Number.isSafeInteger(value) && value >= 1;
const isSafeNonNegativeInteger = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

function validatePaymentPolicy(policy: PaymentPolicy, errors: string[]): void {
 if (!policy || (policy.kind !== 'full_payment' && policy.kind !== 'fixed_deposit')) {
  errors.push('Payment policy must be full_payment or fixed_deposit.');
  return;
 }
 if (policy.kind === 'fixed_deposit' && !isSafeNonNegativeInteger(policy.depositAmount)) {
  errors.push('Fixed deposit amount must be a safe non-negative integer.');
 }
}

function validateRule(rule: CommercialVariantRule, errors: string[]): void {
 if (!rule.variantId.trim()) errors.push('Variant ID must not be empty.');
 if (!isSafePositiveInteger(rule.minimumQuantity)) {
  errors.push(`Variant ${rule.variantId}: minimum quantity must be a safe integer >= 1.`);
 }
 if (!isSafePositiveInteger(rule.quantityStep)) {
  errors.push(`Variant ${rule.variantId}: quantity step must be a safe integer >= 1.`);
 }
 if (rule.maximumQuantity !== null &&
  (!isSafePositiveInteger(rule.maximumQuantity) || rule.maximumQuantity < rule.minimumQuantity)) {
  errors.push(`Variant ${rule.variantId}: maximum quantity must be null or >= minimum quantity.`);
 }
 if (rule.tiers.length === 0) {
  errors.push(`Variant ${rule.variantId}: at least one pricing tier is required.`);
  return;
 }

 let previousThreshold = 0;
 for (const [index, tier] of rule.tiers.entries()) {
  if (!isSafePositiveInteger(tier.minimumQuantity)) {
   errors.push(`Variant ${rule.variantId}: tier ${index + 1} threshold must be a safe integer >= 1.`);
  }
  if (!isSafePositiveInteger(tier.unitPrice)) {
   errors.push(`Variant ${rule.variantId}: tier ${index + 1} unit price must be a safe integer > 0.`);
  }
  if (index > 0 && tier.minimumQuantity <= previousThreshold) {
   errors.push(`Variant ${rule.variantId}: tier thresholds must be strictly increasing and unique.`);
  }
  previousThreshold = tier.minimumQuantity;
 }

 const firstTier = rule.tiers[0];
 if (firstTier.minimumQuantity !== rule.minimumQuantity) {
  errors.push(`Variant ${rule.variantId}: first tier threshold must equal minimum quantity.`);
 }

 for (const tier of rule.tiers) {
  if (!validateQuantity(rule, tier.minimumQuantity)) {
   errors.push(`Variant ${rule.variantId}: tier threshold ${tier.minimumQuantity} is unreachable by quantity step.`);
  }
 }
}

function minimumTotalAtTier(tier: VolumeTier): number | null {
 const total = tier.minimumQuantity * tier.unitPrice;
 return Number.isSafeInteger(total) && total >= 0 ? total : null;
}

export function validateCommercialConfig(
 config: CommercialConfigVersion,
 activeVariantIds: readonly string[],
): string[] {
 const errors: string[] = [];
 if (!config.id.trim()) errors.push('Commercial config version ID must not be empty.');
 if (!config.productId.trim()) errors.push('Product ID must not be empty.');
 if (!isSafePositiveInteger(config.versionNumber)) errors.push('Version number must be a safe integer >= 1.');
 if (config.currency !== 'VND') errors.push('Currency must be VND.');
 validatePaymentPolicy(config.paymentPolicy, errors);
 if (config.variantRules.length === 0) errors.push('At least one commercial variant rule is required.');

 const seenVariants = new Set<string>();
 for (const rule of config.variantRules) {
  if (seenVariants.has(rule.variantId)) errors.push(`Duplicate variant rule: ${rule.variantId}.`);
  seenVariants.add(rule.variantId);
  validateRule(rule, errors);
 }

 const configuredVariants = new Set(config.variantRules.map((rule) => rule.variantId));
 for (const variantId of activeVariantIds) {
  if (!configuredVariants.has(variantId)) errors.push(`Active variant ${variantId} has no commercial rule.`);
 }

 if (config.paymentPolicy.kind === 'fixed_deposit' && isSafeNonNegativeInteger(config.paymentPolicy.depositAmount)) {
  for (const rule of config.variantRules) {
   for (const tier of rule.tiers) {
    const minimumTotal = minimumTotalAtTier(tier);
    if (minimumTotal !== null && config.paymentPolicy.depositAmount > minimumTotal) {
     errors.push(
      `Fixed deposit ${config.paymentPolicy.depositAmount} exceeds minimum reachable total ${minimumTotal} for variant ${rule.variantId} at quantity ${tier.minimumQuantity}.`,
     );
    }
   }
  }
 }

 return errors;
}

export function validateQuantity(rule: CommercialVariantRule, quantity: number): boolean {
 if (!isSafePositiveInteger(quantity) || !isSafePositiveInteger(rule.minimumQuantity) || !isSafePositiveInteger(rule.quantityStep)) {
  return false;
 }
 if (quantity < rule.minimumQuantity) return false;
 if (rule.maximumQuantity !== null && quantity > rule.maximumQuantity) return false;
 return (quantity - rule.minimumQuantity) % rule.quantityStep === 0;
}

export function calculatePrice(
 config: CommercialConfigVersion,
 variantId: string,
 quantity: number,
): PriceCalculation {
 const rule = config.variantRules.find((candidate) => candidate.variantId === variantId);
 if (!rule) throw new Error(`No commercial pricing rule configured for variant ${variantId}.`);
 if (config.currency !== 'VND') throw new Error('Currency must be VND.');
 if (!validateQuantity(rule, quantity)) {
  throw new Error(
   `Số lượng không hợp lệ: chọn số nguyên từ ${rule.minimumQuantity}, theo bước ${rule.quantityStep}${rule.maximumQuantity === null ? '' : `, tối đa ${rule.maximumQuantity}`}.`,
  );
 }

 let appliedTier = rule.tiers[0];
 for (const tier of rule.tiers) {
  if (tier.minimumQuantity <= quantity && tier.minimumQuantity >= appliedTier.minimumQuantity) appliedTier = tier;
 }
 if (!appliedTier || !isSafePositiveInteger(appliedTier.unitPrice)) {
  throw new Error(`No valid pricing tier configured for variant ${variantId}.`);
 }

 const subtotal = quantity * appliedTier.unitPrice;
 if (!Number.isSafeInteger(subtotal)) throw new Error('Price calculation exceeds safe integer range.');
 const totalAmount = subtotal;
 let amountDueNow = totalAmount;
 if (config.paymentPolicy.kind === 'fixed_deposit') {
  amountDueNow = config.paymentPolicy.depositAmount;
  if (!isSafeNonNegativeInteger(amountDueNow) || amountDueNow > totalAmount) {
   throw new Error('Fixed deposit exceeds order total.');
  }
 }
 const remainingAmount = totalAmount - amountDueNow;

 return {
  commercialConfigVersionId: config.id,
  productId: config.productId,
  variantId,
  currency: 'VND',
  quantity,
  appliedTier,
  unitPrice: appliedTier.unitPrice,
  subtotal,
  totalAmount,
  paymentPolicy: config.paymentPolicy,
  amountDueNow,
  remainingAmount,
 };
}

export function formatCurrencyVND(amount: number): string {
 const integer = Math.trunc(amount);
 const sign = integer < 0 ? '-' : '';
 const digits = Math.abs(integer).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
 return `${sign}${digits}đ`;
}
