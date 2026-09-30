import { randomUUID } from 'node:crypto';
import { storeAsset } from './asset-store.ts';
import type { PrepareOrderOptions } from './services/prepare-order-from-guest-checkout.ts';
import type { CreatePendingOrderInput } from './domain/order.ts';
import type { PromoteAssetInput } from './repositories/asset-repository.ts';
import type { CreateDesignVersionInput } from './repositories/design-version-repository.ts';
import type { CreateProjectInput } from './repositories/project-repository.ts';
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
    const rawAssets = (isParams ? arg1.assets : undefined) ?? [];
    const assets = rawAssets.map((asset) => {
      if (asset.payload !== undefined) {
        if (typeof asset.payload !== 'string') {
          return {
            ...asset,
            payload: Buffer.from(asset.payload as unknown as Uint8Array).toString('base64'),
          };
        }
        const trimmed = asset.payload.trim();
        if (trimmed.startsWith('<') || trimmed.includes('xmlns') || (!trimmed.startsWith('data:') && !/^[A-Za-z0-9+/=\s]+$/.test(trimmed))) {
          return {
            ...asset,
            payload: Buffer.from(asset.payload, 'utf8').toString('base64'),
          };
        }
      }
      return asset;
    });

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
        quantity: quote.quantity,
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

  deleteOrder(id: string): void {
    const order = this.orders.get(id);
    if (!order) return;
    this.orders.delete(id);
    this.snapshots.delete(order.approvedDesignVersionId);
    this.approvedVersions.delete(order.approvedDesignVersionId);
    this.idempotencyMap.delete(order.idempotencyKey);
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

export function createServerOrderPreparationOptions(): PrepareOrderOptions {
  return {
    projectRepo: {
      async createProject(input: CreateProjectInput) {
        const now = new Date().toISOString();
        return {
          id: `project-${randomUUID()}`,
          ownerUserId: input.ownerUserId ?? null,
          guestKeyHash: input.guestKeyHash ?? null,
          productId: input.productId,
          variantId: input.variantId ?? null,
          status: input.status ?? 'editing',
          currentWorkingRevision: input.currentWorkingRevision ?? 1,
          createdAt: now,
          updatedAt: now,
        };
      },
    },
    assetRepo: {
      async promoteAsset(input: PromoteAssetInput) {
        const id = `asset-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
        const url = `/api/assets/${id}`;
        storeAsset({
          id: url,
          sourceKey: String(input.metadata?.sourceKey ?? url),
          mimeType: input.mimeType,
          byteSize: input.bytes.byteLength,
          width: input.pixelWidth ?? undefined,
          height: input.pixelHeight ?? undefined,
          originalUrl: url,
          checksum: input.checksum ?? undefined,
          payload: input.bytes,
        });
        return {
          id,
          projectId: input.projectId,
          kind: input.kind,
          storageBucket: input.storageBucket,
          storagePath: `${input.projectId}/${id}`,
          originalName: input.originalName ?? null,
          mimeType: input.mimeType,
          byteSize: input.bytes.byteLength,
          pixelWidth: input.pixelWidth ?? null,
          pixelHeight: input.pixelHeight ?? null,
          checksum: input.checksum ?? null,
          metadata: input.metadata ?? {},
          createdAt: new Date().toISOString(),
        };
      },
    },
    designVersionRepo: {
      async createVersion(input: CreateDesignVersionInput) {
        return {
          id: `version-${randomUUID()}`,
          projectId: input.projectId,
          versionNumber: input.versionNumber,
          source: input.source ?? 'customizer',
          designDocument: structuredClone(input.designDocument),
          productSnapshot: structuredClone(input.productSnapshot ?? {}),
          preflightSnapshot: structuredClone(input.preflightSnapshot ?? {}),
          preflightRevision: input.preflightRevision ?? null,
          createdBy: input.createdBy ?? null,
          createdAt: new Date().toISOString(),
        };
      },
    },
    orderRepo: {
      async getByIdempotencyKey(idempotencyKey: string) {
        return serverOrderStore.getOrderByKey(idempotencyKey);
      },
      async createPendingOrder(input: CreatePendingOrderInput) {
        return serverOrderStore.createOrder({
          idempotencyKey: input.idempotencyKey,
          design: input.designSnapshot.design,
          customer: input.customer,
          preflightRevision: input.preflightRevision,
          preflightAcknowledged: true,
        });
      },
      async createGuestAccess() { },
      async deleteById(id: string) {
        serverOrderStore.deleteOrder(id);
      },
    },
    paymentRepo: {
      async create(input) {
        const now = new Date().toISOString();
        return {
          id: `payment-${randomUUID()}`,
          orderId: input.orderId,
          provider: input.provider,
          amount: input.amount,
          currency: input.currency ?? 'VND',
          reference: input.reference,
          qrPayload: input.qrPayload ?? null,
          status: input.status ?? 'pending_payment',
          customerReportedAt: null,
          confirmedAt: null,
          confirmedBy: null,
          createdAt: now,
          updatedAt: now,
        };
      },
    },
    orderEventRepo: {
      async append(input) {
        return {
          id: `event-${randomUUID()}`,
          orderId: input.orderId,
          eventType: input.eventType,
          actorUserId: input.actorUserId ?? null,
          actorRole: input.actorRole ?? null,
          payload: input.payload ?? {},
          createdAt: new Date().toISOString(),
        };
      },
    },
  };
}
