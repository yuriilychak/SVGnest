//@ts-ignore
import { Clipper } from "./clipper";

import {
  polygonArea,
  rotatePolygon,
  toNestCoordinates,
  getPolygonBounds,
  pointInPolygon
} from "../../geometry-util";
import { exportPolygon, keyToNFPData, importPolygons } from "../../util";
import {
  ClipperPoint,
  IPoint,
  IPolygon,
  NfpPair,
  PairDataResult,
  PairWorkerData
} from "../../interfaces";
import { instantiate, __AdaptedExports } from "../../asm";
import { Rect, Point } from "../../geom";
import { ClipType, PolyFillType, PolyType } from "./enums";

function orientation(poly: ClipperPoint[]): boolean {
  const pointCount: number = poly.length;
  let result: number = 0;
  let i: number = 0;
  let prevPoint: ClipperPoint;
  let currentPoint: ClipperPoint;

  for (i = 0; i < pointCount; ++i) {
    currentPoint = poly[i];
    prevPoint = poly[(i + pointCount - 1) % pointCount];
    result += (prevPoint.X + currentPoint.X) * (prevPoint.Y - currentPoint.Y);
  }

  return result >= 0;
}

function minkowskiDifference(a: IPolygon, b: IPolygon): IPolygon[] {
  const scale: number = 10000000;
  const sizeA: number = a.length;
  const sizeB: number = b.length;
  const solutions: ClipperPoint[][] = [];
  const quads: ClipperPoint[][] = [];
  let pointB: IPoint;
  let pointA: IPoint;
  let currentPath: ClipperPoint[];
  let nextPath: ClipperPoint[];
  let quad: ClipperPoint[];
  let i: number = 0;
  let j: number = 0;
  let clipperNfp;
  let largestArea: number = Number.NaN;
  let n: IPolygon;
  let sArea: number;

  for (i = 0; i < sizeB; ++i) {
    pointB = b.at(i);
    currentPath = new Array(sizeA);

    for (j = 0; j < sizeA; ++j) {
      pointA = a.at(j);
      currentPath[j] = {
        X: (pointA.x - pointB.x) * scale,
        Y: (pointA.y - pointB.y) * scale
      };
    }

    solutions.push(currentPath);
  }

  for (i = 0; i < sizeB; ++i) {
    currentPath = solutions[i];
    nextPath = solutions[(i + 1) % sizeB];

    for (j = 0; j < sizeA; ++j) {
      quad = [
        currentPath[j],
        nextPath[j],
        nextPath[(j + 1) % sizeA],
        currentPath[(j + 1) % sizeA]
      ];

      if (orientation(quad)) {
        quad.reverse();
      }
      quads.push(quad);
    }
  }
  const clipper: Clipper = new Clipper();

  clipper.AddPaths(quads, PolyType.ptSubject, true);
  clipper.Execute(
    ClipType.ctUnion,
    solutions,
    PolyFillType.pftNonZero,
    PolyFillType.pftNonZero
  );

  const solutionCount: number = solutions.length;

  for (i = 0; i < solutionCount; ++i) {
    n = toNestCoordinates(solutions.at(i), scale);
    sArea = polygonArea(n);

    if (Number.isNaN(largestArea) || largestArea > sArea) {
      clipperNfp = n;
      largestArea = sArea;
    }
  }

  for (i = 0; i < clipperNfp.length; ++i) {
    clipperNfp.at(i).x += b.at(0).x;
    clipperNfp.at(i).y += b.at(0).y;
  }

  return [clipperNfp];
}

