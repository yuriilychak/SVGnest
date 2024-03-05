//@ts-ignore
import { Clipper } from "js-clipper";

import {
  polygonArea,
  rotatePolygon,
  toClipperCoordinates,
  toNestCoordinates,
  getPolygonBounds
} from "../../geometry-util";
import { exportPolygon, keyToNFPData } from "../../util";
import {
  IPolygon,
  NfpPair,
  PairDataResult,
  PairWorkerData
} from "../../interfaces";
import { instantiate, __AdaptedExports } from "../../asm";
import { noFitPolygon, pointInPolygon, importPolygons } from "./util";
import Point from "../../point";
import Rect from "../../rect";

self.alert = function (message: string): void {
  console.log(message);
};

function minkowskiDifference(A: IPolygon, B: IPolygon): IPolygon[] {
  const scale: number = 10000000;
  let i: number = 0;
  let clipperNfp;
  let largestArea: number | null = null;
  let n: IPolygon;
  let sArea: number;
  const clippedA = toClipperCoordinates(A, scale);
  const clippedB = toClipperCoordinates(B, -scale);
  const solutions = Clipper.MinkowskiSum(clippedA, clippedB, true);
  const solutionCount: number = solutions.length;

  for (i = 0; i < solutionCount; ++i) {
    n = toNestCoordinates(solutions.at(i), scale);
    sArea = polygonArea(n);

    if (largestArea === null || largestArea > sArea) {
      clipperNfp = n;
      largestArea = sArea;
    }
  }

  for (i = 0; i < clipperNfp.length; ++i) {
    clipperNfp.at(i).x += B.at(0).x;
    clipperNfp.at(i).y += B.at(0).y;
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
    nfp = bin.isRectangle(exportPolygon(a))
      ? importPolygons(
          bin.tmpNoFitPolygonRectangle(exportPolygon(a), exportPolygon(b))
        )
      : (noFitPolygon(a, b, true, searchEdges) as IPolygon[]);
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
      ? (noFitPolygon(a, b, false, searchEdges) as IPolygon[])
      : minkowskiDifference(a, b);
    // sanity check
    if (!nfp || nfp.length == 0) {
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

    if (nfp.length == 0) {
      return null;
    }

    // for outer NFPs, the first is guaranteed to be the largest. Any subsequent NFPs that lie inside the first are holes
    for (i = 0; i < nfp.length; ++i) {
      if (polygonArea(nfp.at(i)) > 0) {
        nfp.at(i).reverse();
      }

      if (
        i > 0 &&
        pointInPolygon(Point.from(nfp.at(i).at(0)), nfp.at(0)) &&
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
          cnfp = noFitPolygon(
            a.children.at(i),
            b,
            true,
            searchEdges
          ) as IPolygon[];
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
