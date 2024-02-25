import { SvgNest } from "./svg-nest";
import "./svg-parser/pathsegpolyfill";

// UI-specific stuff, button clicks go here
const svgNest: SvgNest = new SvgNest();

function ready(fn: (e?: Event) => void) {
  if (document.readyState != "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

function saveBlobAs(blob: Blob, fileName: string): void {
  const saver: HTMLAnchorElement = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "a"
  ) as HTMLAnchorElement;
  var blobURL = (saver.href = URL.createObjectURL(blob)),
    body = document.body;

  saver.download = fileName;

  body.appendChild(saver);
  saver.dispatchEvent(new MouseEvent("click"));
  body.removeChild(saver);
  URL.revokeObjectURL(blobURL);
}

ready(function () {
  // FAQ toggle
  const faq: HTMLElement = document.getElementById("faq");
  const faqButton: HTMLButtonElement = document.getElementById(
    "faqbutton"
  ) as HTMLButtonElement;

  let faqVisible: boolean = false;
  faqButton.onclick = function () {
    if (!faqVisible) {
      faq.setAttribute("style", "display: block");
    } else {
      faq.removeAttribute("style");
    }
    faqVisible = !faqVisible;
  };

  function hideSplash(): void {
    const splash: HTMLElement = document.getElementById("splash");
    const svgnest: HTMLElement = document.getElementById("svgnest");

    if (splash) {
      splash.remove();
    }
    svgnest.setAttribute("style", "display: block");
  }

  const demo: HTMLElement = document.getElementById("demo");
  let upload: HTMLElement = document.getElementById("upload");
  const display: HTMLElement = document.getElementById("select");

  demo.onclick = function () {
    let svg: Element;

    try {
      svg = svgNest.parseSvg(display.innerHTML);
      display.innerHTML = "";
      display.appendChild(svg);
    } catch (e) {
      message.innerHTML = e;
      message.className = "error animated bounce";
      return;
    }

    hideSplash();
    message.innerHTML = "Click on the outline to use as the bin";
    message.className = "active animated bounce";

    attachSvgListeners(svg as SVGElement);
  };

  var message = document.getElementById("message");

  if (
    !document.createElementNS ||
    !document.createElementNS("http://www.w3.org/2000/svg", "svg").createSVGRect
  ) {
    message.innerHTML = "Your browser does not have SVG support";
    message.className = "error animated bounce";
    return;
  }

  if (!svgNest) {
    message.innerHTML = "Couldn't initialize SVGnest";
    message.className = "error animated bounce";
    return;
  }

  if (!window.File || !window.FileReader) {
    message.innerHTML = "Your browser does not have file upload support";
    message.className = "error animated bounce";
    return;
  }

  if (!window.Worker) {
    message.innerHTML = "Your browser does not have web worker support";
    message.className = "error animated bounce";
    return;
  }

  // button clicks
  upload = document.getElementById("upload");
  const start: HTMLElement = document.getElementById("start");
  const download: HTMLElement = document.getElementById("download");
  const startLabel: HTMLElement = document.getElementById("startlabel");
  const fileInput: HTMLElement = document.getElementById("fileinput");

  const config: HTMLElement = document.getElementById("config");
  const configButton: HTMLElement = document.getElementById("configbutton");
  const configSave: HTMLElement = document.getElementById("configsave");

  const zoomIn: HTMLElement = document.getElementById("zoominbutton");
  const zoomOut: HTMLElement = document.getElementById("zoomoutbutton");
  const exit: HTMLElement = document.getElementById("exitbutton");

  let isWorking: boolean = false;

  start.onclick = function (e: MouseEvent): void {
    const target: HTMLElement = e.currentTarget as HTMLElement;

    if (target.className == "button start disabled") {
      return;
    }

    iterations = 0;

    if (isWorking) {
      stopNest();
    } else {
      startNest();
    }

    display.className = "disabled";
    document.getElementById("info_time").setAttribute("style", "display: none");
  };

  function startNest(): void {
    // Once started, don't allow this anymore
    document.removeEventListener("dragover", fileDragHover, false);
    document.removeEventListener("dragleave", fileDragHover, false);
    document.removeEventListener("drop", fileDrop, false);

    svgNest.start(progress, renderSvg);
    startLabel.innerHTML = "Stop Nest";
    start.className = "button spinner";
    configButton.className = "button config disabled";
    config.className = "";
    zoomIn.className = "button zoomin disabled";
    zoomOut.className = "button zoomout disabled";

    const svg: HTMLElement = document.querySelector("#select svg");

    if (svg) {
      svg.removeAttribute("style");
    }

    isWorking = true;
  }

  function stopNest(): void {
    svgNest.stop();
    startLabel.innerHTML = "Start Nest";
    start.className = "button start";
    configButton.className = "button config";

    isWorking = false;
  }

  // config
  var configvisible = false;
  configButton.onclick = function (e: MouseEvent) {
    const target: HTMLElement = e.currentTarget as HTMLElement;

    if (target.className == "button config disabled") {
      return false;
    }
    if (!configvisible) {
      config.className = "active";
      configButton.className = "button close";
    } else {
      config.className = "";
      configButton.className = "button config";
    }
    configvisible = !configvisible;

    return false;
  };

  configSave.onclick = function (): boolean {
    const c: { [key: string]: string } = {};
    const inputs: NodeListOf<Element> =
      document.querySelectorAll("#config input");
    let i: number = 0;
    let key: string;
    let input: HTMLInputElement;
    let type: string;

    for (i = 0; i < inputs.length; ++i) {
      input = inputs[i] as HTMLInputElement;
      key = input.getAttribute("data-config");
      type = input.getAttribute("type");
      if (type == "text") {
        c[key] = input.value;
      } else if (type == "checkbox") {
        c[key] = input.checked ? "1" : "";
      }
    }

    svgNest.config(c);

    // new configs will invalidate current nest
    if (isWorking) {
      stopNest();
    }

    configvisible = false;
    config.className = "";

    return false;
  };

  upload.onclick = function () {
    fileInput.click();
  };
  document.addEventListener("dragover", fileDragHover, false);
  document.addEventListener("dragleave", fileDragHover, false);
  document.addEventListener("drop", fileDrop, false);

  function fileDragHover(e: DragEvent): void {
    e.stopPropagation();
    e.preventDefault();
    upload.style.backgroundColor = e.type == "dragover" ? "#d7e9b7" : "";
  }

  function fileDrop(e: DragEvent): void {
    e.stopPropagation(); // Make sure not to replace website by file
    e.preventDefault();
    handleFile(e.dataTransfer.files[0], e.target as HTMLInputElement);
  }

  download.onclick = function () {
    if (download.className == "button download disabled") {
      return false;
    }

    const bins: HTMLElement = document.getElementById("bins");

    if (bins.children.length == 0) {
      message.innerHTML = "No SVG to export";
      message.className = "error animated bounce";
      return;
    }

    let svg: SVGElement = display.querySelector("svg");

    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    }

    svg = svg.cloneNode(false) as SVGAElement;

    // maintain stroke, fill etc of input
    if (svgNest.style) {
      svg.appendChild(svgNest.style);
    }

    const binHeight: number = parseInt(bins.children[0].getAttribute("height"));
    let i: number = 0;
    let j: number = 0;
    let b: HTMLElement;
    let group: SVGGElement;

    for (i = 0; i < bins.children.length; ++i) {
      b = bins.children[i] as HTMLElement;
      group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute(
        "transform",
        "translate(0 " + binHeight * 1.1 * i + ")"
      );
      for (j = 0; j < b.children.length; ++j) {
        group.appendChild(b.children[j].cloneNode(true));
      }

      svg.appendChild(group);
    }

    const output: string =
      typeof XMLSerializer != "undefined"
        ? new XMLSerializer().serializeToString(svg)
        : svg.outerHTML;

    const blob: Blob = new Blob([output], {
      type: "image/svg+xml;charset=utf-8"
    });
    saveBlobAs(blob, "SVGnest-output.svg");
  };

  let zoomLevel: number = 1.0;

  zoomIn.onclick = function (e: MouseEvent) {
    const target: HTMLElement = e.currentTarget as HTMLElement;

    if (target.className == "button zoomin disabled") {
      return false;
    }
    zoomLevel *= 1.2;

    const svg: Element = document.querySelector("#select svg");

    if (svg) {
      svg.setAttribute(
        "style",
        "transform-origin: top left; transform:scale(" +
          zoomLevel +
          "); -webkit-transform:scale(" +
          zoomLevel +
          "); -moz-transform:scale(" +
          zoomLevel +
          "); -ms-transform:scale(" +
          zoomLevel +
          "); -o-transform:scale(" +
          zoomLevel +
          ");"
      );
    }
  };

  zoomOut.onclick = function (e: MouseEvent) {
    const tartget: HTMLElement = e.currentTarget as HTMLElement;

    if (tartget.className == "button zoomout disabled") {
      return false;
    }
    zoomLevel *= 0.8;

    if (zoomLevel < 0.02) {
      zoomLevel = 0.02;
    }

    const svg: HTMLElement = document.querySelector("#select svg");

    if (svg) {
      svg.setAttribute(
        "style",
        "transform-origin: top left; transform:scale(" +
          zoomLevel +
          "); -webkit-transform:scale(" +
          zoomLevel +
          "); -moz-transform:scale(" +
          zoomLevel +
          "); -ms-transform:scale(" +
          zoomLevel +
          "); -o-transform:scale(" +
          zoomLevel +
          ");"
      );
    }
  };

  exit.onclick = function () {
    location.reload();
  };

  fileInput.onchange = function (e: Event) {
    handleFile(
      (e.target as HTMLInputElement).files[0],
      e.target as HTMLInputElement
    );
  };

  function handleFile(file: File, input: HTMLInputElement): void {
    if (!file) {
      return;
    }

    if (
      !file.type ||
      (file.type.search("svg") < 0 &&
        file.type.search("xml") < 0 &&
        file.type.search("text") < 0)
    ) {
      message.innerHTML = "Only SVG files allowed";
      message.className = "error animated bounce";
      return;
    }

    const reader: FileReader = new FileReader();

    reader.onload = function (e: ProgressEvent<FileReader>) {
      input.value = null;

      if (reader.result) {
        let svg: SVGElement;
        let wholeSVG: SVGSVGElement;
        try {
          svg = svgNest.parseSvg(reader.result as string) as SVGElement;
          {
            wholeSVG = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "svg"
            );
            // Copy relevant scaling info
            wholeSVG.setAttribute("width", svg.getAttribute("width"));
            wholeSVG.setAttribute("height", svg.getAttribute("height"));
            wholeSVG.setAttribute("viewBox", svg.getAttribute("viewBox"));
            var rect = document.createElementNS(wholeSVG.namespaceURI, "rect");
            rect.setAttribute("x", wholeSVG.viewBox.baseVal.x.toString());
            rect.setAttribute("y", wholeSVG.viewBox.baseVal.x.toString());
            rect.setAttribute(
              "width",
              wholeSVG.viewBox.baseVal.width.toString()
            );
            rect.setAttribute(
              "height",
              wholeSVG.viewBox.baseVal.height.toString()
            );
            rect.setAttribute("class", "fullRect");
            wholeSVG.appendChild(rect);
          }
          display.innerHTML = "";
          display.appendChild(wholeSVG); // As a default bin in background
          display.appendChild(svg);
        } catch (e) {
          message.innerHTML = e;
          message.className = "error animated bounce";
          return;
        }

        hideSplash();
        message.innerHTML = "Click on the outline to use as the bin";
        message.className = "active animated bounce";
        start.className = "button start disabled";

        attachSvgListeners(svg);
        attachSvgListeners(wholeSVG);
      }
    };

    reader.readAsText(file);
  }

  function attachSvgListeners(svg: SVGElement) {
    let i: number = 0;
    let node: HTMLElement;
    // attach event listeners
    for (i = 0; i < svg.childNodes.length; ++i) {
      node = svg.childNodes[i] as HTMLElement;

      if (node.nodeType == 1) {
        node.onclick = function (e: MouseEvent): void {
          if (display.className == "disabled") {
            return;
          }

          const currentBin: Element = document.querySelector("#select .active");

          if (currentBin) {
            var className = currentBin
              .getAttribute("class")
              .replace("active", "")
              .trim();
            if (!className) currentBin.removeAttribute("class");
            else currentBin.setAttribute("class", className);
          }

          const target: SVGElement = e.currentTarget as SVGElement;

          svgNest.setBin(target);
          target.setAttribute(
            "class",
            (target.getAttribute("class")
              ? target.getAttribute("class") + " "
              : "") + "active"
          );

          start.className = "button start animated bounce";
          message.className = "";
        };
      }
    }
  }

  let prevPercent: number = 0;
  let startTime: number = 0;

  function progress(percent: number): void {
    const transition: string =
      percent > prevPercent ? "; transition: width 0.1s" : "";
    document
      .getElementById("info_progress")
      .setAttribute(
        "style",
        "width: " + Math.round(percent * 100) + "% " + transition
      );
    document.getElementById("info").setAttribute("style", "display: block");

    prevPercent = percent;

    const now: number = new Date().getTime();

    if (startTime && now) {
      var diff = now - startTime;
      // show a time estimate for long-running placements
      var estimate = (diff / percent) * (1 - percent);
      document.getElementById("info_time").innerHTML =
        millisecondsToStr(estimate) + " remaining";

      if (diff > 5000 && percent < 0.3 && percent > 0.02 && estimate > 10000) {
        document
          .getElementById("info_time")
          .setAttribute("style", "display: block");
      }
    }

    if (percent > 0.95 || percent < 0.02) {
      document
        .getElementById("info_time")
        .setAttribute("style", "display: none");
    }
    if (percent < 0.02) {
      startTime = new Date().getTime();
    }
  }

  let iterations: number = 0;

  function renderSvg(
    svgList: SVGAElement[],
    efficiency: number,
    placed: number,
    total: number
  ): void {
    ++iterations;

    document.getElementById("info_iterations").innerHTML =
      iterations.toString();

    if (!svgList || svgList.length == 0) {
      return;
    }

    const bins: HTMLElement = document.getElementById("bins");
    let i: number = 0;
    bins.innerHTML = "";

    for (i = 0; i < svgList.length; ++i) {
      if (svgList.length > 2) {
        svgList[i].setAttribute("class", "grid");
      }
      bins.appendChild(svgList[i]);
    }

    if (efficiency || efficiency === 0) {
      document.getElementById("info_efficiency").innerHTML = Math.round(
        efficiency * 100
      ).toString();
    }

    document.getElementById("info_placed").innerHTML = placed + "/" + total;

    document
      .getElementById("info_placement")
      .setAttribute("style", "display: block");
    display.setAttribute("style", "display: none");
    download.className = "button download animated bounce";
  }

  message.onclick = function (e: MouseEvent) {
    (e.currentTarget as Element).className = "";
  };

  function millisecondsToStr(milliseconds: number): string {
    function numberEnding(number: number) {
      return number > 1 ? "s" : "";
    }

    let temp: number = Math.floor(milliseconds / 1000);
    const years: number = Math.floor(temp / 31536000);

    if (years) {
      return years + " year" + numberEnding(years);
    }

    const days: number = Math.floor((temp %= 31536000) / 86400);

    if (days) {
      return days + " day" + numberEnding(days);
    }

    const hours: number = Math.floor((temp %= 86400) / 3600);

    if (hours) {
      return hours + " hour" + numberEnding(hours);
    }
    const minutes: number = Math.floor((temp %= 3600) / 60);

    if (minutes) {
      return minutes + " minute" + numberEnding(minutes);
    }
    const seconds: number = temp % 60;

    if (seconds) {
      return seconds + " second" + numberEnding(seconds);
    }

    return "less than a second";
  }
});
