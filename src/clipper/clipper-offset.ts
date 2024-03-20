import { ClipType, EndType, JoinType, PolyType, PolyFillType } from "./enums";
import Clipper from "./clipper";
import PolyNode from "./poly-node";
import IntRect from "./int-rect";
import { almostEqual } from "../util";
import { Point } from "../geom";

export default class ClipperOffset {
  private _destPolys: Point[][] = [];
  private _srcPoly: Point[] = [];
  private _destPoly: Point[] = [];
  private _normals: Point[] = [];
  private _delta: number = 0;
  private _sinA: number = 0;
  private _sin: number = 0;
  private _cos: number = 0;
  private _miterLim: number = 0;
  private _stepsPerRad: number = 0;
  private _lowest = Point.empty();
  private _polyNodes: PolyNode = new PolyNode();
  private _miterLimit: number = 0;
  private _arcTolerance: number = 0;

  constructor(
    miterLimit: number = ClipperOffset.def_arc_tolerance,
    arcTolerance: number = 2
  ) {
    this._lowest.x = -1;
    this._miterLimit = miterLimit;
    this._arcTolerance = arcTolerance;
  }

  public AddPath(path: Point[], joinType: JoinType, endType: EndType) {
    var highI = path.length - 1;
    if (highI < 0) return;
    var newNode = new PolyNode(joinType, endType);
    //strip duplicate points from path and also get index to the lowest point ...
    if (endType == EndType.ClosedLine || endType == EndType.ClosedPolygon)
      while (highI > 0 && path[0].equal(path[highI])) highI--;
    //newNode.m_polygon.set_Capacity(highI + 1);
    newNode.add(path[0]);
    var j = 0,
      k = 0;
    for (var i = 1; i <= highI; i++)
      if (!newNode.at(j).equal(path[i])) {
        j++;
        newNode.add(path[i]);
        if (
          path[i].y > newNode.at(k).y ||
          (path[i].y == newNode.at(k).y && path[i].x < newNode.at(k).x)
        )
          k = j;
      }
    if (
      (endType == EndType.ClosedPolygon && j < 2) ||
      (endType != EndType.ClosedPolygon && j < 0)
    )
      return;
    this._polyNodes.addChild(newNode);
    //if this path's lowest pt is lower than all the others then update m_lowest
    if (endType != EndType.ClosedPolygon) return;
    if (this._lowest.x < 0) this._lowest = Point.fromCords(0, k);
    else {
      const ip: Point = this._polyNodes
        .childAt(this._lowest.x)
        .at(this._lowest.y);
      if (
        newNode.at(k).y > ip.y ||
        (newNode.at(k).y == ip.y && newNode.at(k).x < ip.x)
      )
        this._lowest = Point.fromCords(this._polyNodes.childCount - 1, k);
    }
  }

  public execute(solution: Point[][], delta: number) {
    // function (solution, delta)
    solution.length = 0;
    this._fixOrientations();
    this._doOffset(delta);
    //now clean up 'corners' ...
    const clipper: Clipper = new Clipper(false, delta <= 0);
    clipper.addPaths(this._destPolys, PolyType.Subject, true);

    if (delta > 0) {
      clipper.execute(
        ClipType.Union,
        solution,
        PolyFillType.Positive,
        PolyFillType.Positive
      );
    } else {
      const rect: IntRect = IntRect.fromPaths(this._destPolys);
      const outer: Point[] = [
        Point.fromCords(rect.left - 10, rect.bottom + 10),
        Point.fromCords(rect.right + 10, rect.bottom + 10),
        Point.fromCords(rect.right + 10, rect.top - 10),
        Point.fromCords(rect.left - 10, rect.top - 10)
      ];

      clipper.addPath(outer, PolyType.Subject, true);
      clipper.execute(
        ClipType.Union,
        solution,
        PolyFillType.Negative,
        PolyFillType.Negative
      );
      if (solution.length > 0) {
        solution.splice(0, 1);
      }
    }
    //console.log(JSON.stringify(solution));
    // function (polytree, delta)
  }

