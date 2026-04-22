import { getHeapStatistics } from "v8";
import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Configuration – tuneable via environment variables
// ---------------------------------------------------------------------------

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function floatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : fallback;
}

/** Max simultaneous yt-dlp download processes. */
const MAX_CONCURRENT_DOWNLOADS = intEnv("MAX_CONCURRENT_DOWNLOADS", 3);

/** Max simultaneous info-fetch requests. */
const MAX_CONCURRENT_INFO = intEnv("MAX_CONCURRENT_INFO", 5);

/**
 * Fraction of V8's heap size limit that, once exceeded, causes new requests to
 * be rejected.  For example 0.85 → reject when >85 % of the limit is used.
 */
const MEMORY_THRESHOLD = floatEnv("MEMORY_THRESHOLD", 0.85);

/** Per-request timeout in milliseconds (default: 10 minutes). */
const REQUEST_TIMEOUT_MS = intEnv("REQUEST_TIMEOUT_MS", 600000);

/** Max requests waiting in the semaphore queue before rejecting immediately. */
const MAX_QUEUE_DEPTH = intEnv("MAX_QUEUE_DEPTH", 10);

// ---------------------------------------------------------------------------
// Semaphore – limits concurrency for a given category of work
// ---------------------------------------------------------------------------

class Semaphore {
  private running = 0;
  private readonly queue: Array<() => void> = [];

  constructor(
    private readonly max: number,
    private readonly maxQueue: number,
  ) {}

  get pendingCount(): number {
    return this.queue.length;
  }

  acquire(): boolean {
    if (this.running < this.max) {
      this.running++;
      return true;
    }

    return false;
  }

  enqueue(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  get isFull(): boolean {
    return this.queue.length >= this.maxQueue;
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
const downloadSemaphore = new Semaphore(MAX_CONCURRENT_DOWNLOADS, MAX_QUEUE_DEPTH);
const infoSemaphore = new Semaphore(MAX_CONCURRENT_INFO, MAX_QUEUE_DEPTH);

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
      { error: "Server is under heavy memory pressure. Please try again shortly." },
      { status: 503 },
    );
  }

  const semaphore = kind === "download" ? downloadSemaphore : infoSemaphore;

  // 2. Try to acquire a slot immediately, otherwise queue (with depth limit).
  //    Track elapsed time so the timeout budget includes queue wait.
  const requestStart = Date.now();

  if (!semaphore.acquire()) {
    if (semaphore.isFull) {
      const waiting = semaphore.pendingCount;
      console.warn(`[resources] Rejecting ${kind} request – queue full (${waiting} waiting)`);
      return NextResponse.json(
        {
          error: `Server is busy — ${waiting} requests ahead in queue. Please try again shortly.`,
          queued: waiting,
        },
        { status: 503 },
      );
    }
    await semaphore.enqueue();
  }

  // 3. Deduct queue-wait time from the timeout budget so the total
  //    wall-clock time (queue + execution) is bounded by REQUEST_TIMEOUT_MS.
  const elapsed = Date.now() - requestStart;
  const remainingMs = REQUEST_TIMEOUT_MS - elapsed;

  if (remainingMs <= 0) {
    semaphore.release();
    console.warn(`[resources] ${kind} request timed out waiting in queue (${elapsed}ms)`);
    return NextResponse.json(
      { error: "Request timed out waiting for a slot. Please try again later." },
      { status: 504 },
    );
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // 4. Race the handler against the remaining timeout budget.
    const result = await Promise.race([
      handler(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new TimeoutError(kind));
        }, remainingMs);
      }),
    ]);
    return result;
  } catch (err) {
    if (err instanceof TimeoutError) {
      console.warn(`[resources] ${kind} request timed out after ${Date.now() - requestStart}ms (budget: ${REQUEST_TIMEOUT_MS}ms)`);
      return NextResponse.json(
        { error: "Request timed out. Please try a shorter video or try again later." },
        { status: 504 },
      ) as NextResponse;
    }
    throw err;
  } finally {
    clearTimeout(timer);
    semaphore.release();
  }
}

class TimeoutError extends Error {
  constructor(kind: string) {
    super(`${kind} request exceeded ${REQUEST_TIMEOUT_MS}ms timeout`);
    this.name = "TimeoutError";
  }
}
