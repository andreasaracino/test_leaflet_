import {getImageData} from "./parseData";

addEventListener('message', (e) => {
  const data = e.data;
  getImageData(data).then(result => {
    // @ts-ignore
    postMessage(result);
    close();
  });
});
