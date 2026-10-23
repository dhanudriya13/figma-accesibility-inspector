import type { RGB, RGBA } from "../model/color";

const EPSILON = 0.0001;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toRgba(color: RGB & { a?: number }): RGBA {
  return {
    r: clamp(color.r, 0, 1),
    g: clamp(color.g, 0, 1),
    b: clamp(color.b, 0, 1),
    a: color.a === undefined ? 1 : clamp(color.a, 0, 1),
  };
}

export function withAlpha(color: RGBA, alpha: number): RGBA {
  return { ...color, a: clamp(alpha, 0, 1) };
}

export function compositeOver(foreground: RGBA, background: RGBA): RGBA {
  const fgAlpha = foreground.a + background.a * (1 - foreground.a);
  if (fgAlpha <= EPSILON) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  return {
    r:
      (foreground.r * foreground.a +
        background.r * background.a * (1 - foreground.a)) /
      fgAlpha,
    g:
      (foreground.g * foreground.a +
        background.g * background.a * (1 - foreground.a)) /
      fgAlpha,
    b:
      (foreground.b * foreground.a +
        background.b * background.a * (1 - foreground.a)) /
      fgAlpha,
    a: clamp(fgAlpha, 0, 1),
  };
}

function linearizeChannel(channel: number): number {
  return channel <= 0.03928
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(color: RGBA): number {
  const r = linearizeChannel(clamp(color.r, 0, 1));
  const g = linearizeChannel(clamp(color.g, 0, 1));
  const b = linearizeChannel(clamp(color.b, 0, 1));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first: RGBA, second: RGBA): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function roundRatio(ratio: number): number {
  return Math.round(ratio * 100) / 100;
}

function channelToHex(channel: number): string {
  return Math.round(clamp(channel, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0");
}

export function formatColor(color: RGBA): string {
  if (color.a >= 0.999) {
    return `#${channelToHex(color.r)}${channelToHex(color.g)}${channelToHex(color.b)}`;
  }

  const alpha = Math.round(color.a * 100) / 100;
  const red = Math.round(clamp(color.r, 0, 1) * 255);
  const green = Math.round(clamp(color.g, 0, 1) * 255);
  const blue = Math.round(clamp(color.b, 0, 1) * 255);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function colorKey(color: RGBA): string {
  return formatColor(color).toLowerCase();
}

export function hexToRgba(hex: string): RGBA {
  const value = hex.trim().replace(/^#/, "");
  const expanded =
    value.length === 3
      ? value
          .split("")
          .map((character) => character + character)
          .join("")
      : value;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`Unsupported hex color: ${hex}`);
  }

  return {
    r: parseInt(expanded.slice(0, 2), 16) / 255,
    g: parseInt(expanded.slice(2, 4), 16) / 255,
    b: parseInt(expanded.slice(4, 6), 16) / 255,
    a: 1,
  };
}

export interface LargeTextClassification {
  large: boolean;
  uncertain: boolean;
  threshold: number;
  reason: string;
}

export function isLargeText(
  fontSizePx: number | undefined,
  fontWeight: number | undefined,
): LargeTextClassification {
  const fontIsKnown = typeof fontSizePx === "number" && fontSizePx > 0;

  if (!fontIsKnown) {
    return {
      large: false,
      uncertain: true,
      threshold: 4.5,
      reason:
        "Font size was unavailable or mixed; the stricter normal-text threshold was used.",
    };
  }

  if (fontSizePx >= 24 - 0.01) {
    return {
      large: true,
      uncertain: false,
      threshold: 3,
      reason: `Font size ${roundRatio(fontSizePx)}px meets the 24px large-text threshold.`,
    };
  }

  if (fontSizePx >= 18.66 - 0.01) {
    if (fontWeight === undefined) {
      return {
        large: false,
        uncertain: true,
        threshold: 4.5,
        reason:
          "Font size is in the large-text range, but font weight was unavailable or mixed; the stricter normal-text threshold was used.",
      };
    }

    if (fontWeight >= 700) {
      return {
        large: true,
        uncertain: false,
        threshold: 3,
        reason: `Font size ${roundRatio(fontSizePx)}px with weight ${fontWeight} meets the 18.66px bold large-text threshold.`,
      };
    }

    return {
      large: false,
      uncertain: false,
      threshold: 4.5,
      reason: `Font size ${roundRatio(fontSizePx)}px with weight ${fontWeight} is not large text.`,
    };
  }

  return {
    large: false,
    uncertain: false,
    threshold: 4.5,
    reason: `Font size ${roundRatio(fontSizePx)}px is below the large-text thresholds.`,
  };
}
