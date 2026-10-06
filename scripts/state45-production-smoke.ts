import { spawn, type ChildProcess } from 'node:child_process';

export interface ProductionSmokeOptions {
  baseUrl?: string;
  port?: number;
  skipBuild?: boolean;
  timeoutMs?: number;
}

export interface RouteCheckResult {
  route: string;
  status: number;
  ok: boolean;
  notes?: string;
}

export interface ProductionSmokeResult {
  success: boolean;
  buildCompleted: boolean;
  checks: RouteCheckResult[];
}

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

async function terminateProcess(proc: ChildProcess | null): Promise<void> {
  if (!proc || typeof proc.pid !== 'number') return;
  const pid = proc.pid;

  if (process.platform === 'win32') {
    const { promise, resolve } = Promise.withResolvers<void>();
    const killer = spawn('taskkill', ['/pid', pid.toString(), '/f', '/t']);
    killer.on('close', () => resolve());
    killer.on('error', () => resolve());
    await promise;
  } else {
    proc.kill('SIGTERM');
  }
  await delay(500);
}

async function runBuildStep(): Promise<void> {
  console.log('[State45Smoke] Building Next.js production bundle (next build)...');
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'cmd.exe' : 'npx';
  const args = isWin ? ['/c', 'npx', 'next', 'build'] : ['next', 'build'];

  const { promise, resolve, reject } = Promise.withResolvers<number>();
  const buildProc = spawn(cmd, args, {
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'inherit',
  });
  buildProc.on('close', (code) => resolve(code ?? 1));
  buildProc.on('error', reject);
  const exitCode = await promise;

  if (exitCode !== 0) {
    throw new Error(`Production build failed with exit code ${exitCode}`);
  }
  console.log('[State45Smoke] Production build succeeded.');
}

async function checkPortResponding(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(baseUrl, { method: 'GET', redirect: 'manual' });
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function runProductionSmoke(
  options: ProductionSmokeOptions = {},
): Promise<ProductionSmokeResult> {
  const port = options.port ?? 3000;
  const baseUrl = options.baseUrl ?? `http://localhost:${port}`;
  const skipBuild = options.skipBuild ?? false;
  const timeoutMs = options.timeoutMs ?? 45000;

  if (!skipBuild) {
    await runBuildStep();
  }

  let serverProc: ChildProcess | null = null;
  const checks: RouteCheckResult[] = [];

  try {
    const alreadyRunning = await checkPortResponding(baseUrl);
    if (!alreadyRunning) {
      console.log(`[State45Smoke] Launching production server on port ${port}...`);
      const isWin = process.platform === 'win32';
      const cmd = isWin ? 'cmd.exe' : 'npx';
      const args = isWin
        ? ['/c', 'npx', 'next', 'start', '-p', String(port)]
        : ['next', 'start', '-p', String(port)];

      serverProc = spawn(cmd, args, {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: String(port),
          ENABLE_TEST_STAFF_BYPASS: '1',
        },
        stdio: 'ignore',
      });

      const start = Date.now();
      let ready = false;
      while (Date.now() - start < timeoutMs) {
        await delay(500);
        if (await checkPortResponding(baseUrl)) {
          ready = true;
          break;
        }
      }

      if (!ready) {
        throw new Error(
          `Production server did not respond at ${baseUrl} within ${timeoutMs / 1000}s`,
        );
      }
      console.log(`[State45Smoke] Production server ready at ${baseUrl}`);
    } else {
      console.log(`[State45Smoke] Using already running server at ${baseUrl}`);
    }

    // Under NODE_ENV=production, unauthenticated /admin/orders redirecting to /admin/login (307)
    // is the EXPECTED and REQUIRED secure behavior (since production ignores synthetic staff cookies).
    const testRoutes: Array<{
      path: string;
      expectStatuses: number[];
      expectedRedirect?: string;
    }> = [
        { path: '/', expectStatuses: [200] },
        { path: '/checkout', expectStatuses: [200] },
        { path: '/login', expectStatuses: [200] },
        { path: '/admin/orders', expectStatuses: [307], expectedRedirect: '/admin/login' },
      ];

    for (const item of testRoutes) {
      const url = `${baseUrl}${item.path}`;
      const res = await fetch(url, { redirect: 'manual' });
      const status = res.status;
      const text = await res.text();
      const location = res.headers.get('location') ?? '';
      const hasErrorShell =
        text.includes('Application error: a client-side exception') ||
        text.includes('Internal Server Error') ||
        (status >= 500 && status < 600);

      const statusOk = item.expectStatuses.includes(status);
      const redirectOk = !item.expectedRedirect || location.includes(item.expectedRedirect);
      const ok = statusOk && redirectOk && !hasErrorShell;

      checks.push({
        route: item.path,
        status,
        ok,
        notes: ok
          ? (item.expectedRedirect ? `Secure redirect (307) to ${location}` : 'Healthy')
          : `Unexpected status, missing redirect, or error shell (status=${status}, location=${location})`,
      });
      console.log(`[State45Smoke] Route "${item.path}": ${status}${location ? ` -> ${location}` : ''} -> ${ok ? 'OK' : 'FAIL'}`);
    }

    const allOk = checks.every((c) => c.ok);
    return {
      success: allOk,
      buildCompleted: !skipBuild,
      checks,
    };
  } finally {
    if (serverProc) {
      console.log('[State45Smoke] Stopping spawned production server...');
      await terminateProcess(serverProc);
    }
  }
}

if (process.argv[1]?.endsWith('state45-production-smoke.ts')) {
  const args = process.argv.slice(2);
  const skipBuild = args.includes('--skip-build');
  let port = 3000;
  let baseUrl = 'http://localhost:3000';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[++i], 10);
      baseUrl = `http://localhost:${port}`;
    } else if (args[i] === '--base-url' && args[i + 1]) {
      baseUrl = args[++i];
    }
  }

  runProductionSmoke({ skipBuild, port, baseUrl })
    .then((result) => {
      if (!result.success) {
        console.error('[State45Smoke] Verification failed for some routes:', result.checks);
        process.exit(1);
      }
      console.log('[State45Smoke] ✓ All production smoke route checks passed.');
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error('[State45Smoke] Error during production smoke run:', err);
      process.exit(1);
    });
}
