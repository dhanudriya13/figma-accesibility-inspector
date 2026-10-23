export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface RGBA extends RGB {
  a: number;
}

export function rgba(color: RGB, alpha = 1): RGBA {
  return { r: color.r, g: color.g, b: color.b, a: alpha };
}
