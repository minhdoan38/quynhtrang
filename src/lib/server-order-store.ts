import type { CustomerInfo, PendingOrder, ApprovedDesignSnapshot } from './order-types.ts';
import { getDesignSummary, type DesignState } from './product-state.ts';

// Server-side memory storage adapter for orders and immutable design snapshots
class ServerOrderStore {
  private orders: Map<string, PendingOrder> = new Map();
  private snapshots: Map<string, ApprovedDesignSnapshot> = new Map();

  createOrder(design: DesignState, customer: CustomerInfo): PendingOrder {
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

    const order: PendingOrder = {
      id: orderId,
      status: 'pending',
      paymentStatus: 'pending', // Payment initially always pending confirmation
      customer: { ...customer },
      snapshot,
      createdAt: new Date().toISOString(),
    };

    this.snapshots.set(snapshotId, snapshot);
    this.orders.set(orderId, order);

    return order;
  }

  getOrder(id: string): PendingOrder | null {
    const order = this.orders.get(id);
    return order ? JSON.parse(JSON.stringify(order)) : null;
  }

  getSnapshot(id: string): ApprovedDesignSnapshot | null {
    const snapshot = this.snapshots.get(id);
    return snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
  }

  clear(): void {
    this.orders.clear();
    this.snapshots.clear();
  }
}

// Global singleton instance for Node/Next server runtime
const globalStoreKey = Symbol.for('quynhtrang.serverOrderStore');
const globalAny = globalThis as unknown as { [key: symbol]: ServerOrderStore };

if (!globalAny[globalStoreKey]) {
  globalAny[globalStoreKey] = new ServerOrderStore();
}

export const serverOrderStore: ServerOrderStore = globalAny[globalStoreKey];
