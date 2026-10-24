import { describe, expect, it } from "vitest";
import { detectSurge } from "./surge";

describe("surge detection", () => {
  it("detects the t=120 scenario", () => {
    expect(detectSurge({ arrivals: [...Array.from({ length: 11 }, (_, index) => 110 + index), 120], now: 120 }).active).toBe(true);
  });

  it("does not count arrivals outside the window", () => {
    expect(detectSurge({ arrivals: [1, 2, 3], now: 120 }).active).toBe(false);
  });
});
