import {Component, OnInit} from '@angular/core';
import * as L from 'leaflet';
import {CanvasLayer} from 'leaflet-canvas-layer';
import GeoRasterLayer, {GeoRaster} from 'georaster-layer-for-leaflet';
import parseGeoRaster from 'georaster';
import proj4 from 'proj4';
import epsg_codes from 'epsg-index/all.json';
import {BehaviorSubject} from "rxjs";
import {getBordersFromCorners, toImageData} from "./image.util";
import {combineLatest} from "rxjs";

@Component({
  selector: 'my-app',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  readonly MAX_ZOOM = 20
  name = 'Angular';
  map: any;

  // geotiffCanvas$ = new BehaviorSubject<HTMLCanvasElement>(null);
  geotiffData$ = new BehaviorSubject<[HTMLCanvasElement, { x: number; y: number }]>(null);
  georaster$ = new BehaviorSubject<GeoRaster>(null);
  imageCanvas: any = null;
  worker: Worker = null;

  ngOnInit() {
    this.map = L.map('map').setView([50.068661, 0.350755], 2);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      minZoom: 1,
      maxZoom: this.MAX_ZOOM
    }).addTo(this.map);

    const createLayer = async () => {
      const url = 'http://localhost:4200/assets/leaflet/orthophoto.tif';

      const response = await fetch(url);
      const bufferArray = await response.arrayBuffer();
      const georaster = await parseGeoRaster(bufferArray);

      this.georaster$.next(georaster);

      const imageryLayer = new GeoRasterLayer({
        georaster,
        opacity: 1,
        resolution: 256,
        resampleMethod: 'near',
      });

      const imageBounds = imageryLayer.getBounds();
      this.map.fitBounds(imageBounds);
      this.renderCanvas(georaster, this.calcCorners(this.map, imageryLayer, this.MAX_ZOOM));

      this.canvasDraw.prototype = new CanvasLayer();

      this.map.addLayer(new this.canvasDraw(imageryLayer, this.renderCanvas, this.geotiffData$, this.calcCorners, this.map));
    };

    createLayer().then();

    combineLatest([this.geotiffData$, this.georaster$]).subscribe((results) => {
      const canvas = results[0]?.[0];
      const corners = results[0]?.[1];
      const georaster = results[1];

      if (canvas && corners && georaster) {
        this.renderCanvas(georaster, corners, canvas);
      }
    });
  }

  canvasDraw = function (imageryLayer, renderFunction, geotiffData$, calcCorners, map) {
    this.setData = function () {
      this.needRedraw();
    };
    this.onDrawLayer = function (viewInfo) {
      const canvas = viewInfo.canvas;
      const corners = calcCorners(map, imageryLayer);

      if (this.map.getZoom() >= 12) {
        geotiffData$.next([canvas, corners]);
      }
    }
  }

  async renderCanvas(georaster: GeoRaster, corners, canvas = null) {
    if (!this.imageCanvas && typeof Worker !== 'undefined' && !this.worker) {
      this.worker = new Worker('./orthophoto-loader.worker',  { type: 'module' });
      this.worker.onmessage = ({ data }) => {
        const image = document.createElement('canvas');
        image.width = data.canvas.width;
        image.height = data.canvas.height;
        image.getContext('bitmaprenderer').transferFromImageBitmap(data.canvas);
        this.imageCanvas = image;
      };
      const bitmap: ImageBitmap = await createImageBitmap(toImageData(georaster, Math.abs(corners[1].x - corners[0].x), Math.abs(corners[0].y - corners[3].y)));
      this.worker.postMessage([bitmap, corners])
    }

    if (canvas && this.imageCanvas) {
      const { width } = getBordersFromCorners(corners);
      const scale = width / this.imageCanvas.width;
      canvas.getContext('2d').scale(scale, scale)
      canvas.getContext('2d').drawImage(this.imageCanvas, Math.min(corners[0].x, corners[3].x) / scale, Math.min(corners[0].y, corners[1].y) / scale)
    }
  }

  calcCorners(map, imageryLayer, zoom: number = null) {
    const { x: mapStartX, y: mapStartY } = map.project(map.getBounds().getNorthWest());
    const projector = proj4(epsg_codes[imageryLayer.projection].proj4);
    const usedZoom = zoom ?? map.getZoom();

    const { topLeft, topRight, bottomRight, bottomLeft } = imageryLayer.extent;

    const pxNW = map.project({
      lng: projector.inverse(topLeft).x,
      lat: projector.inverse(topLeft).y
    }, usedZoom);
    const pxNE = map.project({
      lng: projector.inverse(topRight).x,
      lat: projector.inverse(topRight).y
    }, usedZoom);
    const pxSE = map.project({
      lng: projector.inverse(bottomRight).x,
      lat: projector.inverse(bottomRight).y
    }, usedZoom);
    const pxSW = map.project({
      lng: projector.inverse(bottomLeft).x,
      lat: projector.inverse(bottomLeft).y
    }, usedZoom);

    const topX = zoom ? 0 : mapStartX;
    const topY = zoom ? 0 : mapStartY;

    const xNW = Math.ceil(pxNW.x - topX);
    const xNE = Math.ceil(pxNE.x - topX)
    const xSE = Math.ceil(pxSE.x - topX)
    const xSW = Math.ceil(pxSW.x - topX)
    const yNW = Math.ceil(pxNW.y - topY)
    const yNE = Math.ceil(pxNE.y - topY)
    const ySE = Math.ceil(pxSE.y - topY)
    const ySW = Math.ceil(pxSW.y - topY)

    return [
      { // UL
        x: xNW,
        y: yNW,
      },
      { // UR
        x: xNE,
        y: yNE,
      },
      { // BR
        x: xSE,
        y: ySE,
      },
      { // BL
        x: xSW,
        y: ySW,
      },
    ]
  }
}

