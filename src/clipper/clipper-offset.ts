import { ClipType, EndType, JoinType, PolyType, PolyFillType } from "./enums";
import Clipper from "./clipper";
import IntPoint from "./int-point";
import PolyNode from "./poly-node";
import IntRect from "./int-rect";

export default class ClipperOffset {
  private _destPolys: IntPoint[][] = [];
  private _srcPoly: IntPoint[] = [];
  private _destPoly: IntPoint[] = [];
  private _normals: IntPoint[] = [];
  private _delta: number = 0;
  private _sinA: number = 0;
  private _sin: number = 0;
  private _cos: number = 0;
  private _miterLim: number = 0;
  private _stepsPerRad: number = 0;
  private _lowest = new IntPoint();
  private _polyNodes: PolyNode = new PolyNode();
  private _miterLimit: number = 0;
  private _arcTolerance: number = 0;

  constructor(
    miterLimit: number = ClipperOffset.def_arc_tolerance,
    arcTolerance: number = 2
  ) {
    this._lowest.X = -1;
    this._miterLimit = miterLimit;
    this._arcTolerance = arcTolerance;
  }

  public AddPath(path: IntPoint[], joinType: JoinType, endType: EndType) {
    var highI = path.length - 1;
    if (highI < 0) return;
    var newNode = new PolyNode(joinType, endType);
    //strip duplicate points from path and also get index to the lowest point ...
    if (endType == EndType.ClosedLine || endType == EndType.ClosedPolygon)
      while (highI > 0 && IntPoint.equal(path[0], path[highI])) highI--;
    //newNode.m_polygon.set_Capacity(highI + 1);
    newNode.add(path[0]);
    var j = 0,
      k = 0;
    for (var i = 1; i <= highI; i++)
      if (IntPoint.unequal(newNode.at(j), path[i])) {
        j++;
        newNode.add(path[i]);
        if (
          path[i].Y > newNode.at(k).Y ||
          (path[i].Y == newNode.at(k).Y && path[i].X < newNode.at(k).X)
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
    if (this._lowest.X < 0) this._lowest = new IntPoint(0, k);
    else {
      var ip = this._polyNodes.childAt(this._lowest.X).at(this._lowest.Y);
      if (
        newNode.at(k).Y > ip.Y ||
        (newNode.at(k).Y == ip.Y && newNode.at(k).X < ip.X)
      )
        this._lowest = new IntPoint(this._polyNodes.childCount - 1, k);
    }
  }

  public Execute(solution: IntPoint[][], delta: number) {
    // function (solution, delta)
    solution.length = 0;
    this._fixOrientations();
    this._doOffset(delta);
    //now clean up 'corners' ...
    var clpr = new Clipper();
    clpr.AddPaths(this._destPolys, PolyType.Subject, true);
    if (delta > 0) {
      clpr.Execute(
        ClipType.Union,
        solution,
        PolyFillType.Positive,
        PolyFillType.Positive
      );
    } else {
      var rect: IntRect = IntRect.fromPaths(this._destPolys);
      var outer = [];
      outer.push(new IntPoint(rect.left - 10, rect.bottom + 10));
      outer.push(new IntPoint(rect.right + 10, rect.bottom + 10));
      outer.push(new IntPoint(rect.right + 10, rect.top - 10));
      outer.push(new IntPoint(rect.left - 10, rect.top - 10));
      clpr.AddPath(outer, PolyType.Subject, true);
      clpr.ReverseSolution = true;
      clpr.Execute(
        ClipType.Union,
        solution,
        PolyFillType.Negative,
        PolyFillType.Negative
      );
      if (solution.length > 0) solution.splice(0, 1);
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
      this._lowest.X >= 0 &&
      !this._polyNodes.childAt(this._lowest.X).orientation
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

  public static GetUnitNormal(pt1: IntPoint, pt2: IntPoint): IntPoint {
    var dx = pt2.X - pt1.X;
    var dy = pt2.Y - pt1.Y;
    if (dx == 0 && dy == 0) return new IntPoint(0, 0);
    var f = 1 / Math.sqrt(dx * dx + dy * dy);
    dx *= f;
    dy *= f;
    return new IntPoint(dy, -dx);
  }

  private _doOffset(delta: number) {
    this._destPolys = new Array();
    this._delta = delta;
    //if Zero offset, just copy any CLOSED polygons to m_p and return ...
    if (Clipper.near_zero(delta)) {
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
              new IntPoint(
                ClipperOffset.Round(this._srcPoly[0].X + X * delta),
                ClipperOffset.Round(this._srcPoly[0].Y + Y * delta)
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
              new IntPoint(
                ClipperOffset.Round(this._srcPoly[0].X + X * delta),
                ClipperOffset.Round(this._srcPoly[0].Y + Y * delta)
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
          new IntPoint(this._normals[len - 2].X, this._normals[len - 2].Y)
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
          this._normals[j] = new IntPoint(
            -this._normals[j - 1].X,
            -this._normals[j - 1].Y
          );
        this._normals[0] = new IntPoint(-n.X, -n.Y);
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
          pt1 = new IntPoint(
            ClipperOffset.Round(
              this._srcPoly[j].X + this._normals[j].X * delta
            ),
            ClipperOffset.Round(this._srcPoly[j].Y + this._normals[j].Y * delta)
          );
          this._destPoly.push(pt1);
          pt1 = new IntPoint(
            ClipperOffset.Round(
              this._srcPoly[j].X - this._normals[j].X * delta
            ),
            ClipperOffset.Round(this._srcPoly[j].Y - this._normals[j].Y * delta)
          );
          this._destPoly.push(pt1);
        } else {
          var j = len - 1;
          k = len - 2;
          this._sinA = 0;
          this._normals[j] = new IntPoint(
            -this._normals[j].X,
            -this._normals[j].Y
          );
          if (node.endType == EndType.OpenSquare) this._doSquare(j, k);
          else this._doRound(j, k);
        }
        //re-build m_normals ...
        for (var j = len - 1; j > 0; j--)
          this._normals[j] = new IntPoint(
            -this._normals[j - 1].X,
            -this._normals[j - 1].Y
          );
        this._normals[0] = new IntPoint(
          -this._normals[1].X,
          -this._normals[1].Y
        );
        k = len - 1;
        for (var j = k - 1; j > 0; --j)
          k = this._offsetPoint(j, k, node.joinType);
        if (node.endType == EndType.OpenButt) {
          pt1 = new IntPoint(
            ClipperOffset.Round(
              this._srcPoly[0].X - this._normals[0].X * delta
            ),
            ClipperOffset.Round(this._srcPoly[0].Y - this._normals[0].Y * delta)
          );
          this._destPoly.push(pt1);
          pt1 = new IntPoint(
            ClipperOffset.Round(
              this._srcPoly[0].X + this._normals[0].X * delta
            ),
            ClipperOffset.Round(this._srcPoly[0].Y + this._normals[0].Y * delta)
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
      this._normals[k].X * this._normals[j].Y -
      this._normals[j].X * this._normals[k].Y;
    if (this._sinA < 0.00005 && this._sinA > -0.00005) return k;
    else if (this._sinA > 1) this._sinA = 1.0;
    else if (this._sinA < -1) this._sinA = -1.0;
    if (this._sinA * this._delta < 0) {
      this._destPoly.push(
        new IntPoint(
          ClipperOffset.Round(
            this._srcPoly[j].X + this._normals[k].X * this._delta
          ),
          ClipperOffset.Round(
            this._srcPoly[j].Y + this._normals[k].Y * this._delta
          )
        )
      );
      this._destPoly.push(new IntPoint(this._srcPoly[j].X, this._srcPoly[j].Y));
      this._destPoly.push(
        new IntPoint(
          ClipperOffset.Round(
            this._srcPoly[j].X + this._normals[j].X * this._delta
          ),
          ClipperOffset.Round(
            this._srcPoly[j].Y + this._normals[j].Y * this._delta
          )
        )
      );
    } else
      switch (jointype) {
        case JoinType.Miter: {
          var r =
            1 +
            (this._normals[j].X * this._normals[k].X +
              this._normals[j].Y * this._normals[k].Y);
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
        this._normals[k].X * this._normals[j].X +
          this._normals[k].Y * this._normals[j].Y
      ) / 4
    );
    this._destPoly.push(
      new IntPoint(
        ClipperOffset.Round(
          this._srcPoly[j].X +
            this._delta * (this._normals[k].X - this._normals[k].Y * dx)
        ),
        ClipperOffset.Round(
          this._srcPoly[j].Y +
            this._delta * (this._normals[k].Y + this._normals[k].X * dx)
        )
      )
    );
    this._destPoly.push(
      new IntPoint(
        ClipperOffset.Round(
          this._srcPoly[j].X +
            this._delta * (this._normals[j].X + this._normals[j].Y * dx)
        ),
        ClipperOffset.Round(
          this._srcPoly[j].Y +
            this._delta * (this._normals[j].Y - this._normals[j].X * dx)
        )
      )
    );
  }

  private _doRound(j: number, k: number) {
    var a = Math.atan2(
      this._sinA,
      this._normals[k].X * this._normals[j].X +
        this._normals[k].Y * this._normals[j].Y
    );
    var steps = ClipperOffset.Cast_Int32(
      ClipperOffset.Round(this._stepsPerRad * Math.abs(a))
    );
    var X = this._normals[k].X,
      Y = this._normals[k].Y,
      X2;
    for (var i = 0; i < steps; ++i) {
      this._destPoly.push(
        new IntPoint(
          ClipperOffset.Round(this._srcPoly[j].X + X * this._delta),
          ClipperOffset.Round(this._srcPoly[j].Y + Y * this._delta)
        )
      );
      X2 = X;
      X = X * this._cos - this._sin * Y;
      Y = X2 * this._sin + Y * this._cos;
    }
    this._destPoly.push(
      new IntPoint(
        ClipperOffset.Round(
          this._srcPoly[j].X + this._normals[j].X * this._delta
        ),
        ClipperOffset.Round(
          this._srcPoly[j].Y + this._normals[j].Y * this._delta
        )
      )
    );
  }

  private _doMiter(j: number, k: number, r: number) {
    var q = this._delta / r;
    this._destPoly.push(
      new IntPoint(
        ClipperOffset.Round(
          this._srcPoly[j].X + (this._normals[k].X + this._normals[j].X) * q
        ),
        ClipperOffset.Round(
          this._srcPoly[j].Y + (this._normals[k].Y + this._normals[j].Y) * q
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
