export const { add } = await (async () =>
  fetch("dist/release.wasm")
    .then((response) => response.arrayBuffer())
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((data) => {
      return data.instance.exports;
    }))();
