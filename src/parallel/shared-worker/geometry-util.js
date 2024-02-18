/*!
 * General purpose geometry functions for polygon/Bezier calculations
 * Copyright 2015 Jack Qiao
 * Licensed under the MIT license
 */

import { almostEqual } from "../../util";
import { polygonSlideDistance, searchStartPoint } from "./util";

// private shared variables/methods

// floating point comparison tolerance
var TOL = Math.pow(10, -9); // Floating point error is likely to be above 1 epsilon

// returns true if p lies on the line segment defined by AB, but not at any endpoints
// may need work!
function _onSegment(A, B, p) {
  // vertical line
  if (almostEqual(A.x, B.x) && almostEqual(p.x, A.x)) {
    if (
      !almostEqual(p.y, B.y) &&
      !almostEqual(p.y, A.y) &&
      p.y < Math.max(B.y, A.y) &&
      p.y > Math.min(B.y, A.y)
    ) {
      return true;
    } else {
      return false;
    }
  }

  // horizontal line
  if (almostEqual(A.y, B.y) && almostEqual(p.y, A.y)) {
    if (
      !almostEqual(p.x, B.x) &&
      !almostEqual(p.x, A.x) &&
      p.x < Math.max(B.x, A.x) &&
      p.x > Math.min(B.x, A.x)
    ) {
      return true;
    } else {
      return false;
    }
  }

  //range check
  if (
    (p.x < A.x && p.x < B.x) ||
    (p.x > A.x && p.x > B.x) ||
    (p.y < A.y && p.y < B.y) ||
    (p.y > A.y && p.y > B.y)
  ) {
    return false;
  }

  // exclude end points
  if (
    (almostEqual(p.x, A.x) && almostEqual(p.y, A.y)) ||
    (almostEqual(p.x, B.x) && almostEqual(p.y, B.y))
  ) {
    return false;
  }

  var cross = (p.y - A.y) * (B.x - A.x) - (p.x - A.x) * (B.y - A.y);

  if (Math.abs(cross) > TOL) {
    return false;
  }

  var dot = (p.x - A.x) * (B.x - A.x) + (p.y - A.y) * (B.y - A.y);

  if (dot < 0 || almostEqual(dot, 0)) {
    return false;
  }

  var len2 = (B.x - A.x) * (B.x - A.x) + (B.y - A.y) * (B.y - A.y);

  if (dot > len2 || almostEqual(dot, len2)) {
    return false;
  }

  return true;
}

// returns an interior NFP for the special case where A is a rectangle
export function noFitPolygonRectangle(A, B) {
  var minAx = A[0].x;
  var minAy = A[0].y;
  var maxAx = A[0].x;
  var maxAy = A[0].y;

  for (var i = 1; i < A.length; i++) {
    if (A[i].x < minAx) {
      minAx = A[i].x;
    }
    if (A[i].y < minAy) {
      minAy = A[i].y;
    }
    if (A[i].x > maxAx) {
      maxAx = A[i].x;
    }
    if (A[i].y > maxAy) {
      maxAy = A[i].y;
    }
  }

  var minBx = B[0].x;
  var minBy = B[0].y;
  var maxBx = B[0].x;
  var maxBy = B[0].y;
  for (i = 1; i < B.length; i++) {
    if (B[i].x < minBx) {
      minBx = B[i].x;
    }
    if (B[i].y < minBy) {
      minBy = B[i].y;
    }
    if (B[i].x > maxBx) {
      maxBx = B[i].x;
    }
    if (B[i].y > maxBy) {
      maxBy = B[i].y;
    }
  }

  if (maxBx - minBx > maxAx - minAx) {
    return null;
  }
  if (maxBy - minBy > maxAy - minAy) {
    return null;
  }

  return [
    [
      { x: minAx - minBx + B[0].x, y: minAy - minBy + B[0].y },
      { x: maxAx - maxBx + B[0].x, y: minAy - minBy + B[0].y },
      { x: maxAx - maxBx + B[0].x, y: maxAy - maxBy + B[0].y },
      { x: minAx - minBx + B[0].x, y: maxAy - maxBy + B[0].y }
    ]
  ];
}

