import { describe, expect, it } from "vitest";
import {
  colorKey,
  compositeOver,
  contrastRatio,
  formatColor,
  hexToRgba,
  isLargeText,
  relativeLuminance,
  roundRatio,
} from "../../src/resolver/color-resolver";

describe("color resolver", () => {
  it("computes the maximum contrast for black and white", () => {
    expect(roundRatio(contrastRatio(hexToRgba("#000000"), hexToRgba("#ffffff")))).toBe(21);
  });

  it("matches the known #777777 on white ratio", () => {
    const ratio = contrastRatio(hexToRgba("#777777"), hexToRgba("#ffffff"));
    expect(roundRatio(ratio)).toBe(4.48);
  });

  it("uses the WCAG relative luminance coefficients", () => {
    expect(relativeLuminance(hexToRgba("#000000"))).toBe(0);
    expect(relativeLuminance(hexToRgba("#ffffff"))).toBeCloseTo(1, 5);
    expect(relativeLuminance(hexToRgba("#ff0000"))).toBeCloseTo(0.2126, 4);
    expect(relativeLuminance(hexToRgba("#00ff00"))).toBeCloseTo(0.7152, 4);
    expect(relativeLuminance(hexToRgba("#0000ff"))).toBeCloseTo(0.0722, 4);
  });

  it("composites alpha over an opaque background", () => {
    const composite = compositeOver(
      { r: 0, g: 0, b: 0, a: 0.5 },
      { r: 1, g: 1, b: 1, a: 1 },
    );
    expect(composite.r).toBeCloseTo(0.5, 5);
    expect(composite.g).toBeCloseTo(0.5, 5);
    expect(composite.b).toBeCloseTo(0.5, 5);
    expect(composite.a).toBeCloseTo(1, 5);
  });

  it("formats opaque and translucent colors", () => {
    expect(formatColor(hexToRgba("#336699"))).toBe("#336699");
    expect(formatColor({ r: 0, g: 0, b: 0, a: 0.5 })).toBe("rgba(0, 0, 0, 0.5)");
    expect(colorKey({ r: 1, g: 1, b: 1, a: 1 })).toBe("#ffffff");
  });

  it("classifies large text from size and weight", () => {
    expect(isLargeText(24, 400)).toMatchObject({ large: true, uncertain: false, threshold: 3 });
    expect(isLargeText(18.66, 700)).toMatchObject({ large: true, uncertain: false, threshold: 3 });
    expect(isLargeText(20, 400)).toMatchObject({ large: false, uncertain: false, threshold: 4.5 });
    expect(isLargeText(20, undefined)).toMatchObject({ large: false, uncertain: true, threshold: 4.5 });
    expect(isLargeText(undefined, 700)).toMatchObject({ large: false, uncertain: true, threshold: 4.5 });
  });

  it("rejects malformed hex values", () => {
    expect(() => hexToRgba("#12")).toThrow();
  });
});
