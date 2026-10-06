export interface OfflineContextLike {
  setOffline(offline: boolean): Promise<void>;
}

export interface RouteLike {
  abort(errorCode?: string): Promise<void>;
  continue(): Promise<void>;
  fulfill(response: {
    status?: number;
    contentType?: string;
    body?: string;
    headers?: Record<string, string>;
  }): Promise<void>;
}

export interface PageRouteLike {
  route(
    url: string | RegExp,
    handler: (route: RouteLike) => Promise<void> | void,
    options?: { times?: number },
  ): Promise<void>;
  unroute?(
    url: string | RegExp,
    handler?: (route: RouteLike) => Promise<void> | void,
  ): Promise<void>;
  addInitScript?(script: string | { content?: string }): Promise<void>;
  evaluate?<R>(pageFunction: () => R): Promise<R>;
}

export async function simulateOffline(
  context: OfflineContextLike,
): Promise<() => Promise<void>> {
  await context.setOffline(true);
  return async () => {
    await context.setOffline(false);
  };
}

export async function simulateRouteFailure(
  page: PageRouteLike,
  urlPattern: string | RegExp,
  status = 500,
  responseData?: unknown,
  options?: { times?: number },
): Promise<void> {
  const body = JSON.stringify(
    responseData ?? {
      ok: false,
      code: 'FAULT_INJECTED_ERROR',
      message: `Controlled test fault injection with status ${status}`,
    },
  );

  await page.route(
    urlPattern,
    async (route) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body,
        headers: {
          'x-state45-fault-injected': '1',
          'cache-control': 'no-store',
        },
      });
    },
    options,
  );
}

export async function simulateNetworkDelay(
  page: PageRouteLike,
  urlPattern: string | RegExp,
  delayMs: number,
  options?: { times?: number },
): Promise<void> {
  await page.route(
    urlPattern,
    async (route) => {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, delayMs);
      await promise;
      await route.continue();
    },
    options,
  );
}

export async function simulateStorageQuotaFailure(
  page: PageRouteLike,
  target: 'all' | 'localStorage' | 'sessionStorage' | 'indexedDB' = 'all',
): Promise<void> {
  const scriptContent = `(() => {
    const throwQuota = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
    if (('${target}' === 'all' || '${target}' === 'localStorage') && window.Storage) {
      window.Storage.prototype.setItem = function() {
        throwQuota();
      };
    }
    if (('${target}' === 'all' || '${target}' === 'sessionStorage') && window.sessionStorage) {
      window.sessionStorage.setItem = function() {
        throwQuota();
      };
    }
    if (('${target}' === 'all' || '${target}' === 'indexedDB') && window.indexedDB) {
      window.indexedDB.open = function() {
        throwQuota();
      };
    }
  })();`;

  if (page.addInitScript) {
    await page.addInitScript(scriptContent);
  } else if (page.evaluate) {
    await page.evaluate(() => {
      const throwQuota = () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      };
      if (window.Storage) {
        window.Storage.prototype.setItem = () => throwQuota();
      }
    });
  }
}