// given a static polygon A and a movable polygon B, compute a no fit polygon by orbiting B about A
// if the inside flag is set, B is orbited inside of A rather than outside
// if the searchEdges flag is set, all edges of A are explored for NFPs - multiple
export function noFitPolygon(A, B, inside, searchEdges) {
  if (!A || A.length < 3 || !B || B.length < 3) {
    return null;
  }

  A.offsetx = 0;
  A.offsety = 0;

  var i, j;

  var minA = A[0].y;
  var minAindex = 0;

  var maxB = B[0].y;
  var maxBindex = 0;

  for (i = 1; i < A.length; i++) {
    A[i].marked = false;
    if (A[i].y < minA) {
      minA = A[i].y;
      minAindex = i;
    }
  }

  for (i = 1; i < B.length; i++) {
    B[i].marked = false;
    if (B[i].y > maxB) {
      maxB = B[i].y;
      maxBindex = i;
    }
  }

  if (!inside) {
    // shift B such that the bottom-most point of B is at the top-most point of A. This guarantees an initial placement with no intersections
    var startpoint = {
      x: A[minAindex].x - B[maxBindex].x,
      y: A[minAindex].y - B[maxBindex].y
    };
  } else {
    // no reliable heuristic for inside
    var startpoint = searchStartPoint(A, B, true);
  }

  var NFPlist = [];

  while (startpoint !== null) {
    B.offsetx = startpoint.x;
    B.offsety = startpoint.y;

    // maintain a list of touching points/edges
    var touching;

    var prevvector = null; // keep track of previous vector
    var NFP = [
      {
        x: B[0].x + B.offsetx,
        y: B[0].y + B.offsety
      }
    ];

    var referencex = B[0].x + B.offsetx;
    var referencey = B[0].y + B.offsety;
    var startx = referencex;
    var starty = referencey;
    var counter = 0;

    while (counter < 10 * (A.length + B.length)) {
      // sanity check, prevent infinite loop
      touching = [];
      // find touching vertices/edges
      for (i = 0; i < A.length; i++) {
        var nexti = i == A.length - 1 ? 0 : i + 1;
        for (j = 0; j < B.length; j++) {
          var nextj = j == B.length - 1 ? 0 : j + 1;
          if (
            almostEqual(A[i].x, B[j].x + B.offsetx) &&
            almostEqual(A[i].y, B[j].y + B.offsety)
          ) {
            touching.push({ type: 0, A: i, B: j });
          } else if (
            _onSegment(A[i], A[nexti], {
              x: B[j].x + B.offsetx,
              y: B[j].y + B.offsety
            })
          ) {
            touching.push({ type: 1, A: nexti, B: j });
          } else if (
            _onSegment(
              { x: B[j].x + B.offsetx, y: B[j].y + B.offsety },
              { x: B[nextj].x + B.offsetx, y: B[nextj].y + B.offsety },
              A[i]
            )
          ) {
            touching.push({ type: 2, A: i, B: nextj });
          }
        }
      }

      // generate translation vectors from touching vertices/edges
      var vectors = [];
      for (i = 0; i < touching.length; i++) {
        var vertexA = A[touching[i].A];
        vertexA.marked = true;

        // adjacent A vertices
        var prevAindex = touching[i].A - 1;
        var nextAindex = touching[i].A + 1;

        prevAindex = prevAindex < 0 ? A.length - 1 : prevAindex; // loop
        nextAindex = nextAindex >= A.length ? 0 : nextAindex; // loop

        var prevA = A[prevAindex];
        var nextA = A[nextAindex];

        // adjacent B vertices
        var vertexB = B[touching[i].B];

        var prevBindex = touching[i].B - 1;
        var nextBindex = touching[i].B + 1;

        prevBindex = prevBindex < 0 ? B.length - 1 : prevBindex; // loop
        nextBindex = nextBindex >= B.length ? 0 : nextBindex; // loop

        var prevB = B[prevBindex];
        var nextB = B[nextBindex];

        if (touching[i].type == 0) {
          var vA1 = {
            x: prevA.x - vertexA.x,
            y: prevA.y - vertexA.y,
            start: vertexA,
            end: prevA
          };

          var vA2 = {
            x: nextA.x - vertexA.x,
            y: nextA.y - vertexA.y,
            start: vertexA,
            end: nextA
          };

          // B vectors need to be inverted
          var vB1 = {
            x: vertexB.x - prevB.x,
            y: vertexB.y - prevB.y,
            start: prevB,
            end: vertexB
          };

          var vB2 = {
            x: vertexB.x - nextB.x,
            y: vertexB.y - nextB.y,
            start: nextB,
            end: vertexB
          };

          vectors.push(vA1);
          vectors.push(vA2);
          vectors.push(vB1);
          vectors.push(vB2);
        } else if (touching[i].type == 1) {
          vectors.push({
            x: vertexA.x - (vertexB.x + B.offsetx),
            y: vertexA.y - (vertexB.y + B.offsety),
            start: prevA,
            end: vertexA
          });

          vectors.push({
            x: prevA.x - (vertexB.x + B.offsetx),
            y: prevA.y - (vertexB.y + B.offsety),
            start: vertexA,
            end: prevA
          });
        } else if (touching[i].type == 2) {
          vectors.push({
            x: vertexA.x - (vertexB.x + B.offsetx),
            y: vertexA.y - (vertexB.y + B.offsety),
            start: prevB,
            end: vertexB
          });

          vectors.push({
            x: vertexA.x - (prevB.x + B.offsetx),
            y: vertexA.y - (prevB.y + B.offsety),
            start: vertexB,
            end: prevB
          });
        }
      }

      // todo: there should be a faster way to reject vectors that will cause immediate intersection. For now just check them all

      var translate = null;
      var maxd = 0;

      for (i = 0; i < vectors.length; i++) {
        if (vectors[i].x == 0 && vectors[i].y == 0) {
          continue;
        }

        // if this vector points us back to where we came from, ignore it.
        // ie cross product = 0, dot product < 0
        if (
          prevvector &&
          vectors[i].y * prevvector.y + vectors[i].x * prevvector.x < 0
        ) {
          // compare magnitude with unit vectors
          var vectorlength = Math.sqrt(
            vectors[i].x * vectors[i].x + vectors[i].y * vectors[i].y
          );
          var unitv = {
            x: vectors[i].x / vectorlength,
            y: vectors[i].y / vectorlength
          };

          var prevlength = Math.sqrt(
            prevvector.x * prevvector.x + prevvector.y * prevvector.y
          );
          var prevunit = {
            x: prevvector.x / prevlength,
            y: prevvector.y / prevlength
          };

          // we need to scale down to unit vectors to normalize vector length. Could also just do a tan here
          if (Math.abs(unitv.y * prevunit.x - unitv.x * prevunit.y) < 0.0001) {
            continue;
          }
        }

        var d = polygonSlideDistance(A, B, vectors[i], true);
        var vecd2 = vectors[i].x * vectors[i].x + vectors[i].y * vectors[i].y;

        if (d === null || d * d > vecd2) {
          var vecd = Math.sqrt(
            vectors[i].x * vectors[i].x + vectors[i].y * vectors[i].y
          );
          d = vecd;
        }

        if (d !== null && d > maxd) {
          maxd = d;
          translate = vectors[i];
        }
      }

      if (translate === null || almostEqual(maxd, 0)) {
        // didn't close the loop, something went wrong here
        NFP = null;
        break;
      }

      translate.start.marked = true;
      translate.end.marked = true;

      prevvector = translate;

      // trim
      var vlength2 = translate.x * translate.x + translate.y * translate.y;
      if (maxd * maxd < vlength2 && !almostEqual(maxd * maxd, vlength2)) {
        var scale = Math.sqrt((maxd * maxd) / vlength2);
        translate.x *= scale;
        translate.y *= scale;
      }

      referencex += translate.x;
      referencey += translate.y;

      if (almostEqual(referencex, startx) && almostEqual(referencey, starty)) {
        // we've made a full loop
        break;
      }

      // if A and B start on a touching horizontal line, the end point may not be the start point
      var looped = false;
      if (NFP.length > 0) {
        for (i = 0; i < NFP.length - 1; i++) {
          if (
            almostEqual(referencex, NFP[i].x) &&
            almostEqual(referencey, NFP[i].y)
          ) {
            looped = true;
          }
        }
      }

      if (looped) {
        // we've made a full loop
        break;
      }

      NFP.push({
        x: referencex,
        y: referencey
      });

      B.offsetx += translate.x;
      B.offsety += translate.y;

      counter++;
    }

    if (NFP && NFP.length > 0) {
      NFPlist.push(NFP);
    }

    if (!searchEdges) {
      // only get outer NFP or first inner NFP
      break;
    }

    startpoint = searchStartPoint(A, B, inside, NFPlist);
  }

  return NFPlist;
}
