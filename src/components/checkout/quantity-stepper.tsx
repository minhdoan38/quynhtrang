'use client';

import React, { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

export interface QuantityStepperProps {
  quantity: number;
  min?: number;
  max?: number;
  onChange: (quantity: number) => void;
}

export function QuantityStepper({
  quantity,
  min = 1,
  max = 999,
  onChange,
}: QuantityStepperProps): React.JSX.Element {
  const [inputValue, setInputValue] = useState(String(quantity));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInputValue(String(quantity));
  }, [quantity]);

  const minimumError = `Số lượng tối thiểu là ${min} bản.`;

  const handleInputChange = (value: string) => {
    setInputValue(value);

    if (!/^\d+$/.test(value)) {
      setError(minimumError);
      return;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
      setError(minimumError);
      return;
    }

    setError(null);
    onChange(parsed);
  };

  return (
    <div className="rounded-2xl border border-[#DDD6CC] bg-[#FFFDF8] p-4 space-y-2">
      <label htmlFor="quantity-stepper-input" className="text-xs font-semibold text-[#2E3338]">
        Số lượng đặt in
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Giảm số lượng"
          disabled={quantity <= min}
          onClick={() => onChange(Math.max(min, quantity - 1))}
          className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl border border-[#DDD6CC] bg-white flex items-center justify-center text-[#2E3338] disabled:opacity-30 disabled:pointer-events-none hover:bg-[#F8F3E8] transition-colors"
        >
          <Minus size={16} aria-hidden="true" />
        </button>
        <input
          id="quantity-stepper-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label="Số lượng đặt in"
          aria-invalid={error !== null}
          value={inputValue}
          onChange={(event) => handleInputChange(event.target.value)}
          className="w-24 h-11 rounded-xl border border-[#DDD6CC] bg-white text-center text-sm font-bold text-[#2E3338] focus:border-[#315F86] focus:outline-none"
        />
        <button
          type="button"
          aria-label="Tăng số lượng"
          disabled={quantity >= max}
          onClick={() => onChange(Math.min(max, quantity + 1))}
          className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl border border-[#DDD6CC] bg-white flex items-center justify-center text-[#2E3338] disabled:opacity-30 disabled:pointer-events-none hover:bg-[#F8F3E8] transition-colors"
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
      {error && <p className="text-xs text-[#B3535D]">{error}</p>}
    </div>
  );
}
