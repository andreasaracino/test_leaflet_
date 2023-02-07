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
  }

  ngOnInit() {
    this.map = L.map('map').setView([50.068661, 0.350755], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {}).addTo(this.map);

    const createLayer = async () => {
      const url = 'http://localhost:4200/assets/leaflet/orthophoto.tif';

      const georaster = await fetch(url)
          .then((res) => res.arrayBuffer())
          .then((arrayBuffer) => parseGeoRaster(arrayBuffer));

      const imageryLayer = new GeoRasterLayer({
        georaster,
        opacity: 1,
        resolution: 256,
        resampleMethod: 'near',
      });
      // this.map.fitBounds(imageryLayer.getBounds() as L.LatLngBoundsExpression);
      // // imageryLayer.addTo(map);
      // this.map.addLayer(imageryLayer as L.Layer);

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

          const imageBounds = imageryLayer.getBounds();
          const imageNW = imageBounds.getNorthWest();
          const imageNE = imageBounds.getNorthEast();
          const imageSE = imageBounds.getSouthEast();
          const imageSW = imageBounds.getSouthWest();

          const xNW = ((imageNW.lng - northWestBound.lng) / westToEast) * pxWidth
          const xNE = ((imageNE.lng - northWestBound.lng) / westToEast) * pxWidth
          const xSE = ((imageSE.lng - northWestBound.lng) / westToEast) * pxWidth
          const xSW = ((imageSW.lng - northWestBound.lng) / westToEast) * pxWidth
          const yNW = -(((imageNW.lat - northWestBound.lat) / northToSouth) * pxHeight)
          const yNE = -(((imageNE.lat - northWestBound.lat) / northToSouth) * pxHeight)
          const ySE = -(((imageSE.lat - northWestBound.lat) / northToSouth) * pxHeight)
          const ySW = -(((imageSW.lat - northWestBound.lat) / northToSouth) * pxHeight)

          if (this.map.getZoom() >= 12) {
            ctx.beginPath();

            ctx.moveTo(xNW, yNW);
            ctx.lineTo(xNE, yNE);
            ctx.lineTo(xSE, ySE);
            ctx.lineTo(xSW, ySW);
            ctx.lineTo(xNW, yNW);

            ctx.fill();
          }
        }
      }

      myCustomCanvasDraw.prototype = new CanvasLayer();

      this.map.addLayer(new myCustomCanvasDraw());
    };

    createLayer().then();
  }
}
