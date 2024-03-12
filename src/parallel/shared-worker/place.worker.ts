import placePaths from "./place-path-flow";

const ctx: Worker = self as any;

ctx.onmessage = function (code: MessageEvent) {
  this.onmessage = function (e: MessageEvent) {
    this.postMessage(placePaths(e.data, code.data.env));
  };
};
