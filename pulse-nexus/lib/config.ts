import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

export const siteConfigSchema = z.object({
  siteName: z.string().min(1),
  mappings: z.object({
    steps: z.record(z.string(), z.string().min(1)),
    locations: z.record(z.string(), z.string().min(1)),
    departments: z.record(z.string(), z.string().min(1)),
    beds: z.record(z.string(), z.string().min(1)),
    equipment: z.record(z.string(), z.string().min(1)),
  }),
  freshnessLimitsMinutes: z.record(z.string(), z.number().positive()),
  sopFile: z.string().min(1),
  timeThresholdOverrides: z.record(z.string(), z.number().nonnegative()),
  connector: z.object({
    port: z.number().int().min(1).max(65535),
    ingestUrl: z.string().url(),
  }),
});

export type SiteConfig = z.infer<typeof siteConfigSchema>;

export function loadSiteConfig(filePath = process.env.SITE_CONFIG_PATH ?? "config/site.example.json"): SiteConfig {
  const resolved = resolve(process.cwd(), filePath);
  try {
    const raw = JSON.parse(readFileSync(resolved, "utf8")) as unknown;
    return siteConfigSchema.parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid site configuration at ${resolved}: ${error.issues.map((issue) => issue.path.join(".") + " " + issue.message).join("; ")}`);
    }
    throw new Error(`Could not load site configuration at ${resolved}: ${error instanceof Error ? error.message : String(error)}`);
  }
}