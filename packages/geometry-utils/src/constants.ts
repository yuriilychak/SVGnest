export const TOL: number = Math.pow(10, -9);

export const NFP_KEY_INDICES: Uint8Array = new Uint8Array([0, 10, 19, 23, 27, 32]);

export const UINT16_BIT_COUNT: number = 16;

export const NFP_INFO_START_INDEX: number = 2;

function getAngleCache() {
    const result = new Map<number, Float32Array>();
    const maxSplit: number = 16;
    const memSeg: Float32Array = new Float32Array(2);
    let step: number = 0;
    let radianStep: number = 0;
    let radianAngle: number = 0;
    let angle: number = 0;
    let i: number = 0;
    let j: number = 0;

    for (i = 1; i <= maxSplit; ++i) {
        step = Math.round(360 / i);
        radianStep = (2 * Math.PI) / i;

        for (j = 0; j < i; ++j) {
            angle = step * j;

            if (!result.has(angle)) {
                radianAngle = radianStep * j;
                memSeg[0] = Math.sin(radianAngle);
                memSeg[1] = Math.cos(radianAngle);

                result.set(angle, memSeg.slice());
            }
        }
    }

    return result;
}

export const ANGLE_CACHE: Map<number, Float32Array> = getAngleCache();
