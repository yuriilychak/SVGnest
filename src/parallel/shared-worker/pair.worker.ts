import pairData from "./pair-data-flow";

// clipperjs uses alerts for warnings
function alert(message: string) {
  console.log("alert: ", message);
}

const ctx: Worker = self as any;

ctx.onmessage = function (code: MessageEvent) {
  this.onmessage = function (e: MessageEvent) {
    this.postMessage(pairData(e.data, code.data.env));
  };
};