  //fixup orientations of all closed paths if the orientation of the
  //closed path with the lowermost vertex is wrong ...
  private _fixOrientations(): void {
    const childCount: number = this._polyNodes.childCount;
    let i: number = 0;
    let node: PolyNode;

    if (
      this._lowest.x >= 0 &&
      !this._polyNodes.childAt(this._lowest.x).orientation
    ) {
      for (i = 0; i < childCount; ++i) {
        node = this._polyNodes.childAt(i);
        if (
          node.endType == EndType.ClosedPolygon ||
          (node.endType == EndType.ClosedLine && node.orientation)
        )
          node.reverse();
      }
    } else {
      for (i = 0; i < childCount; ++i) {
        node = this._polyNodes.childAt(i);
        if (node.endType == EndType.ClosedLine && !node.orientation)
          node.reverse();
      }
    }
  }

  public static GetUnitNormal(pt1: Point, pt2: Point): Point {
    const d: Point = Point.sub(pt1, pt2);

    if (d.isEmpty) {
      return d;
    }

    const f = 1 / Math.sqrt(d.x * d.x + d.y * d.y);

    d.x *= f;
    d.y *= f;
    return Point.fromCords(d.y, -d.x);
  }

  private _doOffset(delta: number) {
    this._destPolys = new Array();
    this._delta = delta;
    //if Zero offset, just copy any CLOSED polygons to m_p and return ...
    if (almostEqual(delta)) {
      //this.m_destPolys.set_Capacity(this.m_polyNodes.ChildCount);
      for (var i = 0; i < this._polyNodes.childCount; i++) {
        var node = this._polyNodes.childAt(i);
        if (node.endType == EndType.ClosedPolygon)
          this._destPolys.push(node.polygon);
      }
      return;
    }
    //see offset_triginometry3.svg in the documentation folder ...
    if (this._miterLimit > 2)
      this._miterLim = 2 / (this._miterLimit * this._miterLimit);
    else this._miterLim = 0.5;
    var y;
    if (this._arcTolerance <= 0) y = ClipperOffset.def_arc_tolerance;
    else if (
      this._arcTolerance >
      Math.abs(delta) * ClipperOffset.def_arc_tolerance
    )
      y = Math.abs(delta) * ClipperOffset.def_arc_tolerance;
    else y = this._arcTolerance;
    //see offset_triginometry2.svg in the documentation folder ...
    var steps = 3.14159265358979 / Math.acos(1 - y / Math.abs(delta));
    this._sin = Math.sin(ClipperOffset.two_pi / steps);
    this._cos = Math.cos(ClipperOffset.two_pi / steps);
    this._stepsPerRad = steps / ClipperOffset.two_pi;
    if (delta < 0) this._sin = -this._sin;
    //this.m_destPolys.set_Capacity(this.m_polyNodes.ChildCount * 2);
    for (var i = 0; i < this._polyNodes.childCount; i++) {
      var node = this._polyNodes.childAt(i);
      this._srcPoly = node.polygon;
      var len = this._srcPoly.length;
      if (
        len == 0 ||
        (delta <= 0 && (len < 3 || node.endType != EndType.ClosedPolygon))
      )
        continue;
      this._destPoly = new Array();
      if (len == 1) {
        if (node.joinType == JoinType.Round) {
          var X = 1,
            Y = 0;
          for (var j = 1; j <= steps; j++) {
            this._destPoly.push(
              Point.fromCords(
                ClipperOffset.Round(this._srcPoly[0].x + X * delta),
                ClipperOffset.Round(this._srcPoly[0].y + Y * delta)
              )
            );
            var X2 = X;
            X = X * this._cos - this._sin * Y;
            Y = X2 * this._sin + Y * this._cos;
          }
        } else {
          var X = -1,
            Y = -1;
          for (var j = 0; j < 4; ++j) {
            this._destPoly.push(
              Point.fromCords(
                ClipperOffset.Round(this._srcPoly[0].x + X * delta),
                ClipperOffset.Round(this._srcPoly[0].y + Y * delta)
              )
            );
            if (X < 0) X = 1;
            else if (Y < 0) Y = 1;
            else X = -1;
          }
        }
        this._destPolys.push(this._destPoly);
        continue;
      }
      //build m_normals ...
      this._normals.length = 0;
      //this.m_normals.set_Capacity(len);
      for (var j = 0; j < len - 1; j++)
        this._normals.push(
          ClipperOffset.GetUnitNormal(this._srcPoly[j], this._srcPoly[j + 1])
        );
      if (
        node.endType == EndType.ClosedLine ||
        node.endType == EndType.ClosedPolygon
      )
        this._normals.push(
          ClipperOffset.GetUnitNormal(this._srcPoly[len - 1], this._srcPoly[0])
        );
      else
        this._normals.push(
          Point.fromCords(this._normals[len - 2].x, this._normals[len - 2].y)
        );
      if (node.endType == EndType.ClosedPolygon) {
        var k = len - 1;
        for (var j = 0; j < len; j++)
          k = this._offsetPoint(j, k, node.joinType);
        this._destPolys.push(this._destPoly);
      } else if (node.endType == EndType.ClosedLine) {
        var k = len - 1;
        for (var j = 0; j < len; j++)
          k = this._offsetPoint(j, k, node.joinType);
        this._destPolys.push(this._destPoly);
        this._destPoly = new Array();
        //re-build m_normals ...
        var n = this._normals[len - 1];
        for (var j = len - 1; j > 0; j--)
          this._normals[j] = Point.fromCords(
            -this._normals[j - 1].x,
            -this._normals[j - 1].y
          );
        this._normals[0] = Point.fromCords(-n.x, -n.y);
        k = 0;
        for (var j = len - 1; j >= 0; j--)
          k = this._offsetPoint(j, k, node.joinType);
        this._destPolys.push(this._destPoly);
      } else {
        var k = 0;
        for (var j = 1; j < len - 1; ++j)
          k = this._offsetPoint(j, k, node.joinType);
        var pt1;
        if (node.endType == EndType.OpenButt) {
          var j = len - 1;
          pt1 = Point.fromCords(
            ClipperOffset.Round(
              this._srcPoly[j].x + this._normals[j].x * delta
            ),
            ClipperOffset.Round(this._srcPoly[j].y + this._normals[j].y * delta)
          );
          this._destPoly.push(pt1);
          pt1 = Point.fromCords(
            ClipperOffset.Round(
              this._srcPoly[j].x - this._normals[j].x * delta
            ),
            ClipperOffset.Round(this._srcPoly[j].y - this._normals[j].y * delta)
          );
          this._destPoly.push(pt1);
        } else {
          var j = len - 1;
          k = len - 2;
          this._sinA = 0;
          this._normals[j] = Point.fromCords(
            -this._normals[j].x,
            -this._normals[j].y
          );
          if (node.endType == EndType.OpenSquare) this._doSquare(j, k);
          else this._doRound(j, k);
        }
        //re-build m_normals ...
        for (var j = len - 1; j > 0; j--)
          this._normals[j] = Point.fromCords(
            -this._normals[j - 1].x,
            -this._normals[j - 1].y
          );
        this._normals[0] = Point.fromCords(
          -this._normals[1].x,
          -this._normals[1].y
        );
        k = len - 1;
        for (var j = k - 1; j > 0; --j)
          k = this._offsetPoint(j, k, node.joinType);
        if (node.endType == EndType.OpenButt) {
          pt1 = Point.fromCords(
            ClipperOffset.Round(
              this._srcPoly[0].x - this._normals[0].x * delta
            ),
            ClipperOffset.Round(this._srcPoly[0].y - this._normals[0].y * delta)
          );
          this._destPoly.push(pt1);
          pt1 = Point.fromCords(
            ClipperOffset.Round(
              this._srcPoly[0].x + this._normals[0].x * delta
            ),
            ClipperOffset.Round(this._srcPoly[0].y + this._normals[0].y * delta)
          );
          this._destPoly.push(pt1);
        } else {
          k = 1;
          this._sinA = 0;
          if (node.endType == EndType.OpenSquare) this._doSquare(0, 1);
          else this._doRound(0, 1);
        }
        this._destPolys.push(this._destPoly);
      }
    }
  }

