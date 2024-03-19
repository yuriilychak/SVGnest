import { ClipType, EdgeSide, PolyFillType, PolyType } from "./enums";
import JoinStore from "./join-store";
import IntPoint from "./int-point";
import LocalMinima from "./local-minima";
import OutPolygon from "./out-polygon";
import OutPt from "./out-pt";
import { TEdge } from "./edge";
import IntersectStore from "./intersect-store";
import ScanbeamStore from "./scanbeam-store";
import LocalMinimaStore from "./local-minima-store";

export default class Clipper {
  private _useFullRange: boolean = false;
  private _hasOpenPaths: boolean = false;
  private _preserveCollinear: boolean = false;
  private _executeLocked: boolean = false;
  private _reverseSolution: boolean = false;
  private _strictlySimple: boolean;
  private _outPolygon: OutPolygon;
  private _joinStore: JoinStore;
  private _intersectStore: IntersectStore;
  private _scanbeamStore: ScanbeamStore;
  private _localMinimaStore: LocalMinimaStore;

  constructor(
    strictlySimple: boolean = false,
    reverseSolution: boolean = false
  ) {
    this._strictlySimple = strictlySimple;
    this._reverseSolution = reverseSolution;
    this._outPolygon = new OutPolygon();
    this._joinStore = new JoinStore();
    this._scanbeamStore = new ScanbeamStore();
    this._intersectStore = new IntersectStore(
      this._outPolygon,
      this._joinStore,
      this._scanbeamStore
    );
    this._localMinimaStore = new LocalMinimaStore();
  }

  public addPaths(
    ppg: IntPoint[][],
    polyType: PolyType,
    closed: boolean
  ): boolean {
    let result: boolean = false;
    const polygonCount: number = ppg.length;
    let i: number = 0;

    for (i = 0; i < polygonCount; ++i) {
      if (this.addPath(ppg[i], polyType, closed)) {
        result = true;
      }
    }

    return result;
  }

