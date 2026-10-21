import { weatherColor } from "./weatherPalette";
import type { Metric } from "./api";

export type GlobeField = {
  latitudes: number[];
  longitudes: number[];
  values: (number | null)[];
  metric: Metric;
  scale: [number, number];
};

/** Interpolate on a periodic longitude grid. Missing corners leave a transparent hole. */
export function gridValue(
  field: GlobeField,
  latitude: number,
  longitude: number,
): number | null {
  const { latitudes: lats, longitudes: lons, values } = field;
  if (
    lats.length < 2 ||
    lons.length < 2 ||
    values.length !== lats.length * lons.length
  )
    return null;
  const y = Math.max(
    0,
    Math.min(lats.length - 1, (latitude - lats[0]) / (lats[1] - lats[0])),
  );
  const x =
    ((((longitude - lons[0]) / (lons[1] - lons[0])) % lons.length) +
      lons.length) %
    lons.length;
  const row = Math.min(lats.length - 2, Math.floor(y)),
    col = Math.floor(x),
    next = (col + 1) % lons.length;
  const dy = y - row,
    dx = x - col;
  const corners = [
    [row * lons.length + col, (1 - dx) * (1 - dy)],
    [row * lons.length + next, dx * (1 - dy)],
    [(row + 1) * lons.length + col, (1 - dx) * dy],
    [(row + 1) * lons.length + next, dx * dy],
  ];
  let result = 0;
  for (const [index, weight] of corners) {
    if (weight < 1e-10) continue;
    const value = values[index];
    if (value == null || !Number.isFinite(value)) return null;
    result += value * weight;
  }
  return result;
}

export type FieldTexture = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
};
export function fieldTexture(field: GlobeField): FieldTexture {
  const width = 720,
    height = 360,
    pixels = new Uint8ClampedArray(width * height * 4);
  const palette = Array.from({ length: 256 }, (_, i) => {
    const color = weatherColor(
      field.metric,
      field.scale[0] + (i / 255) * (field.scale[1] - field.scale[0]),
      field.scale,
    );
    return color.startsWith("#")
      ? [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16))
      : color.match(/\d+/g)!.map(Number);
  });
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const value = gridValue(
        field,
        90 - ((y + 0.5) / height) * 180,
        -180 + ((x + 0.5) / width) * 360,
      );
      if (value === null) continue;
      const index = (y * width + x) * 4,
        t = Math.max(
          0,
          Math.min(
            255,
            Math.round(
              ((value - field.scale[0]) /
                (field.scale[1] - field.scale[0] || 1)) *
                255,
            ),
          ),
        );
      pixels.set([...palette[t], 255], index);
    }
  return { width, height, pixels };
}

/** Orthographic inverse projection; valid on both sides of the date line and at the poles. */
export function projectField(
  texture: FieldTexture,
  longitude: number,
  latitude: number,
  size: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!,
    image = ctx.createImageData(size, size);
  const phi = (latitude * Math.PI) / 180,
    lambda = (longitude * Math.PI) / 180,
    sin = Math.sin(phi),
    cos = Math.cos(phi);
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      const x = ((px + 0.5) / size) * 2 - 1,
        y = 1 - ((py + 0.5) / size) * 2,
        r2 = x * x + y * y;
      if (r2 > 1) continue;
      const z = Math.sqrt(1 - r2),
        lat = Math.asin(Math.max(-1, Math.min(1, y * cos + z * sin))),
        lon = lambda + Math.atan2(x, z * cos - y * sin);
      const tx =
        ((Math.floor(((lon / Math.PI + 1) / 2) * texture.width) %
          texture.width) +
          texture.width) %
        texture.width;
      const ty = Math.min(
        texture.height - 1,
        Math.max(0, Math.floor((0.5 - lat / Math.PI) * texture.height)),
      );
      const source = (ty * texture.width + tx) * 4,
        target = (py * size + px) * 4;
      image.data[target] = texture.pixels[source];
      image.data[target + 1] = texture.pixels[source + 1];
      image.data[target + 2] = texture.pixels[source + 2];
      image.data[target + 3] = texture.pixels[source + 3];
    }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
