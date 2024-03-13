import { ClipType, EndType, JoinType, PolyType, PolyFillType } from "./enums";
import Clipper from "./clipper";
import IntPoint from "./int-point";
import PolyNode from "./poly-node";
import IntRect from "./int-rect";

export default class ClipperOffset {
  private m_destPolys: IntPoint[][] = [];
  private m_srcPoly: IntPoint[] = [];
  private m_destPoly: IntPoint[] = [];
  private m_normals: IntPoint[] = [];
  private m_delta: number = 0;
  private m_sinA: number = 0;
  private m_sin: number = 0;
  private m_cos: number = 0;
  private m_miterLim: number = 0;
  private m_StepsPerRad: number = 0;
  private m_lowest = new IntPoint();
  private m_polyNodes: PolyNode = new PolyNode();
  private MiterLimit: number = 0;
  private ArcTolerance: number = 0;

  constructor(
    miterLimit: number = ClipperOffset.def_arc_tolerance,
    arcTolerance: number = 2
  ) {
    this.m_lowest.X = -1;
    this.MiterLimit = miterLimit;
    this.ArcTolerance = arcTolerance;
  }

  public AddPath(path: IntPoint[], joinType: JoinType, endType: EndType) {
    var highI = path.length - 1;
    if (highI < 0) return;
    var newNode = new PolyNode(joinType, endType);
    //strip duplicate points from path and also get index to the lowest point ...
    if (endType == EndType.ClosedLine || endType == EndType.ClosedPolygon)
      while (highI > 0 && IntPoint.op_Equality(path[0], path[highI])) highI--;
    //newNode.m_polygon.set_Capacity(highI + 1);
    newNode.add(path[0]);
    var j = 0,
      k = 0;
    for (var i = 1; i <= highI; i++)
      if (IntPoint.op_Inequality(newNode.at(j), path[i])) {
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
    this.m_polyNodes.addChild(newNode);
    //if this path's lowest pt is lower than all the others then update m_lowest
    if (endType != EndType.ClosedPolygon) return;
    if (this.m_lowest.X < 0) this.m_lowest = new IntPoint(0, k);
    else {
      var ip = this.m_polyNodes.childAt(this.m_lowest.X).at(this.m_lowest.Y);
      if (
        newNode.at(k).Y > ip.Y ||
        (newNode.at(k).Y == ip.Y && newNode.at(k).X < ip.X)
      )
        this.m_lowest = new IntPoint(this.m_polyNodes.childCount - 1, k);
    }
  }

  public Execute(solution: IntPoint[][], delta: number) {
    // function (solution, delta)
    solution.length = 0;
    this.FixOrientations();
    this.DoOffset(delta);
    //now clean up 'corners' ...
    var clpr = new Clipper();
    clpr.AddPaths(this.m_destPolys, PolyType.Subject, true);
    if (delta > 0) {
      clpr.Execute(
        ClipType.Union,
        solution,
        PolyFillType.Positive,
        PolyFillType.Positive
      );
    } else {
      var rect: IntRect = IntRect.fromPaths(this.m_destPolys);
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

  public FixOrientations() {
    //fixup orientations of all closed paths if the orientation of the
    //closed path with the lowermost vertex is wrong ...
    if (
      this.m_lowest.X >= 0 &&
      !this.m_polyNodes.childAt(this.m_lowest.X).orientation
    ) {
      for (var i = 0; i < this.m_polyNodes.childCount; i++) {
        var node = this.m_polyNodes.childAt(i);
        if (
          node.endType == EndType.ClosedPolygon ||
          (node.endType == EndType.ClosedLine && node.orientation)
        )
          node.reverse();
      }
    } else {
      for (var i = 0; i < this.m_polyNodes.childCount; i++) {
        var node = this.m_polyNodes.childAt(i);
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

  public DoOffset(delta: number) {
    this.m_destPolys = new Array();
    this.m_delta = delta;
    //if Zero offset, just copy any CLOSED polygons to m_p and return ...
    if (Clipper.near_zero(delta)) {
      //this.m_destPolys.set_Capacity(this.m_polyNodes.ChildCount);
      for (var i = 0; i < this.m_polyNodes.childCount; i++) {
        var node = this.m_polyNodes.childAt(i);
        if (node.endType == EndType.ClosedPolygon)
          this.m_destPolys.push(node.polygon);
      }
      return;
    }
    //see offset_triginometry3.svg in the documentation folder ...
    if (this.MiterLimit > 2)
      this.m_miterLim = 2 / (this.MiterLimit * this.MiterLimit);
    else this.m_miterLim = 0.5;
    var y;
    if (this.ArcTolerance <= 0) y = ClipperOffset.def_arc_tolerance;
    else if (
      this.ArcTolerance >
      Math.abs(delta) * ClipperOffset.def_arc_tolerance
    )
      y = Math.abs(delta) * ClipperOffset.def_arc_tolerance;
    else y = this.ArcTolerance;
    //see offset_triginometry2.svg in the documentation folder ...
    var steps = 3.14159265358979 / Math.acos(1 - y / Math.abs(delta));
    this.m_sin = Math.sin(ClipperOffset.two_pi / steps);
    this.m_cos = Math.cos(ClipperOffset.two_pi / steps);
    this.m_StepsPerRad = steps / ClipperOffset.two_pi;
    if (delta < 0) this.m_sin = -this.m_sin;
    //this.m_destPolys.set_Capacity(this.m_polyNodes.ChildCount * 2);
    for (var i = 0; i < this.m_polyNodes.childCount; i++) {
      var node = this.m_polyNodes.childAt(i);
      this.m_srcPoly = node.polygon;
      var len = this.m_srcPoly.length;
      if (
        len == 0 ||
        (delta <= 0 && (len < 3 || node.endType != EndType.ClosedPolygon))
      )
        continue;
      this.m_destPoly = new Array();
      if (len == 1) {
        if (node.joinType == JoinType.Round) {
          var X = 1,
            Y = 0;
          for (var j = 1; j <= steps; j++) {
            this.m_destPoly.push(
              new IntPoint(
                ClipperOffset.Round(this.m_srcPoly[0].X + X * delta),
                ClipperOffset.Round(this.m_srcPoly[0].Y + Y * delta)
              )
            );
            var X2 = X;
            X = X * this.m_cos - this.m_sin * Y;
            Y = X2 * this.m_sin + Y * this.m_cos;
          }
        } else {
          var X = -1,
            Y = -1;
          for (var j = 0; j < 4; ++j) {
            this.m_destPoly.push(
              new IntPoint(
                ClipperOffset.Round(this.m_srcPoly[0].X + X * delta),
                ClipperOffset.Round(this.m_srcPoly[0].Y + Y * delta)
              )
            );
            if (X < 0) X = 1;
            else if (Y < 0) Y = 1;
            else X = -1;
          }
        }
        this.m_destPolys.push(this.m_destPoly);
        continue;
      }
      //build m_normals ...
      this.m_normals.length = 0;
      //this.m_normals.set_Capacity(len);
      for (var j = 0; j < len - 1; j++)
        this.m_normals.push(
          ClipperOffset.GetUnitNormal(this.m_srcPoly[j], this.m_srcPoly[j + 1])
        );
      if (
        node.endType == EndType.ClosedLine ||
        node.endType == EndType.ClosedPolygon
      )
        this.m_normals.push(
          ClipperOffset.GetUnitNormal(
            this.m_srcPoly[len - 1],
            this.m_srcPoly[0]
          )
        );
      else
        this.m_normals.push(
          new IntPoint(this.m_normals[len - 2].X, this.m_normals[len - 2].Y)
        );
      if (node.endType == EndType.ClosedPolygon) {
        var k = len - 1;
        for (var j = 0; j < len; j++) k = this.OffsetPoint(j, k, node.joinType);
        this.m_destPolys.push(this.m_destPoly);
      } else if (node.endType == EndType.ClosedLine) {
        var k = len - 1;
        for (var j = 0; j < len; j++) k = this.OffsetPoint(j, k, node.joinType);
        this.m_destPolys.push(this.m_destPoly);
        this.m_destPoly = new Array();
        //re-build m_normals ...
        var n = this.m_normals[len - 1];
        for (var j = len - 1; j > 0; j--)
          this.m_normals[j] = new IntPoint(
            -this.m_normals[j - 1].X,
            -this.m_normals[j - 1].Y
          );
        this.m_normals[0] = new IntPoint(-n.X, -n.Y);
        k = 0;
        for (var j = len - 1; j >= 0; j--)
          k = this.OffsetPoint(j, k, node.joinType);
        this.m_destPolys.push(this.m_destPoly);
      } else {
        var k = 0;
        for (var j = 1; j < len - 1; ++j)
          k = this.OffsetPoint(j, k, node.joinType);
        var pt1;
        if (node.endType == EndType.OpenButt) {
          var j = len - 1;
          pt1 = new IntPoint(
            ClipperOffset.Round(
              this.m_srcPoly[j].X + this.m_normals[j].X * delta
            ),
            ClipperOffset.Round(
              this.m_srcPoly[j].Y + this.m_normals[j].Y * delta
            )
          );
          this.m_destPoly.push(pt1);
          pt1 = new IntPoint(
            ClipperOffset.Round(
              this.m_srcPoly[j].X - this.m_normals[j].X * delta
            ),
            ClipperOffset.Round(
              this.m_srcPoly[j].Y - this.m_normals[j].Y * delta
            )
          );
          this.m_destPoly.push(pt1);
        } else {
          var j = len - 1;
          k = len - 2;
          this.m_sinA = 0;
          this.m_normals[j] = new IntPoint(
            -this.m_normals[j].X,
            -this.m_normals[j].Y
          );
          if (node.endType == EndType.OpenSquare) this.DoSquare(j, k);
          else this.DoRound(j, k);
        }
        //re-build m_normals ...
        for (var j = len - 1; j > 0; j--)
          this.m_normals[j] = new IntPoint(
            -this.m_normals[j - 1].X,
            -this.m_normals[j - 1].Y
          );
        this.m_normals[0] = new IntPoint(
          -this.m_normals[1].X,
          -this.m_normals[1].Y
        );
        k = len - 1;
        for (var j = k - 1; j > 0; --j)
          k = this.OffsetPoint(j, k, node.joinType);
        if (node.endType == EndType.OpenButt) {
          pt1 = new IntPoint(
            ClipperOffset.Round(
              this.m_srcPoly[0].X - this.m_normals[0].X * delta
            ),
            ClipperOffset.Round(
              this.m_srcPoly[0].Y - this.m_normals[0].Y * delta
            )
          );
          this.m_destPoly.push(pt1);
          pt1 = new IntPoint(
            ClipperOffset.Round(
              this.m_srcPoly[0].X + this.m_normals[0].X * delta
            ),
            ClipperOffset.Round(
              this.m_srcPoly[0].Y + this.m_normals[0].Y * delta
            )
          );
          this.m_destPoly.push(pt1);
        } else {
          k = 1;
          this.m_sinA = 0;
          if (node.endType == EndType.OpenSquare) this.DoSquare(0, 1);
          else this.DoRound(0, 1);
        }
        this.m_destPolys.push(this.m_destPoly);
      }
    }
  }

  public OffsetPoint(j: number, k: number, jointype: number) {
    this.m_sinA =
      this.m_normals[k].X * this.m_normals[j].Y -
      this.m_normals[j].X * this.m_normals[k].Y;
    if (this.m_sinA < 0.00005 && this.m_sinA > -0.00005) return k;
    else if (this.m_sinA > 1) this.m_sinA = 1.0;
    else if (this.m_sinA < -1) this.m_sinA = -1.0;
    if (this.m_sinA * this.m_delta < 0) {
      this.m_destPoly.push(
        new IntPoint(
          ClipperOffset.Round(
            this.m_srcPoly[j].X + this.m_normals[k].X * this.m_delta
          ),
          ClipperOffset.Round(
            this.m_srcPoly[j].Y + this.m_normals[k].Y * this.m_delta
          )
        )
      );
      this.m_destPoly.push(
        new IntPoint(this.m_srcPoly[j].X, this.m_srcPoly[j].Y)
      );
      this.m_destPoly.push(
        new IntPoint(
          ClipperOffset.Round(
            this.m_srcPoly[j].X + this.m_normals[j].X * this.m_delta
          ),
          ClipperOffset.Round(
            this.m_srcPoly[j].Y + this.m_normals[j].Y * this.m_delta
          )
        )
      );
    } else
      switch (jointype) {
        case JoinType.Miter: {
          var r =
            1 +
            (this.m_normals[j].X * this.m_normals[k].X +
              this.m_normals[j].Y * this.m_normals[k].Y);
          if (r >= this.m_miterLim) this.DoMiter(j, k, r);
          else this.DoSquare(j, k);
          break;
        }
        case JoinType.Square:
          this.DoSquare(j, k);
          break;
        case JoinType.Round:
          this.DoRound(j, k);
          break;
      }
    k = j;
    return k;
  }

  public DoSquare(j: number, k: number) {
    var dx = Math.tan(
      Math.atan2(
        this.m_sinA,
        this.m_normals[k].X * this.m_normals[j].X +
          this.m_normals[k].Y * this.m_normals[j].Y
      ) / 4
    );
    this.m_destPoly.push(
      new IntPoint(
        ClipperOffset.Round(
          this.m_srcPoly[j].X +
            this.m_delta * (this.m_normals[k].X - this.m_normals[k].Y * dx)
        ),
        ClipperOffset.Round(
          this.m_srcPoly[j].Y +
            this.m_delta * (this.m_normals[k].Y + this.m_normals[k].X * dx)
        )
      )
    );
    this.m_destPoly.push(
      new IntPoint(
        ClipperOffset.Round(
          this.m_srcPoly[j].X +
            this.m_delta * (this.m_normals[j].X + this.m_normals[j].Y * dx)
        ),
        ClipperOffset.Round(
          this.m_srcPoly[j].Y +
            this.m_delta * (this.m_normals[j].Y - this.m_normals[j].X * dx)
        )
      )
    );
  }

  public DoRound(j: number, k: number) {
    var a = Math.atan2(
      this.m_sinA,
      this.m_normals[k].X * this.m_normals[j].X +
        this.m_normals[k].Y * this.m_normals[j].Y
    );
    var steps = ClipperOffset.Cast_Int32(
      ClipperOffset.Round(this.m_StepsPerRad * Math.abs(a))
    );
    var X = this.m_normals[k].X,
      Y = this.m_normals[k].Y,
      X2;
    for (var i = 0; i < steps; ++i) {
      this.m_destPoly.push(
        new IntPoint(
          ClipperOffset.Round(this.m_srcPoly[j].X + X * this.m_delta),
          ClipperOffset.Round(this.m_srcPoly[j].Y + Y * this.m_delta)
        )
      );
      X2 = X;
      X = X * this.m_cos - this.m_sin * Y;
      Y = X2 * this.m_sin + Y * this.m_cos;
    }
    this.m_destPoly.push(
      new IntPoint(
        ClipperOffset.Round(
          this.m_srcPoly[j].X + this.m_normals[j].X * this.m_delta
        ),
        ClipperOffset.Round(
          this.m_srcPoly[j].Y + this.m_normals[j].Y * this.m_delta
        )
      )
    );
  }

  public DoMiter(j: number, k: number, r: number) {
    var q = this.m_delta / r;
    this.m_destPoly.push(
      new IntPoint(
        ClipperOffset.Round(
          this.m_srcPoly[j].X + (this.m_normals[k].X + this.m_normals[j].X) * q
        ),
        ClipperOffset.Round(
          this.m_srcPoly[j].Y + (this.m_normals[k].Y + this.m_normals[j].Y) * q
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
