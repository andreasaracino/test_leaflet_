import {unflatten} from './utils';
import {getDecoder} from 'geotiff/src/compression/index';
import {getTileOrStrip} from "./tiff-chunk-loader.worker";

export async function getImageData({image, data, width, height}) {
  return readRasters(image, data).then(rasters => {
    const values = rasters.map(valuesInOneDimension => {
      return unflatten(valuesInOneDimension, {width, height});
    });
    return values;
  });
}

async function readRasters(image, arrayBuffer) {
  // TODO SOSTITUISCI TUTTE LE FUNZIONI
  console.time('readRasters')
  const imageWindow = [0, 0, image.fileDirectory.ImageWidth, image.fileDirectory.ImageLength];
  const samples = [];

  // check parameters
  if (imageWindow[0] > imageWindow[2] || imageWindow[1] > imageWindow[3]) {
    throw new Error('Invalid subsets');
  }

  const imageWindowWidth = imageWindow[2] - imageWindow[0];
  const imageWindowHeight = imageWindow[3] - imageWindow[1];
  const numPixels = imageWindowWidth * imageWindowHeight;

  for (let i = 0; i < image.fileDirectory.SamplesPerPixel; ++i) {
    samples.push(i);
  }

  let valueArrays = [];
  for (let i = 0; i < samples.length; ++i) {
    const valueArray = getArrayForSample(image, samples[i], numPixels);
    valueArrays.push(valueArray);
  }

  const poolOrDecoder = getDecoder(image.fileDirectory);

  console.timeEnd('readRasters')
  return await _readRaster(image, imageWindow, samples, valueArrays, poolOrDecoder, arrayBuffer);
}

function sum(array, start, end) {
  let s = 0;
  for (let i = start; i < end; ++i) {
    s += array[i];
  }
  return s;
}

async function _readRaster(image, imageWindow, samples, valueArrays, poolOrDecoder, arrayBuffer) {
  console.time('beginRaster')
  const tileWidth = image.fileDirectorygetTileWidth();
  const tileHeight = image.getTileHeight();

  const minXTile = Math.max(Math.floor(imageWindow[0] / tileWidth), 0);
  const maxXTile = Math.min(
    Math.ceil(imageWindow[2] / tileWidth),
    Math.ceil(image.getWidth() / image.getTileWidth()),
  );
  const minYTile = Math.max(Math.floor(imageWindow[1] / tileHeight), 0);
  const maxYTile = Math.min(
    Math.ceil(imageWindow[3] / tileHeight),
    Math.ceil(image.getHeight() / image.getTileHeight()),
  );
  const windowWidth = imageWindow[2] - imageWindow[0];

  let bytesPerPixel = image.getBytesPerPixel();

  const srcSampleOffsets = [];
  const sampleReaders = [];
  console.timeEnd('beginRaster')
  console.time('first for cycle')
  for (let i = 0; i < samples.length; ++i) {
    if (image.planarConfiguration === 1) {
      srcSampleOffsets.push(sum(image.fileDirectory.BitsPerSample, 0, samples[i]) / 8);
    } else {
      srcSampleOffsets.push(0);
    }
    sampleReaders.push(image.getReaderForSample(samples[i]));
  }
  console.timeEnd('first for cycle')

  const promises = [];
  const {littleEndian} = image;
  console.time('inner for')
  let itersDone = 0;
  const maxIters = (maxXTile - minXTile) * (maxYTile - minYTile);

  // TODO
  for (let yTile = minYTile; yTile < maxYTile; yTile+=2) {
    for (let xTile = minXTile; xTile < maxXTile; xTile+=2) {
      decodeTile({promises, samples, bytesPerPixel, image, poolOrDecoder, xTile, yTile, arrayBuffer, tileWidth, tileHeight, sampleReaders, imageWindow, srcSampleOffsets, littleEndian, valueArrays, windowWidth})
    }
  }

  // await Promise.all(promises);
  console.timeEnd('inner for')
  // console.info(iterations)
  //
  valueArrays.width = imageWindow[2] - imageWindow[0];
  valueArrays.height = imageWindow[3] - imageWindow[1];

  return valueArrays;
}
export function decodeTile({promises, samples, bytesPerPixel, image, poolOrDecoder, xTile, yTile, arrayBuffer, tileWidth, tileHeight, sampleReaders, imageWindow, srcSampleOffsets, littleEndian, valueArrays, windowWidth}) {
  for (let si = 0; si < samples.length; si++) {
    const sample = samples[si];
    if (image.planarConfiguration === 2) {
      bytesPerPixel = image.getSampleByteSize(sample);
    }
    const promise = getTileOrStrip(image, xTile, yTile, sample, poolOrDecoder, arrayBuffer);
    // promises.push(promise);
    promise.then((tile) => {
      const buffer = tile.data;
      const dataView = new DataView(buffer);
      const firstLine = tile.y * tileHeight;
      const firstCol = tile.x * tileWidth;
      const lastLine = (tile.y + 1) * tileHeight;
      const lastCol = (tile.x + 1) * tileWidth;
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
    });
  }
}

function getSampleFormat(image, sampleIndex = 0) {
  return image.fileDirectory.SampleFormat
    ? image.fileDirectory.SampleFormat[sampleIndex] : 1;
}
function getBitsPerSample(image, sampleIndex = 0) {
  return image.fileDirectory.BitsPerSample[sampleIndex];
}
function getArrayForSample(image, sampleIndex, size) {
  const format = getSampleFormat(image, sampleIndex);
  const bitsPerSample = getBitsPerSample(image, sampleIndex);
  return arrayForType(format, bitsPerSample, size);
}

function arrayForType(format, bitsPerSample, size) {
  switch (format) {
    case 1: // unsigned integer data
      if (bitsPerSample <= 8) {
        return new Uint8Array(size);
      } else if (bitsPerSample <= 16) {
        return new Uint16Array(size);
      } else if (bitsPerSample <= 32) {
        return new Uint32Array(size);
      }
      break;
    case 2: // twos complement signed integer data
      if (bitsPerSample === 8) {
        return new Int8Array(size);
      } else if (bitsPerSample === 16) {
        return new Int16Array(size);
      } else if (bitsPerSample === 32) {
        return new Int32Array(size);
      }
      break;
    case 3: // floating point data
      switch (bitsPerSample) {
        case 16:
        case 32:
          return new Float32Array(size);
        case 64:
          return new Float64Array(size);
        default:
          break;
      }
      break;
    default:
      break;
  }
  throw Error('Unsupported data format/bitsPerSample');
}