export default async function pairData(
  pair: NfpPair,
  env: PairWorkerData
): Promise<PairDataResult> {
  if (!pair) {
    return null;
  }

  const bin: typeof __AdaptedExports = await instantiate(env.asm);
  const errors: any[][] = [];

  const searchEdges = env.searchEdges;
  const useHoles = env.useHoles;

  const nfpData = keyToNFPData(pair.numKey, env.rotations);

  let a = rotatePolygon(pair.A, nfpData.at(2));
  let b = rotatePolygon(pair.B, nfpData.at(3));
  let nfp: IPolygon[];
  let i = 0;

  if (nfpData.at(4) === 1) {
    nfp = importPolygons(
      bin.isRectangle(exportPolygon(a))
        ? bin.tmpNoFitPolygonRectangle(exportPolygon(a), exportPolygon(b))
        : bin.tmpNoFitPolygon(
            exportPolygon(a),
            exportPolygon(b),
            true,
            searchEdges
          )
    );
    // ensure all interior NFPs have the same winding direction
    if (nfp.length > 0) {
      for (i = 0; i < nfp.length; ++i) {
        if (polygonArea(nfp.at(i)) > 0) {
          nfp.at(i).reverse();
        }
      }
    } else {
      // warning on null inner NFP
      // this is not an error, as the part may simply be larger than the bin or otherwise unplaceable due to geometry
      errors.push(["NFP Warning: ", nfpData]);
    }
  } else {
    nfp = searchEdges
      ? importPolygons(
          bin.tmpNoFitPolygon(
            exportPolygon(a),
            exportPolygon(b),
            false,
            searchEdges
          )
        )
      : minkowskiDifference(a, b);
    // sanity check
    if (nfp.length == 0) {
      errors.push(["NFP Error: ", nfpData]);
      errors.push(["A: ", JSON.stringify(a)]);
      errors.push(["B: ", JSON.stringify(b)]);
      return null;
    }

    for (i = 0; i < nfp.length; ++i) {
      if (!searchEdges || i == 0) {
        // if searchedges is active, only the first NFP is guaranteed to pass sanity check
        if (Math.abs(polygonArea(nfp.at(i))) < Math.abs(polygonArea(a))) {
          errors.push([
            "NFP Area Error: ",
            Math.abs(polygonArea(nfp.at(i))),
            nfpData
          ]);
          errors.push(["NFP:", JSON.stringify(nfp.at(i))]);
          errors.push(["A: ", JSON.stringify(a)]);
          errors.push(["B: ", JSON.stringify(b)]);
          nfp.splice(i, 1);
          return null;
        }
      }
    }

    if (nfp.length === 0) {
      console.log("THERE");
      return null;
    }

    // for outer NFPs, the first is guaranteed to be the largest. Any subsequent NFPs that lie inside the first are holes
    for (i = 0; i < nfp.length; ++i) {
      if (polygonArea(nfp.at(i)) > 0) {
        nfp.at(i).reverse();
      }

      if (
        i > 0 &&
        pointInPolygon(Point.from(nfp.at(i).at(0)), nfp.at(0)) > 0 &&
        polygonArea(nfp.at(i)) < 0
      ) {
        nfp.at(i).reverse();
      }
    }

    // generate nfps for children (holes of parts) if any exist
    if (useHoles && a.children && a.children.length > 0) {
      const boundsB: Rect = getPolygonBounds(b);
      let boundsA: Rect;
      let cnfp: IPolygon[];
      let j = 0;

      for (i = 0; i < a.children.length; ++i) {
        boundsA = getPolygonBounds(a.children.at(i));

        // no need to find nfp if B's bounding box is too big
        if (boundsA.width > boundsB.width && boundsA.height > boundsB.height) {
          cnfp = importPolygons(
            bin.tmpNoFitPolygon(
              exportPolygon(a.children.at(i)),
              exportPolygon(b),
              true,
              searchEdges
            )
          );
          // ensure all interior NFPs have the same winding direction
          if (cnfp && cnfp.length > 0) {
            for (j = 0; j < cnfp.length; ++j) {
              if (polygonArea(cnfp.at(j)) < 0) {
                cnfp.at(j).reverse();
              }
              nfp.push(cnfp.at(j));
            }
          }
        }
      }
    }
  }

  const errorsCount: number = errors.length;

  if (errorsCount !== 0 && env.debug) {
    let i: number = 0;

    for (i = 0; i < errorsCount; ++i) {
      console.log(...errors[i]);
    }
  }

  return Promise.resolve({ value: nfp, numKey: pair.numKey });
}
