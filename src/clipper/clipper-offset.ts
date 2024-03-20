import { ClipType, EndType, JoinType, PolyType, PolyFillType } from "./enums";
import Clipper from "./clipper";
import PolyNode from "./poly-node";
import IntRect from "./int-rect";
import { almostEqual, clipperRound } from "../util";
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

  public addPath(path: Point[], joinType: JoinType, endType: EndType) {
    var lastIndex: number = path.length - 1;

    if (lastIndex < 0) {
      return;
    }

    const node: PolyNode = new PolyNode(joinType, endType);

    if (endType == EndType.ClosedLine || endType == EndType.ClosedPolygon) {
      while (lastIndex > 0 && path[0].equal(path[lastIndex])) {
        --lastIndex;
      }
    }

    node.add(path[0]);

    let i: number = 0;
    let j: number = 0;
    let k: number = 0;
    let point: Point;

    for (i = 1; i <= lastIndex; ++i) {
      point = path.at(i);

      if (!node.at(j).equal(point)) {
        ++j;
        node.add(point);

        if (
          point.y > node.at(k).y ||
          (point.y == node.at(k).y && point.x < node.at(k).x)
        )
          k = j;
      }
    }

    if (
      (endType === EndType.ClosedPolygon && j < 2) ||
      (endType !== EndType.ClosedPolygon && j < 0)
    ) {
      return;
    }

    this._polyNodes.addChild(node);

    if (endType != EndType.ClosedPolygon) {
      return;
    }

    if (this._lowest.x < 0) {
      this._lowest.update(0, k);
    } else {
      point = this._polyNodes.childAt(this._lowest.x).at(this._lowest.y);

      if (
        node.at(k).y > point.y ||
        (node.at(k).y == point.y && node.at(k).x < point.x)
      )
        this._lowest.update(this._polyNodes.childCount - 1, k);
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
          const point = Point.fromCords(1, 0);
          for (var j = 1; j <= steps; ++j) {
            this._insert(point, 0, delta);
            point.skew(this._sin, this._cos);
          }
        } else {
          const point = Point.fromCords(-1, -1);
          for (var j = 0; j < 4; ++j) {
            this._insert(point, 0, delta);

            if (point.x < 0) {
              point.x = 1;
            } else if (point.y < 0) {
              point.y = 1;
            } else {
              point.x = -1;
            }
          }
        }
        this._destPolys.push(this._destPoly);
        continue;
      }
      //build m_normals ...
      this._normals.length = 0;
      //this.m_normals.set_Capacity(len);
      for (var j = 0; j < len - 1; ++j) {
        this._normals.push(
          ClipperOffset.GetUnitNormal(this._srcPoly[j], this._srcPoly[j + 1])
        );
      }

      if (
        node.endType == EndType.ClosedLine ||
        node.endType == EndType.ClosedPolygon
      )
        this._normals.push(
          ClipperOffset.GetUnitNormal(this._srcPoly[len - 1], this._srcPoly[0])
        );
      else this._normals.push(Point.from(this._normals[len - 2]));
      if (node.endType == EndType.ClosedPolygon) {
        var k = len - 1;
        for (var j = 0; j < len; ++j) {
          k = this._offsetPoint(j, k, node.joinType);
        }
        this._destPolys.push(this._destPoly);
      } else if (node.endType == EndType.ClosedLine) {
        var k = len - 1;
        for (var j = 0; j < len; ++j) {
          k = this._offsetPoint(j, k, node.joinType);
        }
        this._destPolys.push(this._destPoly);
        this._destPoly = new Array();
        //re-build m_normals ...
        var n = this._normals[len - 1];
        for (var j = len - 1; j > 0; --j) {
          this._normals[j] = Point.reverse(this._normals.at(j - 1));
        }
        this._normals[0] = Point.reverse(n);
        k = 0;
        for (var j = len - 1; j >= 0; --j) {
          k = this._offsetPoint(j, k, node.joinType);
        }
        this._destPolys.push(this._destPoly);
      } else {
        var k = 0;
        for (var j = 1; j < len - 1; ++j) {
          k = this._offsetPoint(j, k, node.joinType);
        }

        if (node.endType == EndType.OpenButt) {
          var j = len - 1;
          this._insertFromNormal(j, j, delta);
          this._insertFromNormal(j, j, -delta);
        } else {
          var j = len - 1;
          k = len - 2;
          this._sinA = 0;
          this._normals[j] = Point.reverse(this._normals.at(j));

          this._offsetWithType(node.endType, j, k);
        }
        //re-build m_normals ...
        for (var j = len - 1; j > 0; --j) {
          this._normals[j] = Point.reverse(this._normals.at(j - 1));
        }

        this._normals[0] = Point.reverse(this._normals.at(1));
        k = len - 1;

        for (var j = k - 1; j > 0; --j) {
          k = this._offsetPoint(j, k, node.joinType);
        }

        if (node.endType == EndType.OpenButt) {
          this._insertFromNormal(0, 0, -delta);
          this._insertFromNormal(0, 0, delta);
        } else {
          k = 1;
          this._sinA = 0;

          this._offsetWithType(node.endType, 0, 1);
        }
        this._destPolys.push(this._destPoly);
      }
    }
  }

  private _offsetWithType(type: EndType, j: number, k: number): void {
    if (type == EndType.OpenSquare) {
      this._doSquare(j, k);
    } else {
      this._doRound(j, k);
    }
  }

  private _offsetPoint(j: number, k: number, jointype: number) {
    this._sinA = this._normals.at(j).cross(this._normals.at(k));

    if (this._sinA < 0.00005 && this._sinA > -0.00005) {
      return k;
    } else if (this._sinA > 1) {
      this._sinA = 1.0;
    } else if (this._sinA < -1) {
      this._sinA = -1.0;
    }

    if (this._sinA * this._delta < 0) {
      this._insertFromNormal(k, j, this._delta);
      this._destPoly.push(Point.from(this._srcPoly.at(j)));
      this._insertFromNormal(j, j, this._delta);
    } else
      switch (jointype) {
        case JoinType.Miter: {
          var r = 1 + this._normals.at(k).dot(this._normals.at(j));
          if (r >= this._miterLim) {
            this._doMiter(j, k, r);
          } else {
            this._doSquare(j, k);
          }
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

  private _doSquare(j: number, k: number): void {
    const dx: number = Math.tan(
      Math.atan2(this._sinA, this._normals.at(k).dot(this._normals.at(j))) / 4
    );

    this._insert(
      Point.normal(this._normals.at(k)).scale(-dx).add(this._normals.at(k)),
      j,
      this._delta
    );

    this._insert(
      Point.normal(this._normals.at(j)).scale(dx).add(this._normals.at(j)),
      j,
      this._delta
    );
  }

  private _doRound(j: number, k: number): void {
    const a: number = Math.atan2(
      this._sinA,
      this._normals.at(k).dot(this._normals.at(j))
    );
    const steps = ClipperOffset.castInt32(this._stepsPerRad * Math.abs(a));
    const point: Point = Point.from(this._normals.at(k));
    let i: number = 0;

    for (i = 0; i < steps; ++i) {
      this._insert(point, j, this._delta);
      point.skew(this._sin, this._cos);
    }

    this._insertFromNormal(j, j, this._delta);
  }

  private _doMiter(j: number, k: number, r: number): void {
    this._insert(
      Point.from(this._normals.at(k)).add(this._normals.at(j)),
      this._delta / r,
      j
    );
  }

  private _insertFromNormal(
    normalIndex: number,
    polyIndex: number,
    scale: number
  ): void {
    this._insert(this._normals.at(normalIndex), polyIndex, scale);
  }

  private _insert(point: Point, polyIndex: number, scale: number): void {
    this._destPoly.push(
      Point.from(point)
        .scale(scale)
        .add(this._srcPoly.at(polyIndex))
        .clipperRound()
    );
  }

  public static GetUnitNormal(pt1: Point, pt2: Point): Point {
    const d: Point = Point.sub(pt1, pt2);

    return d.isEmpty ? d : d.normalize().normal();
  }

  public static castInt32(a: number): number {
    return ~~clipperRound(a);
  }

  static two_pi: number = Math.PI * 2;
  static def_arc_tolerance: number = 0.25;
}
