declare namespace ClipperLib {
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

    export class Clipper extends ClipperBase {
        DoublePoint: DoublePoint;
        ReverseSolution: boolean;
        PolyOffsetBuilder: PolyOffsetBuilder;
        StrictlySimple: boolean;

        constructor(data: number = 0);

        AddPath(polygon: IntPoint[], type: number, isClosed: boolean): void;
        AddPaths(polygon: IntPoint[][], type: number, isClosed: boolean): void;
        DisposeScanbeamList(): void;
        InsertScanbeam(Y: number): void;
        Execute(solution: Paths | IntPoint[], trashold: number, joinType?: PolyFillType, lineType?: PolyFillType): boolean;
        Execute(type: number, path: Paths | IntPoint[], joinType?: number, ClineType?: number): boolean;
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
}

// Export the namespace as a module
declare module 'js-clipper' {
    export = ClipperLib;
}
