import {toPublicName} from "@angular/compiler/src/i18n/serializers/xmb";

export function toImageData(georaster, canvasWidth, canvasHeight) {
  if (georaster.values) {
    const {noDataValue, mins, ranges, values} = georaster;
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

export function getBordersFromCorners(corners) {
  const leftBorder = Math.min(corners[0].x, corners[3].x);
  const rightBorder = Math.max(corners[1].x, corners[2].x);
  const topBorder = Math.max(corners[2].y, corners[3].y);
  const bottomBorder = Math.min(corners[0].y, corners[1].y);

  return {
    leftBorder,
    rightBorder,
    topBorder,
    bottomBorder,
    width: rightBorder - leftBorder,
    height: topBorder - bottomBorder,
  }
}
