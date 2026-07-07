import { LRUCache } from "lru-cache";

// Shared server-side caching module. First needed at CHESS-008 (opening book
// proxy) and deliberately built as ONE reusable factory rather than an ad-hoc
// Map local to that route — CHESS-012/024/026 each construct their own named
// cache from this same factory instead of reinventing one.
//
// Each caller owns its own instance with its own TTL/max, so keyspaces never
// collide between features. lru-cache handles TTL expiry and the max-entry
// eviction bound for us.
export interface CacheOptions {
  /** Time-to-live per entry, in milliseconds. */
  ttl: number;
  /** Maximum number of entries before least-recently-used eviction. */
  max: number;
}

// Values are constrained to non-nullish objects: lru-cache treats `undefined`
// as "absent", so storing it would make get()/has() lie about membership.
export function createCache<V extends object>(
  options: CacheOptions,
): LRUCache<string, V> {
  return new LRUCache<string, V>({
    max: options.max,
    ttl: options.ttl,
    // Refresh recency on read so genuinely hot positions survive eviction, but
    // do NOT extend the TTL on read — a 7-day-old opening stat is still 7 days
    // old however often it's looked up; freshness is a function of ingest time,
    // not access time.
    updateAgeOnGet: false,
  });
}
