import { getHeapStatistics } from "v8";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Configuration – tuneable via environment variables
// ---------------------------------------------------------------------------

/** Max simultaneous yt-dlp download processes. */
const MAX_CONCURRENT_DOWNLOADS = parseInt(
  process.env.MAX_CONCURRENT_DOWNLOADS ?? "3",
  10,
);

/** Max simultaneous info-fetch requests. */
const MAX_CONCURRENT_INFO = parseInt(
  process.env.MAX_CONCURRENT_INFO ?? "5",
  10,
);

/**
 * Fraction of V8's heap size limit that, once exceeded, causes new requests to
 * be rejected.  For example 0.85 → reject when >85 % of the limit is used.
 */
const MEMORY_THRESHOLD = parseFloat(
  process.env.MEMORY_THRESHOLD ?? "0.85",
);

/** Per-request timeout in milliseconds (default: 10 minutes). */
const REQUEST_TIMEOUT_MS = parseInt(
  process.env.REQUEST_TIMEOUT_MS ?? "600000",
  10,
);

// ---------------------------------------------------------------------------
// Semaphore – limits concurrency for a given category of work
// ---------------------------------------------------------------------------

class Semaphore {
  private running = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  get activeCount(): number {
    return this.running;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.running--;
    }
  }
}

// Singleton semaphores – survive across requests in the same process.
const downloadSemaphore = new Semaphore(MAX_CONCURRENT_DOWNLOADS);
const infoSemaphore = new Semaphore(MAX_CONCURRENT_INFO);

// ---------------------------------------------------------------------------
// Memory guard
// ---------------------------------------------------------------------------

function isMemoryPressureHigh(): boolean {
  const stats = getHeapStatistics();
  const limit = stats.heap_size_limit;
  const used = stats.used_heap_size;
  return limit > 0 && used / limit > MEMORY_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export type ResourceKind = "download" | "info";

/**
 * Wrap an async handler with concurrency + memory + timeout guards.
 *
 * If resources are exhausted the caller receives a 503 response.
 * If the handler exceeds `REQUEST_TIMEOUT_MS` the guard returns a 504 and
 * frees the semaphore slot (the underlying work may still finish in the
 * background — ytdlp-nodejs does not support AbortSignal).
 */
export async function withResourceGuard<T extends Response | NextResponse>(
  kind: ResourceKind,
  handler: () => Promise<T>,
): Promise<T | NextResponse> {
  // 1. Memory check – fail-fast before queuing.
  if (isMemoryPressureHigh()) {
    console.warn("[resources] Rejecting request – memory pressure too high");
    return NextResponse.json(
      { error: "Server is under heavy load. Please try again shortly." },
      { status: 503 },
    );
  }

  const semaphore = kind === "download" ? downloadSemaphore : infoSemaphore;

  // 2. Acquire a slot (waits if all slots are occupied).
  await semaphore.acquire();

  try {
    // 3. Race the handler against a timeout promise.
    const result = await Promise.race([
      handler(),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => {
          reject(new TimeoutError(kind));
        }, REQUEST_TIMEOUT_MS);
      }),
    ]);
    return result;
  } catch (err) {
    if (err instanceof TimeoutError) {
      console.warn(`[resources] ${kind} request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      return NextResponse.json(
        { error: "Request timed out. Please try a shorter video or try again later." },
        { status: 504 },
      ) as NextResponse;
    }
    throw err;
  } finally {
    semaphore.release();
  }
}

class TimeoutError extends Error {
  constructor(kind: string) {
    super(`${kind} request exceeded ${REQUEST_TIMEOUT_MS}ms timeout`);
    this.name = "TimeoutError";
  }
}
