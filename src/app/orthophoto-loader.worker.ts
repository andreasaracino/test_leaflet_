/// <reference lib="webworker" />

import {getBordersFromCorners} from "./image.util";

addEventListener('message', ({ data }) => {
  const response = render(data[0], data[1]);
  postMessage(response);
});

function render(img: ImageBitmap, corners, step = 1) {
  const { borders, width, height } = normalizedCorners(corners);
  const canvas: OffscreenCanvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  let p1, p2, p3, p4, y1c, y2c, y1n, y2n,
    w = img.width - 1, // -1 to give room for the "next" points
    h = img.height - 1;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      y1c = lerp(borders[0], borders[3], y / h);
      y2c = lerp(borders[1], borders[2], y / h);
      y1n = lerp(borders[0], borders[3], (y + step) / h);
      y2n = lerp(borders[1], borders[2], (y + step) / h);

      // corners of the new subdivided cell p1 (ul) -> p2 (ur) -> p3 (br) -> p4 (bl)
      p1 = lerp(y1c, y2c, x / w);
      p2 = lerp(y1c, y2c, (x + step) / w);
      p3 = lerp(y1n, y2n, (x + step) / w);
      p4 = lerp(y1n, y2n, x / w);

      ctx.drawImage(img, x, y, step, step, p1.x, p1.y, // get most coverage for w/h:
        Math.ceil(Math.max(step, Math.abs(p2.x - p1.x), Math.abs(p4.x - p3.x))) + 1,
        Math.ceil(Math.max(step, Math.abs(p1.y - p4.y), Math.abs(p2.y - p3.y))) + 1)
    }
  }

  // document.body.appendChild(canvas);
  return { borders, canvas: canvas.transferToImageBitmap(), width, height };
}

function normalizedCorners(corners) {
  const {
    leftBorder,
    bottomBorder,
    width,
    height
  } = getBordersFromCorners(corners);

  return {
    borders: [
      { // UL
        x: corners[0].x - leftBorder,
        y: corners[0].y - bottomBorder,
      },
      { // UR
        x: corners[1].x - leftBorder,
        y: corners[1].y - bottomBorder,
      },
      { // BR
        x: corners[2].x - leftBorder,
        y: corners[2].y - bottomBorder,
      },
      { // BL
        x: corners[3].x - leftBorder,
        y: corners[3].y - bottomBorder,
      },
    ],
    width,
    height,
  };
}

function lerp(p1, p2, t) {
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t
  }
}