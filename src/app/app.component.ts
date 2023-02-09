import { Component, OnInit } from '@angular/core';
import * as L from 'leaflet';
import { CanvasLayer } from 'leaflet-canvas-layer';
import GeoRasterLayer from 'georaster-layer-for-leaflet';
import parseGeoRaster from 'georaster';
import {LatLngBounds, MapOptions} from "leaflet";

@Component({
  selector: 'my-app',
  templateUrl: './app.component.html',
  styleUrls: [ './app.component.css' ]
})
export class AppComponent implements OnInit {
  name = 'Angular';
  map: any;
  options: MapOptions = {
    maxBounds: new LatLngBounds([
      [-90, -180],
      [90, 180],
    ]),
    zoomControl: false,
    minZoom: 1,
    maxZoom: 20
  }

  ngOnInit() {
    this.map = L.map('map').setView([50.068661, 0.350755], 2);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {}).addTo(this.map);

    const createLayer = async () => {
      const url = 'http://localhost:4200/assets/leaflet/odm_orthophoto.tif';

      const response = await fetch(url);
      const bufferArray = await response.arrayBuffer();
      const georaster = await parseGeoRaster(bufferArray);

      const imageryLayer = new GeoRasterLayer({
        georaster,
        opacity: 1,
        resolution: 256,
        resampleMethod: 'near',
      });

      const imageBounds = imageryLayer.getBounds();
      this.map.fitBounds(imageBounds);
      // this.map.fitBounds(imageryLayer.getBounds() as L.LatLngBoundsExpression);
      // imageryLayer.addTo(map);

      // this.map.addLayer(imageryLayer as L.Layer);

      // function imgLoaded(e) {
      //   const ifds = UTIF.decode(e.target.response);
      //   UTIF.decodeImage(e.target.response, ifds[0]);
      //   const rgba = UTIF.toRGBA8(ifds[0]);
      //   const canvas  = document.createElement('canvas');
      //   canvas.getContext("2d").drawImage(rgba, 0, 0);
      //   document.body.appendChild(canvas);
      // }
      //
      // const xhr = new XMLHttpRequest();
      // xhr.open("GET", "assets/leaflet/odm_orthophoto.tif");
      // xhr.responseType = "arraybuffer";
      // xhr.onload = imgLoaded;   xhr.send();

      const myCustomCanvasDraw= function(){
        this.onLayerDidMount = function (){
          // -- prepare custom drawing
        };
        this.onLayerWillUnmount  = function(){
          // -- custom cleanup
        };
        this.setData = function (data){
          // -- custom data set
          this.needRedraw(); // -- call to drawLayer
        };
        this.onDrawLayer = function (viewInfo){
          const canvas = viewInfo.canvas;
          const ctx = canvas.getContext("2d");
          const northWestBound = this.map.getBounds().getNorthWest();
          console.log(northWestBound.lat)
          const southEastBound = this.map.getBounds().getSouthEast();
          const northToSouth = Math.abs(southEastBound.lat - northWestBound.lat);
          const westToEast = Math.abs(southEastBound.lng - northWestBound.lng);
          const pxWidth = canvas.width;

          const pxHeight = canvas.height;
          const imageNW = imageBounds.getNorthWest();
          const imageNE = imageBounds.getNorthEast();
          const imageSE = imageBounds.getSouthEast();
          const imageSW = imageBounds.getSouthWest();

          const xNW = Math.ceil(((imageNW.lng - northWestBound.lng) / westToEast) * pxWidth)
          const xNE = Math.ceil(((imageNE.lng - northWestBound.lng) / westToEast) * pxWidth)
          const xSE = Math.ceil(((imageSE.lng - northWestBound.lng) / westToEast) * pxWidth)
          const xSW = Math.ceil(((imageSW.lng - northWestBound.lng) / westToEast) * pxWidth)
          const yNW = -Math.ceil((((imageNW.lat - northWestBound.lat) / northToSouth)) * pxHeight)
          const yNE = -Math.ceil((((imageNE.lat - northWestBound.lat) / northToSouth)) * pxHeight)
          const ySE = -Math.ceil((((imageSE.lat - northWestBound.lat) / northToSouth)) * pxHeight)
          const ySW = -Math.ceil((((imageSW.lat - northWestBound.lat) / northToSouth)) * pxHeight)

          if (this.map.getZoom() >= 12) {
            // ctx.beginPath();
            //
            // ctx.moveTo(xNW, yNW);
            // ctx.lineTo(xNE, yNE);
            // ctx.lineTo(xSE, ySE);
            // ctx.lineTo(xSW, ySW);
            // ctx.lineTo(xNW, yNW);
            //
            // ctx.fill();
            // document.body.appendChild(georaster.toCanvas({width: 200, height: 2*187 }))

            const image = toImageData(georaster, Math.abs(xNE - xNW), Math.abs(yNW - ySW));
            ctx.putImageData(image, xNW, yNW);
            // ctx.drawImage(georaster.toCanvas({width: Math.abs(xNE - xNW), height: Math.abs(yNW - ySW)}), xNW, yNW);
          }
        }

        function toImageData(georaster, canvasWidth, canvasHeight) {
          if (georaster.values) {
            const { noDataValue, mins, ranges, values } = georaster;
            const numBands = values.length;
            const xRatio = georaster.width / canvasWidth;
            const yRatio = georaster.height / canvasHeight;
            const data = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);
            for (let rowIndex = 0; rowIndex < canvasHeight; rowIndex++) {
              for (let columnIndex = 0; columnIndex < canvasWidth; columnIndex++) {
                const rasterRowIndex = Math.round(rowIndex * yRatio);
                const rasterColumnIndex = Math.round(columnIndex * xRatio);
                const pixelValues = values.map(band => {
                  try {
                    return band[rasterRowIndex][rasterColumnIndex];
                  } catch (error) {
                    console.error(error);
                  }
                });
                const haveDataForAllBands = pixelValues.every(value => value !== undefined && value !== noDataValue);
                if (haveDataForAllBands) {
                  const i = (rowIndex * (canvasWidth * 4)) + 4 * columnIndex;
                  if (numBands === 1) {
                    const pixelValue = Math.round(pixelValues[0]);
                    const scaledPixelValue = Math.round((pixelValue - mins[0]) / ranges[0] * 255);
                    data[i] = scaledPixelValue;
                    data[i + 1] = scaledPixelValue;
                    data[i + 2] = scaledPixelValue;
                    data[i + 3] = 255;
                  } else if (numBands === 3) {
                    try {
                      const [r, g, b] = pixelValues;
                      data[i] = r;
                      data[i + 1] = g;
                      data[i + 2] = b;
                      data[i + 3] = 255;
                    } catch (error) {
                      console.error(error);
                    }
                  } else if (numBands === 4) {
                    try {
                      const [r, g, b, a] = pixelValues;
                      data[i] = r;
                      data[i + 1] = g;
                      data[i + 2] = b;
                      data[i + 3] = a;
                    } catch (error) {
                      console.error(error);
                    }
                  }
                }
              }
            }
            return new ImageData(data, canvasWidth, canvasHeight);
          }
        }
      }

      myCustomCanvasDraw.prototype = new CanvasLayer();

      this.map.addLayer(new myCustomCanvasDraw());
    };

    createLayer();
  }
}
