import {fromArrayBuffer} from 'geotiff';
import {unflatten} from './utils';
import {getDecoder} from 'geotiff/src/compression/index';
import {getTileOrStrip} from "./tiff-chunk-loader.worker";

/* We're not using async because trying to avoid dependency on babel's polyfill
There can be conflicts when GeoRaster is used in another project that is also
using @babel/polyfill */
export default function parseData(data): Promise<{ _data: any }> {
  return new Promise((resolve, reject) => {
    try {
      const result = {
        values: undefined,
        width: undefined,
        height: undefined,
        pixelHeight: undefined,
        pixelWidth: undefined,
        projection: undefined,
        xmin: undefined,
        xmax: undefined,
        ymin: undefined,
        ymax: undefined,
        noDataValue: undefined,
        numberOfRasters: undefined,
        _data: undefined,
        palette: undefined
      };

      let height, width;

      if (data.rasterType === 'geotiff') {
        result._data = data.data;

        // let initFunction = (a) => new Promise(() => {});
        let initFunction = fromArrayBuffer;
        // if (data.sourceType === 'url') {
        //   initFunction = fromUrl;
        // }

        console.time('fromArrayBuffer')
        resolve(initFunction(data.data).then(geotiff => {
          console.timeEnd('fromArrayBuffer')
          console.time('getImage')
          return geotiff['getImage']().then(image => {
            console.timeEnd('getImage')
            try {
              const fileDirectory = image.fileDirectory;

              const {
                GeographicTypeGeoKey,
                ProjectedCSTypeGeoKey,
              } = image.getGeoKeys();

              result.projection = ProjectedCSTypeGeoKey || GeographicTypeGeoKey;

              result.height = height = image.getHeight();
              result.width = width = image.getWidth();

              const [resolutionX, resolutionY] = image.getResolution();
              result.pixelHeight = Math.abs(resolutionY);
              result.pixelWidth = Math.abs(resolutionX);

              const [originX, originY] = image.getOrigin();
              result.xmin = originX;
              result.xmax = result.xmin + width * result.pixelWidth;
              result.ymax = originY;
              result.ymin = result.ymax - height * result.pixelHeight;

              result.noDataValue = fileDirectory.GDAL_NODATA ? parseFloat(fileDirectory.GDAL_NODATA) : null;

              result.numberOfRasters = fileDirectory.SamplesPerPixel;

              if (fileDirectory.ColorMap) {
                // result.palette = getPalette(image);
              }

              if (data.sourceType !== 'url') {
                return readRasters(image, data.data).then(rasters => {
                  console.time('rasters unflatten')
                  result.values = rasters.map(valuesInOneDimension => {
                    return unflatten(valuesInOneDimension, {height, width});
                  });
                  console.timeEnd('rasters unflatten')
                  // return processResult(result);
                  return result;
                });
              } else {
                return result;
              }
            } catch (error) {
              reject(error);
              console.error('[georaster] error parsing georaster:', error);
            }
          });
        }));
      }
    } catch (error) {
      reject(error);
      console.error('[georaster] error parsing georaster:', error);
    }
  });
}

async function readRasters(image, arrayBuffer) {
  console.time('readRasters')
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
