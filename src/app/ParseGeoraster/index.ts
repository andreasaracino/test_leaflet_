'use strict';
/* global Blob */
/* global URL */
import {Observable} from "rxjs";
import {fromArrayBuffer} from 'geotiff';
import {GeoRaster} from "georaster-layer-for-leaflet";

export class GeoRasterParsed {
  private _data: ArrayBuffer;
  private _worker: Worker;
  values: undefined;
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
        let height, width;

        console.time('fromArrayBuffer')
        resolve(fromArrayBuffer(this._data).then(geotiff => {
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

              this.projection = ProjectedCSTypeGeoKey || GeographicTypeGeoKey;

              this.height = height = image.getHeight();
              this.width = width = image.getWidth();

              const [resolutionX, resolutionY] = image.getResolution();
              this.pixelHeight = Math.abs(resolutionY);
              this.pixelWidth = Math.abs(resolutionX);

              const [originX, originY] = image.getOrigin();
              this.xmin = originX;
              this.xmax = this.xmin + width * this.pixelWidth;
              this.ymax = originY;
              this.ymin = this.ymax - height * this.pixelHeight;

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

  renderImage$(): Observable<ImageData> {
    return new Observable<ImageData>(subscriber => {
      this._worker = new Worker('./worker.ts',  { type: 'module' });
      this._worker.onmessage = (e) => {
        const data = e.data;
        for (const key in data) {
          this[key] = data[key];
        }
      };
      this._worker.postMessage({
        data: this._data,
      }, [this._data]);
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
