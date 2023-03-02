'use strict';
/* global Blob */
/* global URL */

export class GeoRasterParsed {
  private readonly _web_worker_is_available: boolean;
  private readonly _data: ArrayBuffer;
  private readonly rasterType: string;
  private readonly sourceType: string;
  private _metadata: any;

  constructor(data, metadata, debug) {
    if (debug) console.log('starting GeoRaster.constructor with', data, metadata);

    this._web_worker_is_available = typeof window !== 'undefined' && typeof window.Worker !== 'undefined';

    if (data instanceof ArrayBuffer) {
      // this is browser
      this._data = data;
      this.rasterType = 'geotiff';
      this.sourceType = 'ArrayBuffer';
    }

    if (debug) console.log('this after construction:', this);
  }

  initialize(debug) {
    return new Promise((resolve, reject) => {
      if (debug) console.log('starting GeoRaster.initialize');
      if (debug) console.log('this', this);

      if (this.rasterType === 'object' || this.rasterType === 'geotiff' || this.rasterType === 'tiff') {
        if (this._web_worker_is_available) {
          const worker = new Worker('./worker.ts',  { type: 'module' });
          worker.onmessage = (e) => {
            if (debug) console.log('main thread received message:', e);
            const data = e.data;
            for (const key in data) {
              this[key] = data[key];
            }
            resolve(this);
          };
          if (debug) console.log('about to postMessage');
          if (this._data instanceof ArrayBuffer) {
            worker.postMessage({
              data: this._data,
              rasterType: this.rasterType,
              sourceType: this.sourceType,
              metadata: this._metadata,
            }, [this._data]);
            // parseData({
            //   data: this._data,
            //   rasterType: this.rasterType,
            //   sourceType: this.sourceType,
            //   metadata: this._metadata,
            // }).then(result => {
            //   if (debug) console.log('result:', result);
            //   resolve(result);
            // }).catch(reject);
          }
        } else {
          if (debug) console.log('web worker is not available');
        //
        }
      } else {
        reject('couldn\'t find a way to parse');
      }
    });
  }
}


export const parseGeoraster = (input, metadata, debug) => {
  if (debug) console.log('starting parseGeoraster with ', input, metadata);

  if (input === undefined) {
    const errorMessage = '[Georaster.parseGeoraster] Error. You passed in undefined to parseGeoraster. We can\'t make a raster out of nothing!';
    throw Error(errorMessage);
  }

  return new GeoRasterParsed(input, metadata, debug).initialize(debug);
};

/*
    The following code allows you to use GeoRaster without requiring
*/
if (typeof window !== 'undefined') {
  window['parseGeoraster'] = parseGeoraster;
} else if (typeof self !== 'undefined') {
  self['parseGeoraster'] = parseGeoraster; // jshint ignore:line
}
