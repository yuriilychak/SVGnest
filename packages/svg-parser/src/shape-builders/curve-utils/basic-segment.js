export default class BasicSegment {
    #points;
    #tolerance;

    constructor({ point1, point2 }, tolerance) {
        this.#points = [point1, point2];
        this.#tolerance = tolerance;
    }

    get point1() {
        return this.#points[0];
    }

    get point2() {
        return this.#points[1];
    }

    get tolerance() {
        return this.#tolerance;
    }

    get isFlat() {
        return false;
    }

    subdivide() {
        return [];
    }

    export(index) {
        const point = this.#points[index];

        return { x: point.x, y: point.y };
    }

    static getMidPoint(point1, point2) {
        return {
            x: (point1.x + point2.x) * 0.5,
            y: (point1.y + point2.y) * 0.5
        };
    }

    static linearizeCurve(instance) {
        const result = []; // list of points to return
        const todo = [instance]; // list of Beziers to divide
        let segment = null;
        let divided = null;

        // recursion could stack overflow, loop instead

        while (todo.length > 0) {
            segment = todo[0];

            if (segment.isFlat) {
                // reached subdivision limit
                result.push(segment.export(1));
                todo.shift();
            } else {
                divided = segment.subdivide();
                todo.splice(0, 1, ...divided);
            }
        }

        return result;
    }

    // eslint-disable-next-line
    static lineraize(data, tolerance) {
        return [];
    }
}
