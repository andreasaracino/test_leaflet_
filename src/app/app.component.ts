import {Component, OnInit} from '@angular/core';
import * as L from 'leaflet';
import {CanvasLayer} from 'leaflet-canvas-layer';
import GeoRasterLayer, {GeoRaster} from 'georaster-layer-for-leaflet';
import proj4 from 'proj4';
import epsg_codes from 'epsg-index/all.json';
import {BehaviorSubject} from "rxjs";
import {getBordersFromCorners} from "./image.util";
import {combineLatest} from "rxjs";
import {GeoRasterParsed} from "./ParseGeoraster";
import {Image, loadImage} from 'canvas';
import {normalizedCorners} from "./orthophoto-loader.worker";
import { drawArbitraryQuadImage, FILL_METHOD } from 'canvas-arbitrary-quads';

@Component({
  selector: 'my-app',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  loading = false;
  readonly MAX_ZOOM = 22
  name = 'Angular';
  map: any;
  image: Image;

  // geotiffCanvas$ = new BehaviorSubject<HTMLCanvasElement>(null);
  geotiffData$ = new BehaviorSubject<[HTMLCanvasElement, { x: number; y: number }]>(null);
  georaster$ = new BehaviorSubject<GeoRasterParsed>(null);
  imageCanvas: Record<number, HTMLCanvasElement> = {};
  worker: Worker = null;

  ngOnInit() {
    this.map = L.map('map').setView([50.068661, 0.350755], 2);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      minZoom: 1,
      maxZoom: this.MAX_ZOOM
    }).addTo(this.map);


    const createLayer = async () => {
      const url = 'http://localhost:4200/assets/leaflet/orthophoto.tif';
      // const url = 'http://localhost:4200/assets/leaflet/odm_orthophoto (1).tif';
      // const url = 'http://localhost:4200/assets/leaflet/5254D.tif';

      const response = await fetch(url);
      const bufferArray = await response.arrayBuffer();

      this.loading = true

      const georaster = await GeoRasterParsed.fromBuffer(bufferArray);

      this.georaster$.next(georaster);

      const imageryLayer = new GeoRasterLayer({
        georaster: georaster as unknown as GeoRaster,
        opacity: 1, 
        resolution: 256,
        resampleMethod: 'near',
      });

      const imageBounds = imageryLayer.getBounds();
      this.map.fitBounds(imageBounds);
      this.renderCanvas(georaster, this.calcCorners(this.map, imageryLayer, this.MAX_ZOOM));

      this.canvasDraw.prototype = new CanvasLayer();

      this.map.addLayer(new this.canvasDraw(imageryLayer, this.geotiffData$, this.calcCorners, this.map));
    };

    createLayer()

    combineLatest([this.geotiffData$, this.georaster$]).subscribe((results) => {
      const canvas = results[0]?.[0];
      const corners = results[0]?.[1];
      const georaster = results[1];

      if (canvas && corners && georaster) {
        this.renderCanvas(georaster, corners, canvas);
      }
    });
  }

  canvasDraw = function (imageryLayer, geotiffData$, calcCorners, map) {
    this.setData = function () {
      this.needRedraw();
    };
    this.onDrawLayer = function (viewInfo) {
      if (this.map.getZoom() >= 12) {
        const canvas = viewInfo.canvas;
        const corners = calcCorners(map, imageryLayer);
        geotiffData$.next([canvas, corners]);
      }
    }
  }

  renderCanvas(georaster: GeoRasterParsed, corners, canvas: HTMLCanvasElement = null) {
    const currentZoom = this.map.getZoom();

    if (!this.imageCanvas[currentZoom]) {
      this.transformImage(corners, currentZoom)
    }

    if (canvas) {
      this.renderImage(canvas, corners, currentZoom);
    }
  }

  renderImage(canvas, corners, currentZoom) {
    let canvasToRender;

    if (this.imageCanvas[currentZoom]) {
      canvasToRender = this.imageCanvas[currentZoom];
    } else {
      const index = Object.keys(this.imageCanvas).reduce((a, b) => {
        return Math.abs(Number(b) - currentZoom) < Math.abs(Number(a) - currentZoom) ? b : a;
      });

      canvasToRender = this.imageCanvas[index];
    }
    const { width } = getBordersFromCorners(corners);
    const scale = width / canvasToRender.width;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    canvas.getContext('2d').setTransform(scale, 0, 0, scale, 0, 0);
    canvas.getContext('2d').drawImage(canvasToRender, Math.min(corners[0].x, corners[3].x) / scale, Math.min(corners[0].y, corners[1].y) / scale)
  }

  async transformImage(corners, currentZoom) {
    this.loading = true;
    const {borders, width, height} = normalizedCorners(corners);
    const newCanvas = document.createElement('canvas');
    newCanvas.width = width;
    newCanvas.height = height;
    this.imageCanvas[currentZoom] = newCanvas;

    if (!this.image) {
      this.image = await loadImage('http://localhost:4200/assets/leaflet/orthophoto.png');
    }
    const ctx = newCanvas.getContext('2d');

    const dstPoints = [
      borders[0],
      borders[3],
      borders[2],
      borders[1],
    ];
    const srcPoints = [
      {x: 0, y: 0},     // UL
      {x: 0, y: this.image.height},   // BL
      {x: this.image.width, y: this.image.height}, // BR
      {x: this.image.width, y: 0},   // UR
    ];
    drawArbitraryQuadImage(ctx, this.image, srcPoints, dstPoints, FILL_METHOD.BILINEAR);
    this.renderImage(this.geotiffData$.getValue()[0], this.geotiffData$.getValue()[1], currentZoom);
    this.loading = false;
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

