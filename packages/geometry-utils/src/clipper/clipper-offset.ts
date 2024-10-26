import { Clipper } from 'js-clipper';
import { getArea, op_Equality } from './helpers';
import { ClipType, IntPoint, PolyFillType, PolyType } from './types';

export default class ClipperOffset {
    private destPolygons: IntPoint[][];
    private srcPolygon: IntPoint[];
    private destPolygon: IntPoint[];
    private normals: IntPoint[];
    private delta: number;
    private sinA: number;
    private lowest: IntPoint;

    private constructor() {
        this.destPolygons = [];
        this.srcPolygon = [];
        this.destPolygon = [];
        this.normals = [];
        this.delta = 0;
        this.sinA = 0;
        this.lowest = { X: -1, Y: 0 };
    }

    public execute(path: IntPoint[], delta: number): IntPoint[][] {
        this.destPolygons = [];
        this.destPolygons = [];
        this.delta = delta;
        this.destPolygon = [];
        this.normals = [];
        this.sinA = 0;

        this.addPath(path);
        const solution: IntPoint[][] = [];
        // function (solution, delta)
        if (this.lowest.X >= 0 && getArea(this.srcPolygon) < 0) {
            this.srcPolygon.reverse();
        }

        this.doOffset(delta);
        //now clean up 'corners' ...
        const clipper: Clipper = new Clipper();
        clipper.AddPaths(this.destPolygons, PolyType.ptSubject, true);

        if (delta > 0) {
            clipper.Execute(ClipType.ctUnion, solution, PolyFillType.pftPositive, PolyFillType.pftPositive);
        } else {
            const r = ClipperOffset.getBounds(this.destPolygons);
            const outer: IntPoint[] = [
                { X: r.left - 10, Y: r.bottom + 10 },
                { X: r.right + 10, Y: r.bottom + 10 },
                { X: r.right + 10, Y: r.top - 10 },
                { X: r.left - 10, Y: r.top - 10 }
            ];

            clipper.AddPath(outer, PolyType.ptSubject, true);
            clipper.ReverseSolution = true;
            clipper.Execute(ClipType.ctUnion, solution, PolyFillType.pftNegative, PolyFillType.pftNegative);

            if (solution.length > 0) {
                solution.splice(0, 1);
            }
        }

        return solution;
    }

    private addPath(path: IntPoint[]): void {
        if (path.length === 0) {
            return;
        }

        let highIndex: number = path.length - 1;
        let i: number = 0;
        let j: number = 0;
        let k: number = 0;

        //strip duplicate points from path and also get index to the lowest point ...
        while (highIndex > 0 && op_Equality(path[0], path[highIndex])) {
            --highIndex;
        }
        //newNode.m_polygon.set_Capacity(highI + 1);
        this.srcPolygon.push(path[0]);

        for (i = 1; i <= highIndex; ++i) {
            if (!op_Equality(this.srcPolygon[j], path[i])) {
                ++j;
                this.srcPolygon.push(path[i]);
                if (
                    path[i].Y > this.srcPolygon[k].Y ||
                    (path[i].Y === this.srcPolygon[k].Y && path[i].X < this.srcPolygon[k].X)
                ) {
                    k = j;
                }
            }
        }

        if (j < 2) {
            return;
        }

        if (this.lowest.X < 0) {
            this.lowest = { X: 0, Y: k };
        } else {
            const ip: IntPoint = this.srcPolygon[this.lowest.Y];

            if (this.srcPolygon[k].Y > ip.Y || (this.srcPolygon[k].Y == ip.Y && this.srcPolygon[k].X < ip.X)) {
                this.lowest = { X: 0, Y: k };
            }
        }
    }

    private doOffset(delta: number): void {
        //if Zero offset, just copy any CLOSED polygons to m_p and return ...
        if (ClipperOffset.nearZero(delta)) {
            //this.m_destPolys.set_Capacity(this.m_polyNodes.ChildCount);

            this.destPolygons.push(this.srcPolygon);
            return;
        }

        //this.m_destPolys.set_Capacity(this.m_polyNodes.ChildCount * 2);
        var len = this.srcPolygon.length;
        if (len === 0 || (delta <= 0 && len < 3)) return;
        this.destPolygon = [];
        if (len == 1) {
            var X = -1,
                Y = -1;
            for (var j = 0; j < 4; ++j) {
                this.destPolygon.push({
                    X: ClipperOffset.round(this.srcPolygon[0].X + X * delta),
                    Y: ClipperOffset.round(this.srcPolygon[0].Y + Y * delta)
                });
                if (X < 0) X = 1;
                else if (Y < 0) Y = 1;
                else X = -1;
            }
            this.destPolygons.push(this.destPolygon);
            return;
        }
        //build m_normals ...
        this.normals.length = 0;
        //this.m_normals.set_Capacity(len);
        for (var j = 0; j < len - 1; ++j) {
            this.normals.push(ClipperOffset.getUnitNormal(this.srcPolygon[j], this.srcPolygon[j + 1]));
        }

        this.normals.push(ClipperOffset.getUnitNormal(this.srcPolygon[len - 1], this.srcPolygon[0]));

        var k = len - 1;
        for (var j = 0; j < len; ++j) {
            k = this.offsetPoint(j, k);
        }
        this.destPolygons.push(this.destPolygon);
    }