  private _offsetPoint(j: number, k: number, jointype: number) {
    this._sinA =
      this._normals[k].x * this._normals[j].y -
      this._normals[j].x * this._normals[k].y;
    if (this._sinA < 0.00005 && this._sinA > -0.00005) return k;
    else if (this._sinA > 1) this._sinA = 1.0;
    else if (this._sinA < -1) this._sinA = -1.0;
    if (this._sinA * this._delta < 0) {
      this._destPoly.push(
        Point.fromCords(
          ClipperOffset.Round(
            this._srcPoly[j].x + this._normals[k].x * this._delta
          ),
          ClipperOffset.Round(
            this._srcPoly[j].y + this._normals[k].y * this._delta
          )
        )
      );
      this._destPoly.push(
        Point.fromCords(this._srcPoly[j].x, this._srcPoly[j].y)
      );
      this._destPoly.push(
        Point.fromCords(
          ClipperOffset.Round(
            this._srcPoly[j].x + this._normals[j].x * this._delta
          ),
          ClipperOffset.Round(
            this._srcPoly[j].y + this._normals[j].y * this._delta
          )
        )
      );
    } else
      switch (jointype) {
        case JoinType.Miter: {
          var r =
            1 +
            (this._normals[j].x * this._normals[k].x +
              this._normals[j].y * this._normals[k].y);
          if (r >= this._miterLim) this._doMiter(j, k, r);
          else this._doSquare(j, k);
          break;
        }
        case JoinType.Square:
          this._doSquare(j, k);
          break;
        case JoinType.Round:
          this._doRound(j, k);
          break;
      }
    k = j;
    return k;
  }