  public addPath(
    polygon: IntPoint[],
    polyType: PolyType,
    isClosed: boolean
  ): boolean {
    if (!isClosed && polyType == PolyType.Clip) {
      console.error("AddPath: Open paths must be subject.");
    }

    const lastIndex: number = Clipper._getPolygonLastIndex(polygon, isClosed);

    if ((isClosed && lastIndex < 2) || (!isClosed && lastIndex < 1)) {
      return false;
    }
    //create a new edge array ...
    const edges: TEdge[] = [];
    let i: number = 0;
    let isFlat: boolean = true;

    for (i = 0; i <= lastIndex; ++i) {
      edges.push(new TEdge());
    }

    //1. Basic (first) edge initialization ...

    //edges[1].Curr = pg[1];
    edges[1].current.set(polygon[1]);

    this._useFullRange = polygon[0].rangeTest(this._useFullRange);
    this._useFullRange = polygon[lastIndex].rangeTest(this._useFullRange);

    edges[0].init(edges[1], edges[lastIndex], polygon[0]);
    edges[lastIndex].init(edges[0], edges[lastIndex - 1], polygon[lastIndex]);

    for (i = lastIndex - 1; i >= 1; --i) {
      this._useFullRange = polygon[i].rangeTest(this._useFullRange);

      edges[i].init(edges[i + 1], edges[i - 1], polygon[i]);
    }

    let startEdge: TEdge = edges[0];
    //2. Remove duplicate vertices, and (when closed) collinear edges ...
    let edge1: TEdge = startEdge;
    let edge2: TEdge;
    let loopStopEdge: TEdge = startEdge;

    while (true) {
      if (edge1.current.equal(edge1.next.current)) {
        if (edge1 == edge1.next) {
          break;
        }

        if (edge1 == startEdge) {
          startEdge = edge1.next;
        }

        edge1 = edge1.remove();
        loopStopEdge = edge1;
        continue;
      }

      if (edge1.prev == edge1.next) {
        break;
      }

      if (
        isClosed &&
        IntPoint.slopesEqual(
          edge1.prev.current,
          edge1.current,
          edge1.next.current,
          this._useFullRange
        ) &&
        (!this._preserveCollinear ||
          !edge1.current.between(edge1.prev.current, edge1.next.current))
      ) {
        //Collinear edges are allowed for open paths but in closed paths
        //the default is to merge adjacent collinear edges into a single edge.
        //However, if the PreserveCollinear property is enabled, only overlapping
        //collinear edges (ie spikes) will be removed from closed paths.
        if (edge1 == startEdge) {
          startEdge = edge1.next;
        }

        edge1 = edge1.remove();
        edge1 = edge1.prev;
        loopStopEdge = edge1;
        continue;
      }

      edge1 = edge1.next;

      if (edge1 == loopStopEdge) {
        break;
      }
    }

    if (
      (!isClosed && edge1 == edge1.next) ||
      (isClosed && edge1.prev == edge1.next)
    ) {
      return false;
    }

    if (!isClosed) {
      this._hasOpenPaths = true;
      startEdge.prev.outIndex = TEdge.skip;
    }
    //3. Do second stage of edge initialization ...
    edge1 = startEdge;

    do {
      edge1.initFromPolyType(polyType);
      edge1 = edge1.next;
      isFlat = isFlat && edge1.current.y === startEdge.current.y;
    } while (edge1 != startEdge);

    //4. Finally, add edge bounds to LocalMinima list ...
    //Totally flat paths must be handled differently when adding them
    //to LocalMinima list to avoid endless loops etc ...
    if (isFlat) {
      if (isClosed) {
        return false;
      }

      edge1.prev.outIndex = TEdge.skip;

      if (edge1.prev.bottom.x < edge1.prev.top.x) {
        edge1.prev.reverseHorizontal();
      }

      const locMin: LocalMinima = new LocalMinima(edge1.bottom.y, null, edge1);
      locMin.right.side = EdgeSide.Right;
      locMin.right.windDelta = 0;

      while (edge1.next.outIndex != TEdge.skip) {
        edge1.nextInLML = edge1.next;

        if (edge1.bottom.x != edge1.prev.top.x) {
          edge1.reverseHorizontal();
        }

        edge1 = edge1.next;
      }

      this._localMinimaStore.insert(locMin);
      return true;
    }

    let isClockwise: boolean = false;
    let minEdge: TEdge = null;
    let localMinima: LocalMinima;

    while (true) {
      edge1 = edge1.nextLocMin;

      if (edge1 === minEdge) {
        break;
      }

      if (minEdge == null) {
        minEdge = edge1;
      }
      //E and E.Prev now share a local minima (left aligned if horizontal).
      //Compare their slopes to find which starts which bound ...
      isClockwise = edge1.deltaX >= edge1.prev.deltaX;

      localMinima = new LocalMinima(edge1.bottom.y);
      localMinima.init(edge1, isClockwise, isClosed);

      edge1 = this._localMinimaStore.processBound(
        localMinima.left,
        isClockwise
      );
      edge2 = this._localMinimaStore.processBound(
        localMinima.right,
        !isClockwise
      );

      localMinima.clean();
      this._localMinimaStore.insert(localMinima);
      if (!isClockwise) {
        edge1 = edge2;
      }
    }
    return true;
  }

  public execute(
    clipType: ClipType,
    solution: IntPoint[][],
    subjFillType: PolyFillType,
    clipFillType: PolyFillType
  ): boolean {
    if (this._executeLocked) {
      return false;
    }

    if (this._hasOpenPaths) {
      console.error("Error: PolyTree struct is need for open path clipping.");
    }

    this._executeLocked = true;
    solution.length = 0;
    this._intersectStore.initTypes(clipType, clipFillType, subjFillType);

    let succeeded: boolean = false;

    try {
      succeeded = this._execute();
      //build the return polygons ...
      if (succeeded) {
        this._outPolygon.build(solution);
      }
    } finally {
      this._outPolygon.dispose();
      this._executeLocked = false;
    }
    return succeeded;
  }

  private _insertLocalMinimaIntoAEL(botY: number): void {
    let leftBound: TEdge;
    let rightBound: TEdge;

    while (
      this._localMinimaStore.hasCurrent &&
      this._localMinimaStore.current.y === botY
    ) {
      leftBound = this._localMinimaStore.current.left;
      rightBound = this._localMinimaStore.current.right;
      this._localMinimaStore.pop();

      this._intersectStore.insertLocalMinimaIntoAEL(
        leftBound,
        rightBound,
        this._useFullRange
      );
    }
  }

