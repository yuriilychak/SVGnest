import pairData from "./pair-data-flow";

const ctx: Worker = self as any;

ctx.onmessage = function (code: MessageEvent) {
  this.onmessage = async function (e: MessageEvent) {
    this.postMessage(await pairData(e.data, code.data.env));
  };
};
