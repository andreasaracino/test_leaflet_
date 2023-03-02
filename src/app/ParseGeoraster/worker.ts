import parseData from './parseData';

addEventListener('message', (e) => {
  const data = e.data;
  parseData(data).then(result => {
    if (result._data instanceof ArrayBuffer) {
      // @ts-ignore
      postMessage(result, [result._data]);
    } else {
      // @ts-ignore
      postMessage(result);
    }
    close();
  });
});