  private _doSquare(j: number, k: number) {
    var dx = Math.tan(
      Math.atan2(
        this._sinA,
        this._normals[k].x * this._normals[j].x +
          this._normals[k].y * this._normals[j].y
      ) / 4
    );
    this._destPoly.push(
      Point.fromCords(
        ClipperOffset.Round(
          this._srcPoly[j].x +
            this._delta * (this._normals[k].x - this._normals[k].y * dx)
        ),
        ClipperOffset.Round(
          this._srcPoly[j].y +
            this._delta * (this._normals[k].y + this._normals[k].x * dx)
        )
      )
    );
    this._destPoly.push(
      Point.fromCords(
        ClipperOffset.Round(
          this._srcPoly[j].x +
            this._delta * (this._normals[j].x + this._normals[j].y * dx)
        ),
        ClipperOffset.Round(
          this._srcPoly[j].y +
            this._delta * (this._normals[j].y - this._normals[j].x * dx)
        )
      )
    );
  }

  private _doRound(j: number, k: number) {
    var a = Math.atan2(
      this._sinA,
      this._normals[k].x * this._normals[j].x +
        this._normals[k].y * this._normals[j].y
    );
    var steps = ClipperOffset.Cast_Int32(
      ClipperOffset.Round(this._stepsPerRad * Math.abs(a))
    );
    var X = this._normals[k].x,
      Y = this._normals[k].y,
      X2;
    for (var i = 0; i < steps; ++i) {
      this._destPoly.push(
        Point.fromCords(
          ClipperOffset.Round(this._srcPoly[j].x + X * this._delta),
          ClipperOffset.Round(this._srcPoly[j].y + Y * this._delta)
        )
      );
      X2 = X;
      X = X * this._cos - this._sin * Y;
      Y = X2 * this._sin + Y * this._cos;
    }
    this._destPoly.push(
      Point.fromCords(
        ClipperOffset.Round(
          this._srcPoly[j].x + this._normals[j].x * this._delta
        ),
        ClipperOffset.Round(
          this._srcPoly[j].y + this._normals[j].y * this._delta
        )
      )
    );
  }

  private _doMiter(j: number, k: number, r: number) {
    var q = this._delta / r;
    this._destPoly.push(
      Point.fromCords(
        ClipperOffset.Round(
          this._srcPoly[j].x + (this._normals[k].x + this._normals[j].x) * q
        ),
        ClipperOffset.Round(
          this._srcPoly[j].y + (this._normals[k].y + this._normals[j].y) * q
        )
      )
    );
  }

  public static Cast_Int32(a: number) {
    // eg. browser.chrome || browser.chromium || browser.firefox
    return ~~a;
  }

  public static Round(a: number) {
    return a < 0 ? -Math.round(Math.abs(a)) : Math.round(a);
  }

  static two_pi: number = Math.PI * 2;
  static def_arc_tolerance: number = 0.25;
}