  private _execute(): boolean {
    try {
      this._reset();

      if (!this._localMinimaStore.hasCurrent) {
        return false;
      }

      let botY: number = this._scanbeamStore.pop();
      let topY: number;

      do {
        this._insertLocalMinimaIntoAEL(botY);
        this._joinStore.clean(false);
        this._intersectStore.processHorizontals(false, this._useFullRange);

        if (this._scanbeamStore.isEmpty) {
          break;
        }

        topY = this._scanbeamStore.pop();
        //console.log("botY:" + botY + ", topY:" + topY);
        if (
          !this._intersectStore.processIntersections(
            botY,
            topY,
            this._useFullRange
          )
        ) {
          return false;
        }

        this._intersectStore.processEdgesAtTopOfScanbeam(
          topY,
          this._useFullRange,
          this._strictlySimple
        );

        botY = topY;
      } while (
        !this._scanbeamStore.isEmpty ||
        this._localMinimaStore.hasCurrent
      );
      //fix orientations ...
      this._outPolygon.fixOrientations(
        this._joinStore.joins,
        this._reverseSolution,
        this._useFullRange,
        this._strictlySimple
      );

      return true;
    } finally {
      this._joinStore.clean(true);
    }
  }

  private _reset(): void {
    if (!this._localMinimaStore.reset()) {
      return;
    }

    this._intersectStore.clean();
    this._scanbeamStore.fromLocalMinima(this._localMinimaStore.source);
  }

  //distance = proximity in units/pixels below which vertices will be stripped.
  //Default ~= sqrt(2) so when adjacent vertices or semi-adjacent vertices have
  //both x & y coords within 1 unit, then the second vertex will be stripped.
  public static cleanPolygon(
    polygon: IntPoint[],
    distance: number = 1.415
  ): IntPoint[] {
    let pointCount: number = polygon.length;

    if (pointCount == 0) {
      return [];
    }

    const outPts: OutPt[] = new Array(pointCount);
    const squareDistance: number = distance * distance;
    let i: number = 0;
    let outPt: OutPt;

    for (i = 0; i < pointCount; ++i) {
      outPts[i] = new OutPt();
    }

    for (i = 0; i < pointCount; ++i) {
      outPt = outPts.at(i);
      outPt.point = polygon[i];
      outPt.next = outPts[(i + 1) % pointCount];
      outPt.next.prev = outPt;
      outPt.index = 0;
    }

    outPt = outPts[0];

    while (outPt.index == 0 && outPt.next !== outPt.prev) {
      if (
        IntPoint.pointsAreClose(outPt.point, outPt.prev.point, squareDistance)
      ) {
        outPt = outPt.exclude();
        --pointCount;
      } else if (
        IntPoint.pointsAreClose(
          outPt.prev.point,
          outPt.next.point,
          squareDistance
        )
      ) {
        outPt.next.exclude();
        outPt = outPt.exclude();
        pointCount -= 2;
      } else if (
        outPt.point.slopesNearCollinear(
          outPt.prev.point,
          outPt.next.point,
          squareDistance
        )
      ) {
        outPt = outPt.exclude();
        --pointCount;
      } else {
        outPt.index = 1;
        outPt = outPt.next;
      }
    }

    if (pointCount < 3) {
      return [];
    }

    const result: IntPoint[] = new Array(pointCount);

    for (i = 0; i < pointCount; ++i) {
      result[i] = IntPoint.from(outPt.point);
      outPt = outPt.next;
    }

    return result;
  }

  public static area(polygons: IntPoint[]): number {
    const polygonCount: number = polygons.length;

    if (polygonCount < 3) {
      return 0;
    }

    let result: number = 0;
    let i: number = 0;
    let j: number = 0;

    for (i = 0, j = polygonCount - 1; i < polygonCount; ++i) {
      result +=
        (polygons[j].x + polygons[i].x) * (polygons[j].y - polygons[i].y);
      j = i;
    }
    return -result * 0.5;
  }

  public static simplifyPolygon(
    poly: IntPoint[],
    fillType: PolyFillType
  ): IntPoint[][] {
    const result: IntPoint[][] = [];
    const clipper: Clipper = new Clipper(true);

    clipper.addPath(poly, PolyType.Subject, true);
    clipper.execute(ClipType.Union, result, fillType, fillType);

    return result;
  }

  public static cleanPolygons(
    polys: IntPoint[][],
    distance: number
  ): IntPoint[][] {
    const result: IntPoint[][] = new Array(polys.length);
    const polygonCount: number = polys.length;
    let i: number = 0;

    for (i = 0; i < polygonCount; ++i) {
      result[i] = Clipper.cleanPolygon(polys[i], distance);
    }

    return result;
  }

  private static _getPolygonLastIndex(
    polygon: IntPoint[],
    isClosed: boolean
  ): number {
    let result: number = polygon.length - 1;

    if (isClosed) {
      while (result > 0 && polygon[0].equal(polygon[result])) {
        --result;
      }
    }

    while (result > 0 && polygon[result].equal(polygon[result - 1])) {
      --result;
    }

    return result;
  }

  static tolerance: number = 1e-20;
}
