import type { CustomerInfo, PendingOrder, ApprovedDesignSnapshot, OrderPayment } from './order-types.ts';
import { getDesignSummary, type DesignState } from './product-state.ts';
import { calculatePriceQuote } from './pricing.ts';

// Server-side memory storage adapter for orders and immutable design snapshots
class ServerOrderStore {
  private orders: Map<string, PendingOrder> = new Map();
  private snapshots: Map<string, ApprovedDesignSnapshot> = new Map();
  private idempotencyMap: Map<string, string> = new Map();

  createOrder(design: DesignState, customer: CustomerInfo, idempotencyKey?: string): PendingOrder {
    if (idempotencyKey && this.idempotencyMap.has(idempotencyKey)) {
      const existingId = this.idempotencyMap.get(idempotencyKey)!;
      const existing = this.orders.get(existingId);
      if (existing) {
        return JSON.parse(JSON.stringify(existing));
      }
    }

    const orderId = `QT${Math.floor(1000 + Math.random() * 9000)}`;
    const snapshotId = `SNAP-${Date.now()}`;
    const summary = getDesignSummary(design);

    // Deep clone to ensure immutability and exclude generated repeat elements
    const immutableDesign: DesignState = JSON.parse(JSON.stringify(design));
    if (Array.isArray(immutableDesign.elements)) {
      immutableDesign.elements = immutableDesign.elements.filter((element) => {
        const candidate = element as { generated?: unknown; data?: Record<string, unknown> };
        if (candidate.generated === true) return false;
        if (candidate.data?.generated === true || candidate.data?.patternGenerated === true) return false;
        return true;
      });
    }
    const snapshot: ApprovedDesignSnapshot = {
      id: snapshotId,
      design: immutableDesign,
      summary,
      createdAt: new Date().toISOString(),
    };
    const quote = calculatePriceQuote({
      productId: design.productId,
      variantId: design.variantId,
      quantity: design.quantity,
      productOptions: design.productOptions,
    });

    const payment: OrderPayment = {
      orderId,
      provider: 'vietqr-demo',
      amount: quote.subtotal,
      currency: 'VND',
      paymentReference: orderId,
      status: 'pending_payment',
    };

    const resolvedIdempotencyKey = idempotencyKey ?? `order-key-${orderId}`;
    const order: PendingOrder = {
      id: orderId,
      idempotencyKey: resolvedIdempotencyKey,
      status: 'pending',
      paymentStatus: 'pending_payment',
      customer: {
        fullName: customer.fullName,
        phone: customer.phone,
        shippingAddress: customer.shippingAddress,
      },
      product: {
        productId: design.productId,
        variantId: design.variantId,
        quantity: design.quantity,
        unitPrice: quote.unitPrice,
        subtotal: quote.subtotal,
      },
      approvedDesignVersionId: snapshotId,
      preflightRevision: 'rev-0',
      snapshot,
      payment,
      createdAt: new Date().toISOString(),
    };

    this.snapshots.set(snapshotId, snapshot);
    this.orders.set(orderId, order);
    if (idempotencyKey) {
      this.idempotencyMap.set(idempotencyKey, orderId);
    }
    return order;
  }

  getOrder(id: string): PendingOrder | null {
    const order = this.orders.get(id);
    return order ? JSON.parse(JSON.stringify(order)) : null;
  }
  getAllOrders(): PendingOrder[] {
    return Array.from(this.orders.values()).map((o) => JSON.parse(JSON.stringify(o)));
  }

  reportPayment(id: string): PendingOrder | null {
    const order = this.orders.get(id);
    if (!order) return null;
    order.paymentStatus = 'payment_reported';
    order.payment.status = 'payment_reported';
    order.payment.customerReportedAt = new Date().toISOString();
    return JSON.parse(JSON.stringify(order));
  }

  getSnapshot(id: string): ApprovedDesignSnapshot | null {
    const snapshot = this.snapshots.get(id);
    return snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
  }

  clear(): void {
    this.orders.clear();
    this.snapshots.clear();
    this.idempotencyMap.clear();
  }
}

// Global singleton instance for Node/Next server runtime
const globalStoreKey = Symbol.for('quynhtrang.serverOrderStore');
const globalAny = globalThis as unknown as { [key: symbol]: ServerOrderStore };

if (!globalAny[globalStoreKey]) {
  globalAny[globalStoreKey] = new ServerOrderStore();
}

export const serverOrderStore: ServerOrderStore = globalAny[globalStoreKey];
