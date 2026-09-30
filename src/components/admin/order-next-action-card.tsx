import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { OrderNextAction } from '@/lib/domain/order';
import { AlertCircle, Clock, CheckCircle2, Info, ArrowRight } from 'lucide-react';

export interface OrderNextActionCardProps {
  nextAction: OrderNextAction;
  orderId: string;
  canMutate?: boolean;
  onConfirmPaymentIntent?: () => void;
  onReleaseHoldIntent?: () => void;
  className?: string;
}

export function OrderNextActionCard({
  nextAction,
  orderId,
  canMutate = false,
  onConfirmPaymentIntent,
  onReleaseHoldIntent,
  className,
}: OrderNextActionCardProps) {
  let themeStyles = {
    card: 'border-neutral-200 bg-white',
    badge: 'bg-neutral-100 text-neutral-700 border-neutral-200',
    icon: <Info className="w-5 h-5 text-neutral-500" />,
  };

  if (nextAction.intent === 'attention') {
    themeStyles = {
      card: 'border-amber-300 bg-amber-50/40',
      badge: 'bg-amber-100 text-amber-800 border-amber-200',
      icon: <AlertCircle className="w-5 h-5 text-amber-600" />,
    };
  } else if (nextAction.intent === 'waiting') {
    themeStyles = {
      card: 'border-blue-200 bg-blue-50/30',
      badge: 'bg-blue-100 text-blue-800 border-blue-200',
      icon: <Clock className="w-5 h-5 text-blue-600" />,
    };
  } else if (nextAction.intent === 'ready') {
    themeStyles = {
      card: 'border-emerald-300 bg-emerald-50/40',
      badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
    };
  }

  return (
    <Card className={cn('p-5 shadow-xs transition-all', themeStyles.card, className)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="mt-0.5 shrink-0">{themeStyles.icon}</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'px-2 py-0.5 rounded text-[11px] font-semibold tracking-wider uppercase border',
                  themeStyles.badge
                )}
              >
                {nextAction.eyebrow}
              </span>
            </div>
            <h3 className="text-base font-semibold text-neutral-900 leading-snug">
              {nextAction.title}
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed max-w-2xl">
              {nextAction.description}
            </p>
          </div>
        </div>

        {nextAction.cta && (
          <div className="sm:self-center shrink-0 pt-2 sm:pt-0">
            {nextAction.cta.type === 'confirm_payment' && canMutate && (
              <Button
                onClick={onConfirmPaymentIntent}
                className="w-full sm:w-auto h-11 px-5 bg-neutral-900 hover:bg-neutral-800 text-white font-medium shadow-xs"
              >
                {nextAction.cta.label}
              </Button>
            )}

            {nextAction.cta.type === 'release_hold' && canMutate && (
              <Button
                onClick={onReleaseHoldIntent}
                variant="outline"
                className="w-full sm:w-auto h-11 px-5 border-neutral-300 hover:bg-neutral-100 text-neutral-900 font-medium"
              >
                {nextAction.cta.label}
              </Button>
            )}

            {nextAction.cta.type === 'navigate' && (
              <Link
                href={nextAction.cta.href || `/admin/orders/${orderId}/design`}
                className={cn(
                  buttonVariants({ variant: 'default' }),
                  'w-full sm:w-auto h-11 px-5 bg-neutral-900 hover:bg-neutral-800 text-white font-medium shadow-xs inline-flex items-center justify-center'
                )}
              >
                {nextAction.cta.label}
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Link>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
