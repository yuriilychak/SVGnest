declare namespace ClipperLib {
    export function Math_Abs_Int64(a: number): number;
    export function Math_Abs_Int32(a: number): number;
    export function Math_Abs_Double(a: number): number;
    export function Math_Max_Int32_Int32(a: number, b: number): number;
    export function Cast_Int32(a: number): number;
    export function Cast_Int64(a: number): number;
    export function Clear(a: ArrayLike<number>): void;

    export class IntPoint {
        X: number;
        Y: number;
        constructor();
        constructor(PointXY: IntPoint);
        constructor(x: number, y: number);
    }

    export class IntRect {
        left: number;
        top: number;
        right: number;
        bottom: number;
        constructor();
        constructor(left: number, top: number, right: number, bottom: number);
    }

    export class DoublePoint {
        X: number;
        Y: number;
        constructor(x: number, y: number);
    }

    export enum ClipType {
        ctIntersection,
        ctUnion,
        ctDifference,
        ctXor
    }

    export enum EndType {
        etOpenSquare,
        etOpenRound,
        etOpenButt,
        etClosedLine,
        etClosedPolygon
    }

    export enum PolyType {
        ptSubject,
        ptClip
    }
    export enum PolyFillType {
        pftEvenOdd,
        pftNonZero,
        pftPositive,
        pftNegative
    }
    export enum JoinType {
        jtSquare,
        jtRound,
        jtMiter
    }
    export enum EdgeSide {
        esLeft,
        esRight
    }
    export enum Protects {
        ipNone,
        ipLeft,
        ipRight,
        ipBoth
    }
    export enum Direction {
        dRightToLeft,
        dLeftToRight
    }

    export interface TEdge {
        xbot: number;
        ybot: number;
        xcurr: number;
        ycurr: number;
        xtop: number;
        ytop: number;
        dx: number;
        deltaX: number;
        deltaY: number;
        tmpX: number;
        polyType: PolyType;
        side: EdgeSide;
        windDelta: number;
        windCnt: number;
        windCnt2: number;
        outIdx: number;
        next: TEdge;
        prev: TEdge;
        nextInLML: TEdge;
        nextInAEL: TEdge;
        prevInAEL: TEdge;
        nextInSEL: TEdge;
        prevInSEL: TEdge;
    }

    export interface IntersectNode {
        edge1: TEdge;
        edge2: TEdge;
        pt: TEdge;
        next: TEdge;
    }
    export interface LocalMinima {
        Y: number;
        leftBound: TEdge;
        rightBound: TEdge;
        next: TEdge;
    }
    export class Scanbeam {
        Y: number;
        next: TEdge;
    }
    export interface OutPt {
        idx: number;
        pt: OutPt;
        next: OutPt;
        prev: OutPt;
    }

    export interface OutRec {
        idx: number;
        isHole: boolean;
        FirstLeft: TEdge;
        AppendLink: OutRec;
        pts: OutPt;
        bottomPt: OutPt;
    }
    export interface JoinRec {
        pt1a: IntPoint;
        pt1b: IntPoint;
        poly1Idx: number;
        pt2a: IntPoint;
        pt2b: IntPoint;
        poly2Idx: number;
    }
    export interface HorzJoinRec {
        edge: TEdge;
        savedIdx: number;
    }

    export class Polygon extends Array<IntPoint> {
        constructor();
        constructor(poly: ArrayLike<IntPoint>);
    }

    export class Polygons {
        constructor();
        constructor(polys: ArrayLike<ArrayLike<IntPoint>>);
    }

    export class ExPolygon {
        outer: ArrayLike<IntPoint>;
        holes: ArrayLike<ArrayLike<IntPoint>>;
    }

    export class ClipperBase {
        horizontal: number;
        loRange: number;
        hiRange: number;

        PointsEqual(pt1: IntPoint, pt2: IntPoint): boolean;
        PointIsVertex(pt: IntPoint, pp: JoinRec): boolean;
        PointInPolygon(pt: IntPoint, pp: JoinRec, UseFulllongRange: boolean): boolean;
        SlopesEqual(e1: TEdge, e2: TEdge, UseFullRange: boolean): boolean;
        clear(): void;
        DisposeLocalMinimaList(): void;
        AddPolygons(ppg: ArrayLike<ArrayLike<IntPoint>>, polyType: PolyType): boolean | string;
        AddPolygon(pg: ArrayLike<IntPoint>, polyType: PolyType, multiple: boolean): boolean | string;
        InitEdge(e: TEdge, eNext: TEdge, ePrev: TEdge, pt: IntPoint, polyType: PolyType): void;
        SetDx(e: TEdge): void;
        AddBoundsToLML(e: TEdge): TEdge;
        InsertLocalMinima(newLm: LocalMinima): void;
        PopLocalMinima(): void;
        SwapX(e: TEdge): void;
        Reset(): void;
        GetBounds(): IntRect;
    }

    export class PolyOffsetBuilder {
        pts: Polygons;
        currentPoly: Polygon;
        normals: ArrayLike<IntPoint>;
        delta: number;
        botPt: unknown;

        constructor(
            pts: Polygons,
            solution: { value: Polygons },
            delta: number,
            jointype: JoinType,
            MiterLimit: number,
            AutoFix: boolean
        );

        UpdateBotPt(pt: IntPoint): boolean;
        AddPoint(pt: IntPoint): void;
        DoSquare(mul: number): void;
        DoMiter(): void;
        DoRound(): void;
    }

    export class Paths extends Array<Array<IntPoint>> {}

    export class Clipper extends ClipperBase {
        DoublePoint: DoublePoint;
        PolyOffsetBuilder: PolyOffsetBuilder;

        AddPath(polygon: IntPoint[], type: number, isClosed: boolean): void;
        AddPaths(polygon: IntPoint[][], type: number, isClosed: boolean): void;
        DisposeScanbeamList(): void;
        InsertScanbeam(Y: number): void;
        Execute(solution: Paths, trashold: number, joinType?: PolyFillType, lineType?: PolyFillType): boolean;
        Execute(type: number, path: Paths, joinType?: number, ClineType?: number): boolean;
        PolySort(or1: OutRec, or2: OutRec): number;
        FindAppendLinkEnd(outRec: OutRec): OutRec;
        FixHoleLinkage(outRec: OutRec): void;
        ExecuteInternal(): boolean;
        PopScanbeam(): number;
        DisposeOutRec(index: number): void;
        DisposeOutPts(pp: OutPt): void;
        AddJoin(e1: TEdge, e2: TEdge, e1OutIdx: number, e2OutIdx: number): void;
        AddHorzJoin(e: TEdge, idx: number): void;
        InsertLocalMinimaIntoAEL(botY: number): void;
        InsertEdgeIntoAEL(edge: TEdge): void;
        E2InsertsBeforeE1(e1: TEdge, e2: TEdge): boolean;
        IsEvenOddFillType(edge: TEdge): boolean;
        IsEvenOddAltFillType(edge: TEdge): boolean;
        IsContributing(edge: TEdge): boolean;
        SetWindingCount(edge: TEdge): void;
        AddEdgeToSEL(edge: TEdge): void;
        CopyAELToSEL(): void;
        SwapPositionsInAEL(edge1: TEdge, edge2: TEdge): void;
        SwapPositionsInSEL(edge1: TEdge, edge2: TEdge): void;
        AddLocalMaxPoly(e1: TEdge, e2: TEdge, pt: OutPt): void;
        AddLocalMinPoly(e1: TEdge, e2: TEdge, pt: OutPt): void;
        CreateOutRec(): OutRec;
        AddOutPt(e: TEdge, pt: IntPoint): void;
        SwapPoints(pt1: IntPoint, pt2: IntPoint): void;
        GetOverlapSegment(
            pt1a: IntPoint,
            pt1b: IntPoint,
            pt2a: IntPoint,
            pt2b: IntPoint,
            pt1: IntPoint,
            pt2: IntPoint
        ): boolean;
        FindSegment(pp: IntPoint, pt1: IntPoint, pt2: IntPoint): boolean;
        Pt3IsBetweenPt1AndPt2(pt1: boolean, pt2: boolean, pt3: boolean): OutPt;
        InsertPolyPtBetween(p1: OutPt, p2: OutPt, pt: OutPt): OutPt;
        SetHoleState(e: TEdge, outRec: OutRec): void;
        GetDx(pt1: IntPoint, pt2: IntPoint): number;
        FirstIsBottomPt(btmPt1: OutPt, btmPt2: OutPt): boolean;
        GetBottomPt(pp: OutPt): OutPt;
        GetLowermostRec(outRec1: OutRec, outRec2: OutRec): OutRec;
        Param1RightOfParam2(outRec1: OutRec, outRec2: OutRec): boolean;
        AppendPolygon(e1: TEdge, e2: TEdge): void;
        ReversePolyPtLinks(pp: OutPt): void;
        SwapSides(edge1: TEdge, edge2: TEdge): void;
        SwapPolyIndexes(edge1: TEdge, edge2: TEdge): void;
        DoEdge1(edge1: TEdge, edge2: TEdge, pt: OutPt): void;
        DoEdge2(edge1: TEdge, edge2: TEdge, pt: OutPt): void;
        DoBothEdges(edge1: TEdge, edge2: TEdge, pt: OutPt): void;
        IntersectEdges(e1: TEdge, e2: TEdge, pt: OutPt, protects: Protects): void;
        DeleteFromAEL(e: TEdge): void;
        DeleteFromSEL(e: TEdge): void;
        UpdateEdgeIntoAEL(e: TEdge): void;
        ProcessHorizontals(): void;
        ProcessHorizontal(horzEdge: TEdge): void;
        IsTopHorz(horzEdge: TEdge, XPos: IntPoint): boolean;
        GetNextInAEL(e: TEdge, direction: TEdge): TEdge;
        IsMinima(e: TEdge): boolean;
        IsMaxima(e: TEdge, Y: number): boolean;
        IsIntermediate(e: TEdge, Y: number): boolean;
        GetMaximaPair(e: TEdge): TEdge;
        ProcessIntersections(botY: number, topY: number): boolean;
        BuildIntersectList(botY: number, topY: number): void;
        FixupIntersections(): boolean;
        ProcessIntersectList(): void;
        Round(a: number): number;
        TopX(edge: TEdge, currentY: number): number;
        AddIntersectNode(e1: TEdge, e2: TEdge, pt: IntPoint): void;
        ProcessParam1BeforeParam2(node1: IntersectNode, node2: IntersectNode): boolean;
        SwapIntersectNodes(int1: IntersectNode, int2: IntersectNode): void;
        IntersectPoint(edge1: TEdge, edge2: TEdge, ip: IntPoint): boolean;
        DisposeIntersectNodes(): void;
        ProcessEdgesAtTopOfScanbeam(topY: number): void;
        DoMaxima(e: TEdge, topY: number): void;
        ReversePolygons(polys: Polygons): void;
        Orientation(poly: Polygon): boolean;
        PointCount(pts: ArrayLike<OutPt>): number;
        BuildResult(polyg: Polygon): void;
        BuildResultEx(polyg: ExPolygon): void;
        FixupOutPolygon(outRec: OutPt): void;
        JoinPoints(j: JoinRec, p1: IntPoint, p2: IntPoint): boolean;
        FixupJoinRecs(j: JoinRec, pt: JoinRec, startIdx: number): void;
        JoinCommonEdges(): void;
        FullRangeNeeded(pts: ArrayLike<IntPoint>): boolean;
        static Area(poly: IntPoint[]): number;
        BuildArc(pt: IntPoint, a1: IntPoint, a2: IntPoint, r: number): Polygon;
        GetUnitNormal(pt1: IntPoint, pt2: IntPoint): DoublePoint;
        OffsetPolygons(
            poly: Polygon,
            delta: number,
            jointype: JoinType,
            MiterLimit: number,
            AutoFix: boolean
        ): ArrayLike<ArrayLike<IntPoint>>;
        static MinkowskiSum(pattern: IntPoint[], path: IntPoint[], isPathClosed: boolean): IntPoint[][];
        static CleanPolygons(poly: IntPoint[][], trashold: number): Paths;
        static CleanPolygon(poly: IntPoint[], trashold: number): IntPoint[];
        static SimplifyPolygon(poly: Polygon, fillType: number): Polygon[];
        SimplifyPolygons(polys: Polygons, fillType: PolyFillType): Polygons;
    }

    export class ClipperOffset extends Clipper {
        constructor(mitterLimit: number, trashold: number);

        AddPath(polygon: IntPoint[], type: PolyType, isClosed: boolean): void;
        AddPath(path: ArrayLike<IntPoint>, joinType: number, endType: number): void;
    }

    export function Error(message: string): void;
    export function Clone(
        polygon: ArrayLike<IntPoint> | ArrayLike<ArrayLike<IntPoint>>
    ): ArrayLike<IntPoint> | ArrayLike<ArrayLike<IntPoint>>;
    export function Clean(
        polygon: ArrayLike<IntPoint> | ArrayLike<ArrayLike<IntPoint>>,
        delta: number
    ): ArrayLike<IntPoint> | ArrayLike<ArrayLike<IntPoint>>;
    export function Lighten(
        polygon: ArrayLike<IntPoint> | ArrayLike<ArrayLike<IntPoint>>,
        tolerance: number
    ): ArrayLike<IntPoint> | ArrayLike<ArrayLike<IntPoint>>;
}

// Export the namespace as a module
declare module 'js-clipper' {
    export = ClipperLib;
}
