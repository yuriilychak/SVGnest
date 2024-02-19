import ClipperLib from "js-clipper";
import {
  polygonArea,
  getPolygonBounds,
  pointInPolygon
} from "../../geometry-util";
import { isRectangle, noFitPolygon, noFitPolygonRectangle } from "./util";
import FloatPoint from "../../float-point";
import { keyToNFPData } from "../../util";

// clipperjs uses alerts for warnings
function alert(message) {
  console.log("alert: ", message);
}

// jsClipper uses X/Y instead of x/y...
function toClipperCoordinates(polygon) {
  const size = polygon.length;
  const result = [];
  let i = 0;
  let point;

  for (i = 0; i < size; ++i) {
    point = polygon[i];
    result.push({ X: point.x, Y: point.y });
  }

  return result;
}

function toNestCoordinates(polygon, scale) {
  const size = polygon.length;
  const result = [];
  let i = 0;
  let point;

  for (i = 0; i < size; ++i) {
    point = polygon[i];
    result.push({
      x: point.X / scale,
      y: point.Y / scale
    });
  }

  return result;
}

function rotatePolygon(polygon, degrees) {
  const result = [];
  const angle = (degrees * Math.PI) / 180;
  let size = polygon.length;
  let i = 0;

  for (i = 0; i < size; ++i) {
    result.push(FloatPoint.from(polygon[i]).rotate(angle));
  }

  size = polygon.children ? polygon.children.length : 0;

  if (size > 0) {
    result.children = [];

    for (i = 0; i < size; ++i) {
      result.children.push(rotatePolygon(polygon.children[i], degrees));
    }
  }

  return result;
}

function minkowskiDifference(A, B) {
  let i = 0;
  let clipperNfp;
  let largestArea = null;
  let n;
  let sArea;
  const clippedA = toClipperCoordinates(A);
  const clippedB = toClipperCoordinates(B);

  ClipperLib.JS.ScaleUpPath(clippedA, 10000000);
  ClipperLib.JS.ScaleUpPath(clippedB, 10000000);

  for (i = 0; i < clippedB.length; ++i) {
    clippedB[i].X *= -1;
    clippedB[i].Y *= -1;
  }

  const solutions = ClipperLib.Clipper.MinkowskiSum(clippedA, clippedB, true);
  const solutionCount = solutions.length;

  for (i = 0; i < solutionCount; ++i) {
    n = toNestCoordinates(solutions[i], 10000000);
    sArea = polygonArea(n);

    if (largestArea === null || largestArea > sArea) {
      clipperNfp = n;
      largestArea = sArea;
    }
  }

  for (i = 0; i < clipperNfp.length; ++i) {
    clipperNfp[i].x += B[0].x;
    clipperNfp[i].y += B[0].y;
  }

  return [clipperNfp];
}

export default function pairData(pair, env) {
  if (!pair || pair.length == 0) {
    return null;
  }

  const searchEdges = env.searchEdges;
  const useHoles = env.useHoles;

  const nfpData = keyToNFPData(pair.numKey, env.rotations);

  let A = rotatePolygon(pair.A, nfpData[2]);
  let B = rotatePolygon(pair.B, nfpData[3]);
  let nfp;
  let i = 0;

  if (nfpData[4] === 1) {
    if (isRectangle(A, 0.001)) {
      nfp = noFitPolygonRectangle(A, B);
    } else {
      nfp = noFitPolygon(A, B, true, searchEdges);
    }

    // ensure all interior NFPs have the same winding direction
    if (nfp && nfp.length > 0) {
      for (i = 0; i < nfp.length; ++i) {
        if (polygonArea(nfp[i]) > 0) {
          nfp[i].reverse();
        }
      }
    } else {
      // warning on null inner NFP
      // this is not an error, as the part may simply be larger than the bin or otherwise unplaceable due to geometry
      console.log("NFP Warning: ", nfpData);
    }
  } else {
    if (searchEdges) {
      nfp = noFitPolygon(A, B, false, searchEdges);
    } else {
      nfp = minkowskiDifference(A, B);
    }
    // sanity check
    if (!nfp || nfp.length == 0) {
      console.log("NFP Error: ", nfpData);
      console.log("A: ", JSON.stringify(A));
      console.log("B: ", JSON.stringify(B));
      return null;
    }

    for (i = 0; i < nfp.length; ++i) {
      if (!searchEdges || i == 0) {
        // if searchedges is active, only the first NFP is guaranteed to pass sanity check
        if (Math.abs(polygonArea(nfp[i])) < Math.abs(polygonArea(A))) {
          console.log(
            "NFP Area Error: ",
            Math.abs(polygonArea(nfp[i])),
            nfpData
          );
          console.log("NFP:", JSON.stringify(nfp[i]));
          console.log("A: ", JSON.stringify(A));
          console.log("B: ", JSON.stringify(B));
          nfp.splice(i, 1);
          return null;
        }
      }
    }

    if (nfp.length == 0) {
      return null;
    }

    // for outer NFPs, the first is guaranteed to be the largest. Any subsequent NFPs that lie inside the first are holes
    for (i = 0; i < nfp.length; ++i) {
      if (polygonArea(nfp[i]) > 0) {
        nfp[i].reverse();
      }

      if (
        i > 0 &&
        pointInPolygon(nfp[i][0], nfp[0]) &&
        polygonArea(nfp[i]) < 0
      ) {
        nfp[i].reverse();
      }
    }

    // generate nfps for children (holes of parts) if any exist
    if (useHoles && A.childNodes && A.childNodes.length > 0) {
      const boundsB = getPolygonBounds(B);
      let boundsA;
      let cnfp;
      let j = 0;

      for (i = 0; i < A.childNodes.length; ++i) {
        boundsA = getPolygonBounds(A.childNodes[i]);

        // no need to find nfp if B's bounding box is too big
        if (boundsA.width > boundsB.width && boundsA.height > boundsB.height) {
          cnfp = noFitPolygon(A.childNodes[i], B, true, searchEdges);
          // ensure all interior NFPs have the same winding direction
          if (cnfp && cnfp.length > 0) {
            for (j = 0; j < cnfp.length; ++j) {
              if (polygonArea(cnfp[j]) < 0) {
                cnfp[j].reverse();
              }
              nfp.push(cnfp[j]);
            }
          }
        }
      }
    }
  }

  return { value: nfp, numKey: pair.numKey };
}
