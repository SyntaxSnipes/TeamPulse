import { describe, expect, it } from "vitest";

const tokens = {
  page: "#F2F5F6",
  surface: "#FFFFFF",
  ink: "#1D2B36",
  muted: "#4A5963",
  pathGreen: "#0F7B6C",
  nextBlue: "#2F5FD0",
  anomalyRed: "#C23B3B",
  lateAmber: "#8A5200",
  flowGrey: "#8A949C",
};

function luminance(hex: string) {
  const rgb = hex.slice(1).match(/.{2}/g)!.map((channel) => parseInt(channel, 16) / 255);
  const linear = rgb.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(first: string, second: string) {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

describe("light visual token contrast", () => {
  it("keeps body text at or above WCAG AA", () => {
    expect(contrast(tokens.ink, tokens.page)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens.ink, tokens.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens.muted, tokens.page)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens.muted, tokens.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps status text and flow graphics legible", () => {
    for (const color of [tokens.pathGreen, tokens.nextBlue, tokens.anomalyRed, tokens.lateAmber]) {
      expect(contrast(color, tokens.surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(tokens.flowGrey, tokens.surface)).toBeGreaterThanOrEqual(3);
  });
});
