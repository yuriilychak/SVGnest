import SvgNest from "./svg-nest";
import "./svg-parser/path-seg-polyfill";

// UI-specific stuff, button clicks go here
const svgNest = new SvgNest();

function ready(fn) {
  if (document.readyState != "loading") {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

function saveBlobAs(blob, file_name) {
  if (typeof navigator.msSaveBlob == "function")
    return navigator.msSaveBlob(blob, file_name);

  var saver = document.createElementNS("http://www.w3.org/1999/xhtml", "a");
  var blobURL = (saver.href = URL.createObjectURL(blob)),
    body = document.body;

  saver.download = file_name;

  body.appendChild(saver);
  saver.dispatchEvent(new MouseEvent("click"));
  body.removeChild(saver);
  URL.revokeObjectURL(blobURL);
}

ready(function () {
  // FAQ toggle
  var faq = document.getElementById("faq");
  var faqButton = document.getElementById("faqbutton");

  var faqVisible = false;
  faqButton.onclick = function (e) {
    if (!faqVisible) {
      faq.setAttribute("style", "display: block");
    } else {
      faq.removeAttribute("style");
    }
    faqVisible = !faqVisible;
  };

  function hideSplash() {
    var splash = document.getElementById("splash");
    var svgNestElement = document.getElementById("svgnest");

    if (splash) {
      splash.remove();
    }
    svgNestElement.setAttribute("style", "display: block");
  }

  var demo = document.getElementById("demo");
  var upload = document.getElementById("upload");
  var display = document.getElementById("select");

  demo.onclick = function () {
    try {
      var svg = svgNest.parseSvg(display.innerHTML);
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

    attachSvgListeners(svg);
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
  var upload = document.getElementById("upload");
  var start = document.getElementById("start");
  var download = document.getElementById("download");
  var startLabel = document.getElementById("startLabel");
  var fileInput = document.getElementById("fileinput");

  var config = document.getElementById("config");
  var configButton = document.getElementById("configButton");
  var configSave = document.getElementById("configSave");

  var zoomIn = document.getElementById("zoomInButton");
  var zoomOut = document.getElementById("zoomOutButton");
  var exit = document.getElementById("exitButton");

  var isWorking = false;

  start.onclick = function () {
    if (this.className == "button start disabled") {
      return false;
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

  function startNest() {
    // Once started, don't allow this anymore
    document.removeEventListener("dragover", FileDragHover, false);
    document.removeEventListener("dragleave", FileDragHover, false);
    document.removeEventListener("drop", FileDrop, false);

    svgNest.start(progress, renderSvg);
    startLabel.innerHTML = "Stop Nest";
    start.className = "button spinner";
    configButton.className = "button config disabled";
    config.className = "";
    zoomIn.className = "button zoom in disabled";
    zoomOut.className = "button zoom out disabled";

    var svg = document.querySelector("#select svg");
    if (svg) {
      svg.removeAttribute("style");
    }

    isWorking = true;
  }

  function stopNest() {
    svgNest.stop();
    startLabel.innerHTML = "Start Nest";
    start.className = "button start";
    configButton.className = "button config";

    isWorking = false;
  }

  // config
  var configVisible = false;
  configButton.onclick = function () {
    if (this.className == "button config disabled") {
      return false;
    }
    if (!configVisible) {
      config.className = "active";
      configButton.className = "button close";
    } else {
      config.className = "";
      configButton.className = "button config";
    }
    configVisible = !configVisible;

    return false;
  };

  configSave.onclick = function () {
    var c = {};
    var inputs = document.querySelectorAll("#config input");
    for (var i = 0; i < inputs.length; i++) {
      var key = inputs[i].getAttribute("data-config");
      if (inputs[i].getAttribute("type") == "text") {
        c[key] = inputs[i].value;
      } else if (inputs[i].getAttribute("type") == "checkbox") {
        c[key] = inputs[i].checked;
      }
    }

    svgNest.config(c);

    // new configs will invalidate current nest
    if (isWorking) {
      stopNest();
    }
    configVisible = false;
    config.className = "";
    return false;
  };

  upload.onclick = function () {
    fileInput.click();
  };
  document.addEventListener("dragover", FileDragHover, false);
  document.addEventListener("dragleave", FileDragHover, false);
  document.addEventListener("drop", FileDrop, false);

  function FileDragHover(e) {
    e.stopPropagation();
    e.preventDefault();
    upload.style.backgroundColor = e.type == "dragover" ? "#d7e9b7" : "";
  }
  
  function FileDrop(e) {
    e.stopPropagation(); // Make sure not to replace website by file
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  }

  download.onclick = function () {
    if (download.className == "button download disabled") {
      return false;
    }

    var bins = document.getElementById("bins");

    if (bins.children.length == 0) {
      message.innerHTML = "No SVG to export";
      message.className = "error animated bounce";
      return;
    }

    var svg;
    svg = display.querySelector("svg");

    if (!svg) {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    }

    svg = svg.cloneNode(false);

    // maintain stroke, fill etc of input
    if (svgNest.style) {
      svg.appendChild(svgNest.style);
    }

    var binHeight = parseInt(bins.children[0].getAttribute("height"));

    for (var i = 0; i < bins.children.length; i++) {
      var b = bins.children[i];
      var group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute(
        "transform",
        "translate(0 " + binHeight * 1.1 * i + ")"
      );
      for (var j = 0; j < b.children.length; j++) {
        group.appendChild(b.children[j].cloneNode(true));
      }

      svg.appendChild(group);
    }

    var output;
    if (typeof XMLSerializer != "undefined") {
      output = new XMLSerializer().serializeToString(svg);
    } else {
      output = svg.outerHTML;
    }

    var blob = new Blob([output], { type: "image/svg+xml;charset=utf-8" });
    saveBlobAs(blob, "SVGnest-output.svg");
  };

  var zoomLevel = 1.0;

  zoomIn.onclick = function () {
    if (this.className == "button zoom in disabled") {
      return false;
    }
    zoomLevel *= 1.2;
    var svg = document.querySelector("#select svg");
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

  zoomOut.onclick = function () {
    if (this.className == "button zoom out disabled") {
      return false;
    }
    zoomLevel *= 0.8;
    if (zoomLevel < 0.02) {
      zoomLevel = 0.02;
    }
    var svg = document.querySelector("#select svg");
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

  fileInput.onchange = function (e) {
    handleFile(e.target.files[0]);
  };

  function handleFile(file) {
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

    var reader = new FileReader();
    var input = this;
    reader.onload = function (e) {
      input.value = null;

      if (reader.result) {
        try {
          var svg = svgNest.parseSvg(reader.result);
          {
            var wholeSVG = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "svg"
            );
            // Copy relevant scaling info
            wholeSVG.setAttribute("width", svg.getAttribute("width"));
            wholeSVG.setAttribute("height", svg.getAttribute("height"));
            wholeSVG.setAttribute("viewBox", svg.getAttribute("viewBox"));
            var rect = document.createElementNS(wholeSVG.namespaceURI, "rect");
            rect.setAttribute("x", wholeSVG.viewBox.baseVal.x);
            rect.setAttribute("y", wholeSVG.viewBox.baseVal.x);
            rect.setAttribute("width", wholeSVG.viewBox.baseVal.width);
            rect.setAttribute("height", wholeSVG.viewBox.baseVal.height);
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

  function attachSvgListeners(svg) {
    // attach event listeners
    for (var i = 0; i < svg.childNodes.length; i++) {
      var node = svg.childNodes[i];
      if (node.nodeType == 1) {
        node.onclick = function () {
          if (display.className == "disabled") {
            return;
          }
          var currentBin = document.querySelector("#select .active");
          if (currentBin) {
            var className = currentBin
              .getAttribute("class")
              .replace("active", "")
              .trim();
            if (!className) currentBin.removeAttribute("class");
            else currentBin.setAttribute("class", className);
          }

          svgNest.setBin(this);
          this.setAttribute(
            "class",
            (this.getAttribute("class")
              ? this.getAttribute("class") + " "
              : "") + "active"
          );

          start.className = "button start animated bounce";
          message.className = "";
        };
      }
    }
  }

  var prevPercent = 0;
  var startTime = null;

  function progress(percent) {
    var transition = percent > prevPercent ? "; transition: width 0.1s" : "";
    document
      .getElementById("info_progress")
      .setAttribute(
        "style",
        "width: " + Math.round(percent * 100) + "% " + transition
      );
    document.getElementById("info").setAttribute("style", "display: block");

    prevPercent = percent;

    var now = new Date().getTime();
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

  var iterations = 0;

  function renderSvg(svgList, efficiency, placed, total) {
    iterations++;
    document.getElementById("info_iterations").innerHTML = iterations;

    if (!svgList || svgList.length == 0) {
      return;
    }
    var bins = document.getElementById("bins");
    bins.innerHTML = "";

    for (var i = 0; i < svgList.length; i++) {
      if (svgList.length > 2) {
        svgList[i].setAttribute("class", "grid");
      }
      bins.appendChild(svgList[i]);
    }

    if (efficiency || efficiency === 0) {
      document.getElementById("info_efficiency").innerHTML = Math.round(
        efficiency * 100
      );
    }

    document.getElementById("info_placed").innerHTML = placed + "/" + total;

    document
      .getElementById("info_placement")
      .setAttribute("style", "display: block");
    display.setAttribute("style", "display: none");
    download.className = "button download animated bounce";
  }

  message.onclick = function (e) {
    this.className = "";
  };

  function millisecondsToStr(milliseconds) {
    function numberEnding(number) {
      return number > 1 ? "s" : "";
    }

    var temp = Math.floor(milliseconds / 1000);
    var years = Math.floor(temp / 31536000);
    if (years) {
      return years + " year" + numberEnding(years);
    }
    var days = Math.floor((temp %= 31536000) / 86400);
    if (days) {
      return days + " day" + numberEnding(days);
    }
    var hours = Math.floor((temp %= 86400) / 3600);
    if (hours) {
      return hours + " hour" + numberEnding(hours);
    }
    var minutes = Math.floor((temp %= 3600) / 60);
    if (minutes) {
      return minutes + " minute" + numberEnding(minutes);
    }
    var seconds = temp % 60;
    if (seconds) {
      return seconds + " second" + numberEnding(seconds);
    }
    return "less than a second";
  }
});
