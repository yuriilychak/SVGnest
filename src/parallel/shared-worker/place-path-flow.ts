//@ts-ignore
import ClipperLib from "js-clipper";
import {
  polygonArea,
  getPolygonBounds,
  rotatePolygon,
  toClipperCoordinates,
  toNestCoordinates
} from "../../geometry-util";
import { generateNFPCacheKey } from "../../util";
import FloatPoint from "../../float-point";
import { almostEqual } from "../../util";
import {
  ArrayPolygon,
  ClipperPoint,
  PlaceDataResult,
  PlacePairConfiguration,
  Point
} from "../../interfaces";

export default function placePaths(
  inputPaths: Array<ArrayPolygon>,
  env: PlacePairConfiguration
): PlaceDataResult {
  if (!env.binPolygon) {
    return null;
  }

  // rotate paths by given rotation
  const paths = [];
  const allPlacements = [];
  const binArea: number = Math.abs(polygonArea(env.binPolygon));
  let i: number = 0;
  let j: number = 0;
  let k: number = 0;
  let m: number = 0;
  let n: number = 0;
  let path: ArrayPolygon;
  let rotatedPath: ArrayPolygon;
  let fitness: number = 0;
  let nfp;
  let numKey: number = 0;
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
  let allPoints: ArrayPolygon;
  let index;
  let rectBounds;
  let minWidth: number | null = null;
  let minArea: number | null = null;
  let minX: number | null = null;
  let nf;
  let area: number;
  let shiftVector: Point;
  let clone: ClipperPoint[];
  const minScale: number =
    0.1 * env.config.clipperScale * env.config.clipperScale;
  const cleanTrashold: number = 0.0001 * env.config.clipperScale;
  const emptyPath: ArrayPolygon = { id: -1, rotation: 0 } as ArrayPolygon;
  const rotations: number = env.config.rotations;

  for (i = 0; i < inputPaths.length; ++i) {
    path = inputPaths.at(i);
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
      path = paths.at(i);

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
        numKey = generateNFPCacheKey(rotations, false, placed.at(j), path);

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
          for (k = 0; k < binNfp.at(j).length; ++k) {
            if (
              position === null ||
              binNfp.at(j).at(k).x - path.at(0).x < position.x
            ) {
              position = {
                x: binNfp.at(j).at(k).x - path.at(0).x,
                y: binNfp.at(j).at(k).y - path.at(0).y,
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
        clipperBinNfp.push(toClipperCoordinates(binNfp.at(j)));
      }

      ClipperLib.JS.ScaleUpPaths(clipperBinNfp, env.config.clipperScale);

      clipper = new ClipperLib.Clipper();
      combinedNfp = new ClipperLib.Paths();

      for (j = 0; j < placed.length; ++j) {
        numKey = generateNFPCacheKey(rotations, false, placed.at(j), path);

        if (!env.nfpCache.has(numKey)) {
          continue;
        }

        nfp = env.nfpCache.get(numKey);

        for (k = 0; k < nfp.length; ++k) {
          clone = toClipperCoordinates(nfp.at(k));
          for (m = 0; m < clone.length; ++m) {
            clone.at(m).X += placements.at(j).x;
            clone.at(m).Y += placements.at(j).y;
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
        area = Math.abs(ClipperLib.Clipper.Area(finalNfp.at(j)));

        if (finalNfp.at(j).length < 3 || area < minScale) {
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
        f.push(toNestCoordinates(finalNfp.at(j), env.config.clipperScale));
      }

      finalNfp = f;

      // choose placement that results in the smallest bounding box
      // could use convex hull instead, but it can create oddly shaped nests (triangles or long slivers) which are not optimal for real-world use
      // todo: generalize gravity direction
      minWidth = null;
      minArea = null;
      minX = null;

      for (j = 0; j < finalNfp.length; ++j) {
        nf = finalNfp.at(j);
        if (Math.abs(polygonArea(nf)) < 2) {
          continue;
        }

        for (k = 0; k < nf.length; ++k) {
          allPoints = new Array<Point>() as ArrayPolygon;

          for (m = 0; m < placed.length; ++m) {
            for (n = 0; n < placed.at(m).length; ++n) {
              allPoints.push(
                FloatPoint.from(placed.at(m).at(n)).add(placements.at(m))
              );
            }
          }

          shiftVector = {
            x: nf.at(k).x - path.at(0).x,
            y: nf.at(k).y - path.at(0).y,
            id: path.id,
            rotation: path.rotation,
            nfp: combinedNfp
          };

          for (m = 0; m < path.length; ++m) {
            allPoints.push(FloatPoint.from(path.at(m)).add(shiftVector));
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
      index = paths.indexOf(placed.at(i));

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
