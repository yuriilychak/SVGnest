import pairData from "./pair-data-flow";
import placePaths from "./place-path-flow";

// clipperjs uses alerts for warnings
function alert(message) {
  console.log("alert: ", message);
}

self.onmessage = function (code) {
  const middleware = code.data.id === "pair" ? pairData : placePaths;

  this.onmessage = function (e) {
    this.postMessage(middleware(e.data, code.data.env));
  };
};
