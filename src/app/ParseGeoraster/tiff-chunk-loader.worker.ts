import {Observable} from "rxjs";

addEventListener('message', ({data}) => {
  const {
    minXTile, maxXTile, maxYTile,
    samples,
    bytesPerPixel,
    image,
    poolOrDecoder,
    xTile,
    yTile,
    arrayBuffer,
    tileWidth,
    tileHeight,
    sampleReaders,
    imageWindow,
    srcSampleOffsets,
    littleEndian,
    valueArrays,
    windowWidth
  } = data;
  let iters = 0
  for (let xTile = minXTile; xTile < maxXTile; xTile++) {
    decodeTile({
      samples,
      bytesPerPixel,
      image,
      poolOrDecoder,
      xTile,
      yTile,
      arrayBuffer,
      tileWidth,
      tileHeight,
      sampleReaders,
      imageWindow,
      srcSampleOffsets,
      littleEndian,
      valueArrays,
      windowWidth
    })
      .subscribe(() => {
        iters++;
        if (iters % maxXTile === 0 || iters === maxYTile * maxXTile) {
          // @ts-ignore
          postMessage({img: valueArrays, finish: iters, tiles: maxYTile * maxXTile});
          // console.timeEnd('inner for')
        }
      });
  }
})

export function decodeTile({
                             samples,
                             bytesPerPixel,
                             image,
                             poolOrDecoder,
                             xTile,
                             yTile,
                             arrayBuffer,
                             tileWidth,
                             tileHeight,
                             sampleReaders,
                             imageWindow,
                             srcSampleOffsets,
                             littleEndian,
                             valueArrays,
                             windowWidth
                           }) {
  return new Observable<never>((subscriber) => {
    let iters = 0;
    for (let si = 0; si < samples.length; si++) {
      const sample = samples[si];
      if (image.planarConfiguration === 2) {
        bytesPerPixel = image.getSampleByteSize(sample);
      }
      const promise = getTileOrStrip(image, xTile, yTile, sample, poolOrDecoder, arrayBuffer);
      promise.then((tile) => {
        const buffer = tile.data;
        const dataView = new DataView(buffer);
        const firstLine = yTile * tileHeight;
        const firstCol = xTile * tileWidth;
        const lastLine = (yTile + 1) * tileHeight;
        const lastCol = (xTile + 1) * tileWidth;
        const reader = sampleReaders[si];

        const ymax = Math.min(tileHeight, tileHeight - (lastLine - imageWindow[3]));
        const xmax = Math.min(tileWidth, tileWidth - (lastCol - imageWindow[2]));

        for (let y = Math.max(0, imageWindow[1] - firstLine); y < ymax; ++y) {
          for (let x = Math.max(0, imageWindow[0] - firstCol); x < xmax; ++x) {
            const pixelOffset = ((y * tileWidth) + x) * bytesPerPixel;
            const value = reader.call(
              dataView, pixelOffset + srcSampleOffsets[si], littleEndian,
            );
            let windowCoordinate = ((y + firstLine - imageWindow[1]) * windowWidth) + x + firstCol - imageWindow[0];
            valueArrays[si][windowCoordinate] = value;
          }
        }
        if (++iters === 4) {
          subscriber.next();
        }
      });
    }
  });
}

export async function getTileOrStrip(image, x, y, sample, poolOrDecoder, arrayBuffer) {
  // console.time('fetch')
  const numTilesPerRow = Math.ceil(image.getWidth() / image.getTileWidth());
  const numTilesPerCol = Math.ceil(image.getHeight() / image.getTileHeight());
  let index;
  const {tiles} = image;
  if (image.planarConfiguration === 1) {
    index = (y * numTilesPerRow) + x;
  } else if (image.planarConfiguration === 2) {

    index = (sample * numTilesPerRow * numTilesPerCol) + (y * numTilesPerRow) + x;
  }
  let offset;
  let byteCount;
  if (image.isTiled) {
    offset = image.fileDirectory.TileOffsets[index];
    byteCount = image.fileDirectory.TileByteCounts[index];
  } else {
    offset = image.fileDirectory.StripOffsets[index];
    byteCount = image.fileDirectory.StripByteCounts[index];
  }
  // const slice = await fetch(image.source, offset, byteCount);
  const slice = arrayBuffer.slice(offset, offset + byteCount);
  // either use the provided pool or decoder to decode the data

  // console.time('decode')
  let request;
  if (tiles === null) {
    request = poolOrDecoder.decode(image.fileDirectory, slice);
  } else if (!tiles[index]) {
    tiles[index] = request;
    request = poolOrDecoder.decode(image.fileDirectory, slice);
  }
  // console.timeEnd('decode')
  // console.timeEnd('fetch')
  return {data: await request};
}

