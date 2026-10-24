import { clamp } from "./geometry";

/** Box blur of a W x H float image, two passes (horizontal, vertical), radius r in pixels. */
export function boxBlur(a: Float32Array, W: number, H: number, r: number): Float32Array {
  const pass = (src: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(src.length);
    const n = horizontal ? W : H;
    const lines = horizontal ? H : W;
    for (let l = 0; l < lines; l++) {
      const at = (i: number) => src[horizontal ? l * W + clamp(i, 0, n - 1) : clamp(i, 0, n - 1) * W + l];
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += at(i);
      for (let i = 0; i < n; i++) {
        out[horizontal ? l * W + i : i * W + l] = sum / (2 * r + 1);
        sum += at(i + r + 1) - at(i - r);
      }
    }
    return out;
  };
  return pass(pass(a, true), false);
}
