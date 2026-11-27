/**
 * Makes any uploaded logo look like the others on the VSL page: one
 * flat light shape on a transparent background, trimmed to its edges
 * and scaled to the same height. Runs in the browser, before upload.
 *
 * Logos arrive every possible way: a transparent PNG in colour, a
 * white logo meant for dark backgrounds, a JPG on a white box, a
 * screenshot on black. Recolouring with a CSS filter alone turns the
 * boxed ones into solid grey rectangles, so instead:
 *
 *   1. Look at the border. If it's see-through, the logo is whatever
 *      isn't. If it's solid, that colour is the background, and the
 *      logo is whatever differs from it, by how much it differs.
 *   2. Paint the logo as one colour (white), keeping how strongly
 *      each pixel belongs to it as its transparency, so soft edges
 *      stay soft.
 *   3. Trim to the logo and scale to a fixed height.
 *
 * The page then shows every one at the same height and the same
 * light grey, as in the strip it was modelled on.
 */

const OUT_HEIGHT = 160;
const MAX_WIDTH = 900;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file couldn’t be opened as an image."));
    };
    img.src = url;
  });
}

export async function evenOutLogo(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (PNG, JPG, SVG or WebP).");
  const img = await loadImage(file);
  // Work at a sensible size: big enough for clean edges, small enough to be quick.
  const scale = Math.min(1, 1200 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1)) || 1;
  const w = Math.max(1, Math.round((img.naturalWidth || 600) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || 300) * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser can’t process images.");
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // 1. The border: transparent, or a solid background colour.
  let seeThrough = 0;
  let count = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  const sample = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    count++;
    if (px[i + 3] < 128) seeThrough++;
    else {
      r += px[i];
      g += px[i + 1];
      b += px[i + 2];
    }
  };
  for (let x = 0; x < w; x++) {
    sample(x, 0);
    sample(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    sample(0, y);
    sample(w - 1, y);
  }
  const transparentBorder = seeThrough / count > 0.5;
  const solid = count - seeThrough || 1;
  const bg = [r / solid, g / solid, b / solid];

  // 2. How much each pixel belongs to the logo, 0..255.
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let a: number;
      if (transparentBorder) {
        a = px[i + 3];
      } else {
        const d = Math.max(Math.abs(px[i] - bg[0]), Math.abs(px[i + 1] - bg[1]), Math.abs(px[i + 2] - bg[2]));
        // Ignore JPEG noise near the background; full strength well clear of it.
        a = Math.max(0, Math.min(255, ((d - 24) / 90) * 255)) * (px[i + 3] / 255);
      }
      px[i] = 255;
      px[i + 1] = 255;
      px[i + 2] = 255;
      px[i + 3] = a;
      if (a > 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("No logo could be found in that image. Try a version with more contrast.");
  ctx.putImageData(data, 0, 0);

  // 3. Trim and scale to one height (wide wordmarks capped in width).
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  let outH = OUT_HEIGHT;
  let outW = Math.round((cw / ch) * outH);
  if (outW > MAX_WIDTH) {
    outW = MAX_WIDTH;
    outH = Math.max(1, Math.round((ch / cw) * outW));
  }
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("This browser can’t process images.");
  octx.imageSmoothingQuality = "high";
  octx.drawImage(canvas, minX, minY, cw, ch, 0, 0, outW, outH);
  return { dataUrl: out.toDataURL("image/png"), width: outW, height: outH };
}
