'use client';

import { useState, useRef, useId } from 'react';
import { AlertCircle, RefreshCw, ArrowRight } from 'lucide-react';
import type { CustomerInfo } from '@/lib/order-types';
import { validateCustomerInfo, type CustomerInfoValidationErrors } from '@/lib/customer-info';

export interface CustomerOrderSummarySnippet {
  product: string;
  quantity: number;
  subtotal: string;
}

export interface CustomerInformationFormProps {
  initialValues: CustomerInfo;
  isSubmitting: boolean;
  submitError?: string | null;
  onRetry?: () => void;
  onChange: (values: CustomerInfo) => void;
  onSubmit: (values: CustomerInfo) => void;
  summary?: CustomerOrderSummarySnippet;
}

type FieldKey = keyof CustomerInfo;

export function CustomerInformationForm({
  initialValues,
  isSubmitting,
  submitError,
  onRetry,
  onChange,
  onSubmit,
  summary,
}: CustomerInformationFormProps) {
  const [values, setValues] = useState<CustomerInfo>(initialValues);
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    fullName: false,
    phone: false,
    shippingAddress: false,
  });
  const [errors, setErrors] = useState<CustomerInfoValidationErrors>({});

  const isComposingRef = useRef<Record<FieldKey, boolean>>({
    fullName: false,
    phone: false,
    shippingAddress: false,
  });

  const fullNameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const shippingAddressRef = useRef<HTMLTextAreaElement>(null);

  const formId = useId();
  const fullNameId = `customer-fullName-${formId}`;
  const phoneId = `customer-phone-${formId}`;
  const shippingAddressId = `customer-shippingAddress-${formId}`;

  const fullNameErrorId = `customer-fullName-error-${formId}`;
  const phoneErrorId = `customer-phone-error-${formId}`;
  const shippingAddressErrorId = `customer-shippingAddress-error-${formId}`;
  const phoneHelpId = `customer-phone-help-${formId}`;

  const validateField = (field: FieldKey, nextValues: CustomerInfo) => {
    const res = validateCustomerInfo(nextValues);
    setErrors((prev) => ({
      ...prev,
      [field]: res.errors[field],
    }));
    return res.errors[field];
  };

  const handleInputChange = (field: FieldKey, value: string) => {
    const nextValues = { ...values, [field]: value };
    setValues(nextValues);
    onChange(nextValues);

    // Only auto-clear/re-validate if already touched, has error, and not in Vietnamese IME composition
    if (touched[field] && !isComposingRef.current[field]) {
      validateField(field, nextValues);
    }
  };

  const handleBlur = (field: FieldKey) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (!isComposingRef.current[field]) {
      validateField(field, values);
    }
  };

  const handleCompositionStart = (field: FieldKey) => {
    isComposingRef.current[field] = true;
  };

  const handleCompositionEnd = (field: FieldKey, e: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    isComposingRef.current[field] = false;
    const value = e.currentTarget.value;
    const nextValues = { ...values, [field]: value };
    setValues(nextValues);
    onChange(nextValues);
    if (touched[field]) {
      validateField(field, nextValues);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setTouched({
      fullName: true,
      phone: true,
      shippingAddress: true,
    });

    const validation = validateCustomerInfo(values);
    setErrors(validation.errors);

    if (!validation.isValid) {
      if (validation.errors.fullName) {
        fullNameRef.current?.focus();
      } else if (validation.errors.phone) {
        phoneRef.current?.focus();
      } else if (validation.errors.shippingAddress) {
        shippingAddressRef.current?.focus();
      }
      return;
    }

    // Call submit with normalized customer info
    onSubmit(validation.normalized);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4 max-w-lg mx-auto w-full">
      {/* Secondary summary snippet (quiet, compact, non-duplicating) */}
      {summary && (
        <div className="rounded-xl border border-[#DDD6CC] bg-[#FFFDF8] px-3.5 py-2.5 text-xs text-[#666A6D] flex flex-wrap items-center justify-between gap-2 shadow-2xs">
          <div>
            <span>Sản phẩm: </span>
            <strong className="text-[#2E3338]">{summary.product}</strong>
            <span className="mx-1.5 text-[#DDD6CC]">•</span>
            <span>Số lượng: </span>
            <strong className="text-[#2E3338]">{summary.quantity}</strong>
          </div>
          <div>
            <span>Tạm tính: </span>
            <strong className="text-[#315F86]">{summary.subtotal}</strong>
          </div>
        </div>
      )}

      {/* Recoverable Error Banner */}
      {submitError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-[#B3535D]/30 bg-[#F6DADD] p-3 text-xs text-[#B3535D] flex items-center justify-between gap-3 shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="shrink-0 text-[#B3535D]" />
            <div>
              <p className="font-bold text-[#B3535D]">Chưa thể chuẩn bị đơn hàng.</p>
              <p className="text-[11px] text-[#B3535D]/90">Kiểm tra kết nối và thử lại.</p>
            </div>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="h-11 px-3.5 shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[#B3535D] text-white text-xs font-semibold hover:bg-[#8F3E47] transition-colors"
            >
              <RefreshCw size={13} />
              <span>Thử lại</span>
            </button>
          )}
        </div>
      )}

      {/* Field 1: Họ và tên */}
      <div className="space-y-1">
        <label htmlFor={fullNameId} className="block text-xs font-semibold text-[#2E3338]">
          Họ và tên
        </label>
        <input
          ref={fullNameRef}
          id={fullNameId}
          name="fullName"
          type="text"
          required
          aria-required="true"
          autoComplete="name"
          placeholder="Nguyễn Văn A"
          value={values.fullName}
          onChange={(e) => handleInputChange('fullName', e.target.value)}
          onBlur={() => handleBlur('fullName')}
          onCompositionStart={() => handleCompositionStart('fullName')}
          onCompositionEnd={(e) => handleCompositionEnd('fullName', e)}
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? fullNameErrorId : undefined}
          className={`w-full h-11 px-3.5 rounded-xl border bg-white text-sm text-[#2E3338] placeholder:text-[#666A6D] focus:outline-none transition-colors ${errors.fullName
            ? 'border-[#B3535D] focus:border-[#B3535D] bg-[#F6DADD]/10'
            : 'border-[#DDD6CC] focus:border-[#315F86]'
            }`}
        />
        {errors.fullName && (
          <p id={fullNameErrorId} role="alert" className="text-xs font-medium text-[#B3535D] pt-0.5">
            {errors.fullName}
          </p>
        )}
      </div>

      {/* Field 2: Số điện thoại */}
      <div className="space-y-1">
        <label htmlFor={phoneId} className="block text-xs font-semibold text-[#2E3338]">
          Số điện thoại
        </label>
        <input
          ref={phoneRef}
          id={phoneId}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          aria-required="true"
          placeholder="09xx xxx xxx"
          value={values.phone}
          onChange={(e) => handleInputChange('phone', e.target.value)}
          onBlur={() => handleBlur('phone')}
          onCompositionStart={() => handleCompositionStart('phone')}
          onCompositionEnd={(e) => handleCompositionEnd('phone', e)}
          aria-invalid={Boolean(errors.phone)}
          aria-describedby={
            errors.phone ? `${phoneErrorId} ${phoneHelpId}` : phoneHelpId
          }
          className={`w-full h-11 px-3.5 rounded-xl border bg-white text-sm text-[#2E3338] placeholder:text-[#666A6D] focus:outline-none transition-colors ${errors.phone
            ? 'border-[#B3535D] focus:border-[#B3535D] bg-[#F6DADD]/10'
            : 'border-[#DDD6CC] focus:border-[#315F86]'
            }`}
        />
        <p id={phoneHelpId} className="text-[11px] text-[#666A6D]">
          Dùng để liên hệ về đơn hàng khi cần.
        </p>
        {errors.phone && (
          <p id={phoneErrorId} role="alert" className="text-xs font-medium text-[#B3535D] pt-0.5">
            {errors.phone}
          </p>
        )}
      </div>

      {/* Field 3: Địa chỉ nhận hàng */}
      <div className="space-y-1">
        <label htmlFor={shippingAddressId} className="block text-xs font-semibold text-[#2E3338]">
          Địa chỉ nhận hàng
        </label>
        <textarea
          ref={shippingAddressRef}
          id={shippingAddressId}
          name="shippingAddress"
          rows={3}
          required
          aria-required="true"
          autoComplete="street-address"
          placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"
          value={values.shippingAddress}
          onChange={(e) => handleInputChange('shippingAddress', e.target.value)}
          onBlur={() => handleBlur('shippingAddress')}
          onCompositionStart={() => handleCompositionStart('shippingAddress')}
          onCompositionEnd={(e) => handleCompositionEnd('shippingAddress', e)}
          aria-invalid={Boolean(errors.shippingAddress)}
          aria-describedby={errors.shippingAddress ? shippingAddressErrorId : undefined}
          className={`w-full min-h-[44px] p-3 rounded-xl border bg-white text-sm text-[#2E3338] placeholder:text-[#666A6D] focus:outline-none transition-colors ${errors.shippingAddress
            ? 'border-[#B3535D] focus:border-[#B3535D] bg-[#F6DADD]/10'
            : 'border-[#DDD6CC] focus:border-[#315F86]'
            }`}
        />
        {errors.shippingAddress && (
          <p id={shippingAddressErrorId} role="alert" className="text-xs font-medium text-[#B3535D] pt-0.5">
            {errors.shippingAddress}
          </p>
        )}
      </div>

      {/* Customer data usage note */}
      <p className="text-[11px] text-[#666A6D]">
        Thông tin này được dùng để xử lý và giao đơn hàng.
      </p>

      {/* Standalone submit button for direct form usage */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#315F86] text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#244A69] transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <span>{isSubmitting ? 'Đang chuẩn bị đơn hàng...' : 'Tiếp tục'}</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
