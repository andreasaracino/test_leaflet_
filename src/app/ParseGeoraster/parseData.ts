import {unflatten} from './utils';
import {getDecoder} from 'geotiff/src/compression/index';
import {getTileOrStrip} from "./tiff-chunk-loader.worker";
import {fromArrayBuffer} from 'geotiff';
import {toImageData} from "../image.util";
import {Observable} from "rxjs";

export async function getImageData({noDataValue, data, width, height, canvasWidth, canvasHeight}) {
  const geotiff = await fromArrayBuffer(data);
  const image = await geotiff.getImage();
  return readRasters(image, data);
}

async function readRasters(image, arrayBuffer) {
  const imageWindow = [0, 0, image.getWidth(), image.getHeight()];
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
    const valueArray = image.getArrayForSample(samples[i], numPixels);
    valueArrays.push(valueArray);
  }

  const poolOrDecoder = getDecoder(image.fileDirectory);
  return _readRaster(image, imageWindow, samples, valueArrays, poolOrDecoder, arrayBuffer);
}

function sum(array, start, end) {
  let s = 0;
  for (let i = start; i < end; ++i) {
    s += array[i];
  }
  return s;
}

function _readRaster(image, imageWindow, samples, valueArrays, poolOrDecoder, arrayBuffer) {
  return new Observable<any>((subscriber) => {
    console.time('beginRaster')
    const tileWidth = image.getTileWidth();
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

    const {littleEndian} = image;
    console.time('inner for')

    valueArrays.width = imageWindow[2] - imageWindow[0];
    valueArrays.height = imageWindow[3] - imageWindow[1];
    let iters = 0;

    // TODO
    for (let yTile = minYTile; yTile < maxYTile; yTile++) {
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
              subscriber.next({img: valueArrays, finish: iters, tiles: maxYTile * maxXTile});
              // console.timeEnd('inner for')
            }
          });
      }
    }
  });
}
export function decodeTile({samples, bytesPerPixel, image, poolOrDecoder, xTile, yTile, arrayBuffer, tileWidth, tileHeight, sampleReaders, imageWindow, srcSampleOffsets, littleEndian, valueArrays, windowWidth}) {
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
