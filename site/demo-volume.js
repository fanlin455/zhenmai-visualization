// Display-only extension of a 2D result; NOT a predicted geological volume.
((root) => {
  const clamp = value => Math.max(0, Math.min(1, value));
  const create = (rgba, width, height, categorical = true) => {
    const sample = (x, y, z) => {
      const depth = z - .5;
      const sx = clamp(x + depth * .12 * Math.sin(2 * Math.PI * (y + z * .7)));
      const sy = clamp(y + depth * .16 * Math.sin(2 * Math.PI * (x * .8 + z)));
      return [sx * (width - 1), sy * (height - 1)];
    };
    const render = (axis, position, outWidth = width, outHeight = height) => {
      if (!['x', 'y', 'z'].includes(axis)) throw new Error('Unknown slice axis');
      const pixels = new Uint8ClampedArray(outWidth * outHeight * 4);
      for (let row = 0; row < outHeight; row++) {
        const v = row / Math.max(1, outHeight - 1);
        for (let column = 0; column < outWidth; column++) {
          const u = column / Math.max(1, outWidth - 1);
          const x = axis === 'x' ? clamp(position) : u;
          const y = axis === 'y' ? clamp(position) : v;
          const z = axis === 'z' ? clamp(position) : axis === 'x' ? u : v;
          const [sx, sy] = sample(x, y, z);
          const dst = (row * outWidth + column) * 4;
          if (categorical) {
            const src = (Math.round(sy) * width + Math.round(sx)) * 4;
            pixels.set(rgba.subarray(src, src + 4), dst);
          } else {
            const x0 = Math.floor(sx), y0 = Math.floor(sy);
            const x1 = Math.min(x0 + 1, width - 1), y1 = Math.min(y0 + 1, height - 1);
            const fx = sx - x0, fy = sy - y0;
            for (let c = 0; c < 4; c++) {
              const top = rgba[(y0 * width + x0) * 4 + c] * (1 - fx) + rgba[(y0 * width + x1) * 4 + c] * fx;
              const bottom = rgba[(y1 * width + x0) * 4 + c] * (1 - fx) + rgba[(y1 * width + x1) * 4 + c] * fx;
              pixels[dst + c] = top * (1 - fy) + bottom * fy;
            }
          }
        }
      }
      return pixels;
    };
    return { render };
  };
  root.DemoVolume = { create };
  if (typeof module !== 'undefined') module.exports = root.DemoVolume;
})(globalThis);
