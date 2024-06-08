export function getNewSegment(path, points, segment, command) {
    switch (command) {
        case 'm':
            return path.createSVGPathSegMovetoAbs(points[0].x, points[0].y);
        case 'l':
            return path.createSVGPathSegLinetoAbs(points[0].x, points[0].y);
        case 'h':
            return path.createSVGPathSegLinetoHorizontalAbs(points[0].x);
        case 'v':
            return path.createSVGPathSegLinetoVerticalAbs(points[0].y);
        case 'c':
            return path.createSVGPathSegCurvetoCubicAbs(
                points[0].x,
                points[0].y,
                points[1].x,
                points[1].y,
                points[2].x,
                points[2].y
            );
        case 's':
            return path.createSVGPathSegCurvetoCubicSmoothAbs(
                points[0].x,
                points[0].y,
                points[2].x,
                points[2].y
            );
        case 'q':
            return path.createSVGPathSegCurvetoQuadraticAbs(
                points[0].x,
                points[0].y,
                points[1].x,
                points[1].y
            );
        case 't':
            return path.createSVGPathSegCurvetoQuadraticSmoothAbs(
                points[0].x,
                points[0].y
            );
        case 'a':
            return path.createSVGPathSegArcAbs(
                points[0].x,
                points[0].y,
                segment.r1,
                segment.r2,
                segment.angle,
                segment.largeArcFlag,
                segment.sweepFlag
            );
        default:
            return null;
    }
}
