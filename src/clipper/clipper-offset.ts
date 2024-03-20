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
    let lastIndex: number = path.length - 1;

    if (lastIndex < 0) {
      return;
    }

    const node: PolyNode = new PolyNode(joinType, endType);
    const firstPoint: Point = path[0];

    if (endType == EndType.ClosedLine || endType == EndType.ClosedPolygon) {
      while (lastIndex > 0 && firstPoint.equal(path[lastIndex])) {
        --lastIndex;
      }
    }

    node.add(firstPoint);

    let i: number = 0;
    let j: number = 0;
    let k: number = 0;
    let point: Point;
    let currentPoint: Point;

    for (i = 1; i <= lastIndex; ++i) {
      point = path.at(i);

      if (!node.at(j).equal(point)) {
        ++j;
        node.add(point);

        currentPoint = node.at(k);

        if (
          point.y > currentPoint.y ||
          (point.y == currentPoint.y && point.x < currentPoint.x)
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
      currentPoint = node.at(k);

      if (
        currentPoint.y > point.y ||
        (currentPoint.y == point.y && currentPoint.x < point.x)
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
      const outer: Point[] = rect.export(10);

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
  }

  //fixup orientations of all closed paths if the orientation of the
  //closed path with the lowermost vertex is wrong ...
  private _fixOrientations(): void {
    const childCount: number = this._polyNodes.childCount;
    const lowestX: number = this._lowest.x;
    let node: PolyNode;
    let i: number = 0;

    if (lowestX >= 0 && !this._polyNodes.childAt(lowestX).orientation) {
      for (i = 0; i < childCount; ++i) {
        node = this._polyNodes.childAt(i);

        if (
          node.endType == EndType.ClosedPolygon ||
          (node.endType == EndType.ClosedLine && node.orientation)
        ) {
          node.reverse();
        }
      }
    } else {
      for (i = 0; i < childCount; ++i) {
        node = this._polyNodes.childAt(i);

        if (node.endType == EndType.ClosedLine && !node.orientation) {
          node.reverse();
        }
      }
    }
  }

  private _doOffset(delta: number) {
    this._destPolys = [];
    this._delta = delta;

    let i: number = 0;
    let j: number = 0;
    let k: number = 0;
    let node: PolyNode;

    if (almostEqual(delta)) {
      for (i = 0; i < this._polyNodes.childCount; ++i) {
        node = this._polyNodes.childAt(i);

        if (node.endType == EndType.ClosedPolygon) {
          this._destPolys.push(node.polygon);
        }
      }

      return;
    }

    const miterLimit: number = Math.max(this._miterLimit, 2);
    this._miterLim = 2 / (miterLimit * miterLimit);
    let y: number =
      this._arcTolerance <= 0
        ? ClipperOffset.def_arc_tolerance
        : Math.min(
            Math.abs(delta) * ClipperOffset.def_arc_tolerance,
            this._arcTolerance
          );
    //see offset_triginometry2.svg in the documentation folder ...
    const angle: number = Math.acos(1 - y / Math.abs(delta)) * 2;
    const steps: number = (Math.PI * 2) / angle;
    this._sin = Math.sin(angle);
    this._cos = Math.cos(angle);
    this._stepsPerRad = 1 / angle;

    if (delta < 0) {
      this._sin = -this._sin;
    }

    const point: Point = Point.empty();

    for (i = 0; i < this._polyNodes.childCount; ++i) {
      node = this._polyNodes.childAt(i);

      this._srcPoly = node.polygon;
      const len: number = this._srcPoly.length;
      if (
        len == 0 ||
        (delta <= 0 && (len < 3 || node.endType != EndType.ClosedPolygon))
      ) {
        continue;
      }
      this._destPoly = [];

      if (len == 1) {
        if (node.joinType == JoinType.Round) {
          point.update(1, 0);

          for (j = 1; j <= steps; ++j) {
            this._insert(point, 0, delta);
            point.skew(this._sin, this._cos);
          }
        } else {
          point.update(-1, -1);

          for (j = 0; j < 4; ++j) {
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

      this._normals.length = 0;

      for (j = 0; j < len - 1; ++j) {
        this._normals.push(
          ClipperOffset.getUnitNormal(this._srcPoly[j], this._srcPoly[j + 1])
        );
      }

      this._normals.push(
        node.endType == EndType.ClosedLine ||
          node.endType == EndType.ClosedPolygon
          ? ClipperOffset.getUnitNormal(
              this._srcPoly[len - 1],
              this._srcPoly[0]
            )
          : Point.from(this._normals[len - 2])
      );

      if (node.endType == EndType.ClosedPolygon) {
        k = len - 1;

        for (j = 0; j < len; ++j) {
          k = this._offsetPoint(j, k, node.joinType);
        }

        this._destPolys.push(this._destPoly);
      } else if (node.endType == EndType.ClosedLine) {
        k = len - 1;

        for (j = 0; j < len; ++j) {
          k = this._offsetPoint(j, k, node.joinType);
        }

        this._destPolys.push(this._destPoly);
        this._destPoly = new Array();
        //re-build m_normals ...
        const n: Point = this._normals[len - 1];
        for (j = len - 1; j > 0; --j) {
          this._normals[j] = Point.reverse(this._normals.at(j - 1));
        }
        this._normals[0] = Point.reverse(n);
        k = 0;
        for (j = len - 1; j >= 0; --j) {
          k = this._offsetPoint(j, k, node.joinType);
        }
        this._destPolys.push(this._destPoly);
      } else {
        k = 0;

        for (j = 1; j < len - 1; ++j) {
          k = this._offsetPoint(j, k, node.joinType);
        }

        if (node.endType == EndType.OpenButt) {
          j = len - 1;
          this._insertFromNormal(j, j, delta);
          this._insertFromNormal(j, j, -delta);
        } else {
          j = len - 1;
          k = len - 2;
          this._sinA = 0;
          this._normals[j] = Point.reverse(this._normals.at(j));

          this._offsetWithType(node.endType, j, k);
        }

        for (j = len - 1; j > 0; --j) {
          this._normals[j] = Point.reverse(this._normals.at(j - 1));
        }

        this._normals[0] = Point.reverse(this._normals.at(1));
        k = len - 1;

        for (j = k - 1; j > 0; --j) {
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
    this._sinA = Math.max(
      Math.min(this._normals.at(j).cross(this._normals.at(k)), 1),
      -1
    );

    if (almostEqual(this._sinA, 0, 0.00005)) {
      return k;
    }

    if (this._sinA * this._delta < 0) {
      this._insertFromNormal(k, j, this._delta);
      this._destPoly.push(Point.from(this._srcPoly.at(j)));
      this._insertFromNormal(j, j, this._delta);
    } else
      switch (jointype) {
        case JoinType.Miter: {
          const r: number = 1 + this._normals.at(k).dot(this._normals.at(j));

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

    this._insertSquare(k, j, -dx);
    this._insertSquare(j, j, dx);
  }

  private _doRound(j: number, k: number): void {
    const a: number = Math.atan2(
      this._sinA,
      this._normals.at(k).dot(this._normals.at(j))
    );
    const steps: number = ClipperOffset.castInt32(
      this._stepsPerRad * Math.abs(a)
    );
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

  private _insertSquare(
    normalIndex: number,
    polyIndex: number,
    scale: number
  ): void {
    const normal: Point = this._normals.at(normalIndex);

    this._insert(
      Point.normal(normal).scale(scale).add(normal),
      polyIndex,
      this._delta
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

  public static getUnitNormal(point1: Point, point2: Point): Point {
    const d: Point = Point.sub(point1, point2);

    return d.isEmpty ? d : d.normalize().normal();
  }

  public static castInt32(a: number): number {
    return ~~clipperRound(a);
  }

  static def_arc_tolerance: number = 0.25;
}
