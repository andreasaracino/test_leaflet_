import {getImageData} from "./parseData";
import {unflatten} from "./utils";
import {toImageData} from "../image.util";

addEventListener('message', (e) => {
  const data = e.data;
  if (!data.data) return;
  getImageData(data).then(result => {
    result.subscribe(({img, finish, tiles}) => {
      const values = img.map(valuesInOneDimension => {
        return unflatten(valuesInOneDimension, {width: data.width, height: data.height});
      });
      const image = toImageData({noDataValue: data.noDataValue, values, width: data.width, height: data.height}, data.canvasWidth, data.canvasHeight);
      // @ts-ignore
      postMessage({ image, finish, tiles });
    });
    close();
  });
});
