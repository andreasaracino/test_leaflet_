'use strict';
/* global Blob */
/* global URL */
import {Observable} from "rxjs";
import {fromArrayBuffer} from 'geotiff';
import {GeoRasterValues} from "georaster-layer-for-leaflet/dist/types";

export class GeoRasterParsed {
  private _data: ArrayBuffer;
  private _worker: Worker;
  values: GeoRasterValues;
  width: number;
  height: number;
  pixelHeight: number;
  pixelWidth: number;
  projection: number;
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  noDataValue: number;
  numberOfRasters: number;
  palette: number;
  image: any;

  private constructor(data) {
    this.initialize(data);
  }

  static async fromBuffer(data) {
    const geoRaster = new GeoRasterParsed(data);
    await geoRaster.parseData();
    return geoRaster;
  }

  private initialize(data) {
    if (!(typeof window !== 'undefined' && typeof window.Worker !== 'undefined')) {
      console.error('web worker is not available', new Error().stack);
      return;
    }

    if (!(data instanceof ArrayBuffer)) {
      console.error('unsupported data', new Error().stack);
      return;
    }

    this._data = data;
  }

  private async parseData() {
    return new Promise((resolve, reject) => {
      try {
        console.time('fromArrayBuffer')
        resolve(fromArrayBuffer(this._data).then(geotiff => {
          console.timeEnd('fromArrayBuffer')
          console.time('getImage')
          return geotiff['getImage']().then(image => {
            console.timeEnd('getImage')
            try {
              this.image = image;
              const fileDirectory = image.fileDirectory;

              const {
                GeographicTypeGeoKey,
                ProjectedCSTypeGeoKey,
              } = image.getGeoKeys();

              this.projection = ProjectedCSTypeGeoKey || GeographicTypeGeoKey;

              this.height = image.getHeight();
              this.width = image.getWidth();

              const [resolutionX, resolutionY] = image.getResolution();
              this.pixelHeight = Math.abs(resolutionY);
              this.pixelWidth = Math.abs(resolutionX);

              const [originX, originY] = image.getOrigin();
              this.xmin = originX;
              this.xmax = this.xmin + this.width * this.pixelWidth;
              this.ymax = originY;
              this.ymin = this.ymax - this.height * this.pixelHeight;

              this.noDataValue = fileDirectory.GDAL_NODATA ? parseFloat(fileDirectory.GDAL_NODATA) : null;

              this.numberOfRasters = fileDirectory.SamplesPerPixel;

              // TODO (Take a look at this)
              if (fileDirectory.ColorMap) {
                // this.palette = getPalette(image);
              }
            } catch (error) {
              reject(error);
              console.error('[georaster] error parsing georaster:', error);
            }
          });
        }));
      } catch (error) {
        reject(error);
        console.error('[georaster] error parsing georaster:', error);
      }
    });
  }

  renderImage$(canvasWidth: number, canvasHeight: number): Observable<ImageData> {
    return new Observable<ImageData>(subscriber => {
      let a = 0;
      this._worker = new Worker('./worker.ts',  { type: 'module', name: 'worker-tile-loader' });
      this._worker.onmessage = (e) => {
        const data = e.data;
        this.values = data;
        subscriber.next(new ImageData(data.image, canvasWidth, canvasHeight));
        if (data.tiles === data.finish) {
          subscriber.complete();
        }
      };
      const data = this._data;
      this._worker.postMessage({
        noDataValue: this.noDataValue, data, width: this.width, height: this.height, canvasWidth, canvasHeight
      }, [data]);
    });
  }
}


export const parseGeoraster = async (input) => {
  if (input === undefined) {
    const errorMessage = '[Georaster.parseGeoraster] Error. You passed in undefined to parseGeoraster. We can\'t make a raster out of nothing!';
    throw Error(errorMessage);
  }

  return await GeoRasterParsed.fromBuffer(input);
};

/*
    The following code allows you to use GeoRaster without requiring
*/
if (typeof window !== 'undefined') {
  window['parseGeoraster'] = parseGeoraster;
} else if (typeof self !== 'undefined') {
  self['parseGeoraster'] = parseGeoraster; // jshint ignore:line
}
