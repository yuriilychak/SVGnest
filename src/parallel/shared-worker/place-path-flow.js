import ClipperLib from "js-clipper";
import {
  polygonArea,
  getPolygonBounds,
  almostEqual
} from "../../geometry-util";
import { generateNFPCacheKey } from "../../util";
import FloatPoint from "../../float-point";

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
  const size = polygon.length;
  let i = 0;

  for (i = 0; i < size; ++i) {
    result.push(FloatPoint.from(polygon[i]).rotate(angle));
  }

  if (polygon.children && polygon.children.length > 0) {
    let j = 0;
    let childCount = polygon.children.length;

    result.children = [];

    for (j = 0; j < childCount; ++j) {
      result.children.push(rotatePolygon(polygon.children[j], degrees));
    }
  }

  return result;
}

export default function placePaths(inputPaths, env) {
  if (!env.binPolygon) {
    return null;
  }

  // rotate paths by given rotation
  const paths = [];
  const allPlacements = [];
  const binArea = Math.abs(polygonArea(env.binPolygon));
  let i = 0;
  let j = 0;
  let k = 0;
  let m = 0;
  let n = 0;
  let path;
  let rotatedPath;
  let fitness = 0;
  let nfp;
  let numKey = 0;
  let placed;
  let placements;
  let binNfp;
  let error;
  let position;
  let clipperBinNfp;
  let clipper;
  let combinedNfp;
  let finalNfp;
  let f;
  let allPoints;
  let index;
  let rectBounds;
  let minWidth = null;
  let minArea = null;
  let minX = null;
  let nf;
  let area;
  let shiftVector;
  let clone;
  const minScale = 0.1 * env.config.clipperScale * env.config.clipperScale;
  const cleanTrashold = 0.0001 * env.config.clipperScale;
  const emptyPath = { id: -1, rotation: 0 };
  const rotations = env.config.rotations;

  for (i = 0; i < inputPaths.length; ++i) {
    path = inputPaths[i];
    rotatedPath = rotatePolygon(path, path.rotation);
    rotatedPath.rotation = path.rotation;
    rotatedPath.source = path.source;
    rotatedPath.id = path.id;
    paths.push(rotatedPath);
  }

  while (paths.length > 0) {
    placed = [];
    placements = [];
    fitness += 1; // add 1 for each new bin opened (lower fitness is better)

    for (i = 0; i < paths.length; ++i) {
      path = paths[i];

      // inner NFP
      numKey = generateNFPCacheKey(rotations, true, emptyPath, path);
      binNfp = env.nfpCache.get(numKey);

      // part unplaceable, skip
      if (!binNfp || binNfp.length == 0) {
        continue;
      }

      // ensure all necessary NFPs exist
      error = false;

      for (j = 0; j < placed.length; ++j) {
        numKey = generateNFPCacheKey(rotations, false, placed[j], path);

        if (!env.nfpCache.has(numKey)) {
          error = true;
          break;
        }
      }

      // part unplaceable, skip
      if (error) {
        continue;
      }

      position = null;

      if (placed.length == 0) {
        // first placement, put it on the left
        for (j = 0; j < binNfp.length; ++j) {
          for (k = 0; k < binNfp[j].length; ++k) {
            if (position === null || binNfp[j][k].x - path[0].x < position.x) {
              position = {
                x: binNfp[j][k].x - path[0].x,
                y: binNfp[j][k].y - path[0].y,
                id: path.id,
                rotation: path.rotation
              };
            }
          }
        }

        placements.push(position);
        placed.push(path);

        continue;
      }

      clipperBinNfp = [];

      for (j = 0; j < binNfp.length; ++j) {
        clipperBinNfp.push(toClipperCoordinates(binNfp[j]));
      }

      ClipperLib.JS.ScaleUpPaths(clipperBinNfp, env.config.clipperScale);

      clipper = new ClipperLib.Clipper();
      combinedNfp = new ClipperLib.Paths();

      for (j = 0; j < placed.length; ++j) {
        numKey = generateNFPCacheKey(rotations, false, placed[j], path);

        if (!env.nfpCache.has(numKey)) {
          continue;
        }

        nfp = env.nfpCache.get(numKey);

        for (k = 0; k < nfp.length; ++k) {
          clone = toClipperCoordinates(nfp[k]);
          for (m = 0; m < clone.length; ++m) {
            clone[m].X += placements[j].x;
            clone[m].Y += placements[j].y;
          }

          ClipperLib.JS.ScaleUpPath(clone, env.config.clipperScale);
          clone = ClipperLib.Clipper.CleanPolygon(clone, cleanTrashold);
          area = Math.abs(ClipperLib.Clipper.Area(clone));

          if (clone.length > 2 && area > minScale) {
            clipper.AddPath(clone, ClipperLib.PolyType.ptSubject, true);
          }
        }
      }

      if (
        !clipper.Execute(
          ClipperLib.ClipType.ctUnion,
          combinedNfp,
          ClipperLib.PolyFillType.pftNonZero,
          ClipperLib.PolyFillType.pftNonZero
        )
      ) {
        continue;
      }

      // difference with bin polygon
      finalNfp = new ClipperLib.Paths();
      clipper = new ClipperLib.Clipper();

      clipper.AddPaths(combinedNfp, ClipperLib.PolyType.ptClip, true);
      clipper.AddPaths(clipperBinNfp, ClipperLib.PolyType.ptSubject, true);
      if (
        !clipper.Execute(
          ClipperLib.ClipType.ctDifference,
          finalNfp,
          ClipperLib.PolyFillType.pftNonZero,
          ClipperLib.PolyFillType.pftNonZero
        )
      ) {
        continue;
      }

      finalNfp = ClipperLib.Clipper.CleanPolygons(finalNfp, cleanTrashold);

      for (j = 0; j < finalNfp.length; ++j) {
        area = Math.abs(ClipperLib.Clipper.Area(finalNfp[j]));

        if (finalNfp[j].length < 3 || area < minScale) {
          finalNfp.splice(j, 1);
          j--;
        }
      }

      if (!finalNfp || finalNfp.length == 0) {
        continue;
      }

      f = [];

      for (j = 0; j < finalNfp.length; ++j) {
        // back to normal scale
        f.push(toNestCoordinates(finalNfp[j], env.config.clipperScale));
      }

      finalNfp = f;

      // choose placement that results in the smallest bounding box
      // could use convex hull instead, but it can create oddly shaped nests (triangles or long slivers) which are not optimal for real-world use
      // todo: generalize gravity direction
      minWidth = null;
      minArea = null;
      minX = null;

      for (j = 0; j < finalNfp.length; ++j) {
        nf = finalNfp[j];
        if (Math.abs(polygonArea(nf)) < 2) {
          continue;
        }

        for (k = 0; k < nf.length; ++k) {
          allPoints = [];

          for (m = 0; m < placed.length; ++m) {
            for (n = 0; n < placed[m].length; ++n) {
              allPoints.push(FloatPoint.from(placed[m][n]).add(placements[m]));
            }
          }

          shiftVector = {
            x: nf[k].x - path[0].x,
            y: nf[k].y - path[0].y,
            id: path.id,
            rotation: path.rotation,
            nfp: combinedNfp
          };

          for (m = 0; m < path.length; ++m) {
            allPoints.push(FloatPoint.from(path[m]).add(shiftVector));
          }

          rectBounds = getPolygonBounds(allPoints);

          // weigh width more, to help compress in direction of gravity
          area = rectBounds.width * 2 + rectBounds.height;

          if (
            minArea === null ||
            area < minArea ||
            (almostEqual(minArea, area) &&
              (minX === null || shiftVector.x < minX))
          ) {
            minArea = area;
            minWidth = rectBounds.width;
            position = shiftVector;
            minX = shiftVector.x;
          }
        }
      }

      if (position) {
        placed.push(path);
        placements.push(position);
      }
    }

    if (minWidth) {
      fitness += minWidth / binArea;
    }

    for (i = 0; i < placed.length; ++i) {
      index = paths.indexOf(placed[i]);

      if (index >= 0) {
        paths.splice(index, 1);
      }
    }

    if (placements && placements.length > 0) {
      allPlacements.push(placements);
    } else {
      break; // something went wrong
    }
  }

  // there were parts that couldn't be placed
  fitness += 2 * paths.length;

  return {
    placements: allPlacements,
    fitness,
    paths,
    area: binArea
  };
}
