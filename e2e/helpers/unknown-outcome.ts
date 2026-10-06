export interface DroppableRouteLike {
  fetch(): Promise<unknown>;
  abort(errorCode?: string): Promise<void>;
}

export interface DroppablePageRouteLike {
  route(
    url: string | RegExp,
    handler: (route: DroppableRouteLike) => Promise<void> | void,
    options?: { times?: number },
  ): Promise<void>;
}

export interface UnknownOutcomeOptions {
  times?: number;
  abortErrorCode?: string;
}

export async function simulateCommittedResponseDrop(
  page: DroppablePageRouteLike,
  urlPattern: string | RegExp,
  verifyCommitFn: () => Promise<void>,
  options: UnknownOutcomeOptions = {},
): Promise<void> {
  const times = options.times ?? 1;
  const abortErrorCode = options.abortErrorCode ?? 'failed';

  await page.route(
    urlPattern,
    async (route) => {
      // 1. Forward request to real server so commit occurs
      await route.fetch();

      // 2. Independently verify the commit in database
      await verifyCommitFn();

      // 3. Drop response to simulate client network disconnect after server commit
      await route.abort(abortErrorCode);
    },
    { times },
  );
}
