import pairData from "./pair-data-flow";
import placePaths from "./place-path-flow";

// clipperjs uses alerts for warnings
function alert(message: string) {
  console.log("alert: ", message);
}

const ctx: Worker = self as any;

ctx.onmessage = function (code: MessageEvent) {
  const middleware = code.data.id === "pair" ? pairData : placePaths;

  this.onmessage = function (e: MessageEvent) {
    this.postMessage(middleware(e.data, code.data.env));
  };
};