    private doSquare(j: number, k: number): void {
        const dx: number = Math.tan(
            Math.atan2(this.sinA, this.normals[k].X * this.normals[j].X + this.normals[k].Y * this.normals[j].Y) / 4
        );
        this.destPolygon.push({
            X: ClipperOffset.round(this.srcPolygon[j].X + this.delta * (this.normals[k].X - this.normals[k].Y * dx)),
            Y: ClipperOffset.round(this.srcPolygon[j].Y + this.delta * (this.normals[k].Y + this.normals[k].X * dx))
        });
        this.destPolygon.push({
            X: ClipperOffset.round(this.srcPolygon[j].X + this.delta * (this.normals[j].X + this.normals[j].Y * dx)),
            Y: ClipperOffset.round(this.srcPolygon[j].Y + this.delta * (this.normals[j].Y - this.normals[j].X * dx))
        });
    }

    private offsetPoint(j: number, k: number): number {
        this.sinA = this.normals[k].X * this.normals[j].Y - this.normals[j].X * this.normals[k].Y;
        if (this.sinA < 0.00005 && this.sinA > -0.00005) return k;
        else if (this.sinA > 1) this.sinA = 1;
        else if (this.sinA < -1) this.sinA = -1;

        if (this.sinA * this.delta < 0) {
            this.destPolygon.push({
                X: ClipperOffset.round(this.srcPolygon[j].X + this.normals[k].X * this.delta),
                Y: ClipperOffset.round(this.srcPolygon[j].Y + this.normals[k].Y * this.delta)
            });
            this.destPolygon.push({ X: this.srcPolygon[j].X, Y: this.srcPolygon[j].Y });
            this.destPolygon.push({
                X: ClipperOffset.round(this.srcPolygon[j].X + this.normals[j].X * this.delta),
                Y: ClipperOffset.round(this.srcPolygon[j].Y + this.normals[j].Y * this.delta)
            });
        } else {
            const r: number = 1 + (this.normals[j].X * this.normals[k].X + this.normals[j].Y * this.normals[k].Y);

            if (r >= 1.8) {
                this.doMiter(j, k, r);
            } else {
                this.doSquare(j, k);
            }
        }

        k = j;
        return k;
    }

    private doMiter(j: number, k: number, r: number): void {
        const q: number = this.delta / r;

        this.destPolygon.push({
            X: ClipperOffset.round(this.srcPolygon[j].X + (this.normals[k].X + this.normals[j].X) * q),
            Y: ClipperOffset.round(this.srcPolygon[j].Y + (this.normals[k].Y + this.normals[j].Y) * q)
        });
    }

    private static getBounds(paths: IntPoint[][]) {
        const pathCount: number = paths.length;
        let i: number = 0;

        while (i !== pathCount && paths[i].length === 0) {
            ++i;
        }

        const result = { left: 0, top: 0, right: 0, bottom: 0 };

        if (i === pathCount) {
            return result;
        }

        result.left = paths[i][0].X;
        result.right = result.left;
        result.top = paths[i][0].Y;
        result.bottom = result.top;

        let j: number = 0;
        let pointCount: number = 0;
        let path: IntPoint[] = null;

        for (; i < pathCount; ++i) {
            path = paths[i];
            pointCount = path.length;
            for (j = 0; j < pointCount; ++j) {
                if (path[j].X < result.left) {
                    result.left = path[j].X;
                } else if (path[j].X > result.right) {
                    result.right = path[j].X;
                }
                if (path[j].Y < result.top) {
                    result.top = path[j].Y;
                } else if (path[j].Y > result.bottom) {
                    result.bottom = path[j].Y;
                }
            }
        }
        return result;
    }

    private static round(a: number): number {
        return a < 0 ? -Math.round(Math.abs(a)) : Math.round(a);
    }

    private static getUnitNormal(point1: IntPoint, point2: IntPoint): IntPoint {
        const result = { X: point2.Y - point1.Y, Y: point1.X - point2.X };

        if (result.X === 0 && result.Y === 0) {
            return result;
        }

        const distance: number = Math.sqrt(result.X * result.X + result.Y * result.Y);

        result.X /= distance;
        result.Y /= distance;

        return result;
    }

    private static nearZero(val: number): boolean {
        return val > -ClipperOffset.tolerance && val < ClipperOffset.tolerance;
    }

    public static create(): ClipperOffset {
        return new ClipperOffset();
    }

    private static tolerance = 1e-20;
}
