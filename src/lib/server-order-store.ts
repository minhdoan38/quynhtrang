import type {
  CustomerInfo,
  PendingOrder,
  ApprovedDesignSnapshot,
  ApprovedDesignVersion,
  OrderPayment,
  PromotedAsset,
} from './order-types.ts';
import { getDesignSummary, type DesignState } from './product-state.ts';
import { calculatePriceQuote } from './pricing.ts';

export interface CreateOrderParams {
  idempotencyKey: string;
  design: DesignState;
  customer: CustomerInfo;
  preflightRevision?: string;
  preflightAcknowledged?: boolean;
  assets?: PromotedAsset[];
}

function isCreateOrderParams(arg: unknown): arg is CreateOrderParams {
  return (
    typeof arg === 'object' &&
    arg !== null &&
    'design' in arg &&
    'customer' in arg &&
    'idempotencyKey' in arg
  );
}

// Server-side memory storage adapter for orders, immutable snapshots, and design versions
export class ServerOrderStore {
  private orders: Map<string, PendingOrder> = new Map();
  private snapshots: Map<string, ApprovedDesignSnapshot> = new Map();
  private approvedVersions: Map<string, ApprovedDesignVersion> = new Map();
  private idempotencyMap: Map<string, string> = new Map();

  createOrder(params: CreateOrderParams): PendingOrder;
  createOrder(design: DesignState, customer: CustomerInfo, idempotencyKey?: string): PendingOrder;
  createOrder(
    arg1: CreateOrderParams | DesignState,
    arg2?: CustomerInfo,
    arg3?: string,
  ): PendingOrder {
    const isParams = isCreateOrderParams(arg1);
    const design = isParams ? arg1.design : arg1;
    const customer = isParams ? arg1.customer : arg2!;
    const idempotencyKey = isParams ? arg1.idempotencyKey : arg3;
    const preflightRevision = (isParams ? arg1.preflightRevision : undefined) ?? 'rev-0';
    const preflightAcknowledged = (isParams ? arg1.preflightAcknowledged : undefined) ?? false;
    const assets = (isParams ? arg1.assets : undefined) ?? [];

    if (idempotencyKey && this.idempotencyMap.has(idempotencyKey)) {
      const existingId = this.idempotencyMap.get(idempotencyKey)!;
      const existing = this.orders.get(existingId);
      if (existing) {
        return JSON.parse(JSON.stringify(existing));
      }
    }

    const orderId = `QT${Math.floor(1000 + Math.random() * 9000)}`;
    const versionId = `ADV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
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
      id: versionId,
      design: immutableDesign,
      summary,
      createdAt: new Date().toISOString(),
    };

    const approvedVersion: ApprovedDesignVersion = {
      id: versionId,
      revision: preflightRevision,
      design: JSON.parse(JSON.stringify(immutableDesign)),
      assets: JSON.parse(JSON.stringify(assets)),
      preflightRevision,
      preflightAcknowledged,
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
      approvedDesignVersionId: versionId,
      preflightRevision,
      snapshot,
      payment,
      createdAt: new Date().toISOString(),
    };

    this.snapshots.set(versionId, snapshot);
    this.approvedVersions.set(versionId, approvedVersion);
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

  getOrderByKey(idempotencyKey: string): PendingOrder | null {
    const orderId = this.idempotencyMap.get(idempotencyKey);
    return orderId ? this.getOrder(orderId) : null;
  }

  getApprovedDesignVersion(id: string): ApprovedDesignVersion | null {
    const version = this.approvedVersions.get(id);
    return version ? JSON.parse(JSON.stringify(version)) : null;
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
    this.approvedVersions.clear();
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
