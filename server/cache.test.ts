import { describe, it, expect } from "vitest";
import { createCache } from "./cache.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("createCache", () => {
  it("returns undefined on a miss", () => {
    const cache = createCache<{ v: number }>({ ttl: 1000, max: 10 });
    expect(cache.get("absent")).toBeUndefined();
    expect(cache.has("absent")).toBe(false);
  });

  it("returns a stored value on a hit", () => {
    const cache = createCache<{ v: number }>({ ttl: 1000, max: 10 });
    cache.set("k", { v: 42 });
    expect(cache.has("k")).toBe(true);
    expect(cache.get("k")).toEqual({ v: 42 });
  });

  it("expires an entry after its TTL elapses", async () => {
    const cache = createCache<{ v: number }>({ ttl: 20, max: 10 });
    cache.set("k", { v: 1 });
    expect(cache.get("k")).toEqual({ v: 1 });
    await sleep(40);
    expect(cache.get("k")).toBeUndefined();
    expect(cache.has("k")).toBe(false);
  });

  it("evicts the least-recently-used entry past max", () => {
    const cache = createCache<{ v: number }>({ ttl: 10_000, max: 2 });
    cache.set("a", { v: 1 });
    cache.set("b", { v: 2 });
    cache.get("a"); // touch 'a' so 'b' is now least-recently-used
    cache.set("c", { v: 3 }); // over max -> evicts 'b'
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
  });
});
