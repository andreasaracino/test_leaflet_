export async function getTileOrStrip(image, x, y, sample, poolOrDecoder, arrayBuffer) {
  // console.time('fetch')
  const numTilesPerRow = Math.ceil(image.getWidth() / image.getTileWidth());
  const numTilesPerCol = Math.ceil(image.getHeight() / image.getTileHeight());
  let index;
  const { tiles } = image;
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
  return { x, y, sample, data: await request };
}

