import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { siteConfigSchema } from "./config";

describe("site configuration", () => {
  it("accepts the example configuration", () => {
    const config = JSON.parse(readFileSync("config/site.example.json", "utf8")) as unknown;
    expect(siteConfigSchema.parse(config).connector.port).toBe(2575);
  });

  it("rejects an invalid connector port and URL", () => {
    const result = siteConfigSchema.safeParse({
      siteName: "bad",
      mappings: { steps: {}, locations: {}, departments: {}, beds: {}, equipment: {} },
      freshnessLimitsMinutes: {},
      sopFile: "sop.json",
      timeThresholdOverrides: {},
      connector: { port: 0, ingestUrl: "not-a-url" },
    });
    expect(result.success).toBe(false);
  });
});
