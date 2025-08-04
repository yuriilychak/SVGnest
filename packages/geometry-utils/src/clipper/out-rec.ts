import { UNASSIGNED } from './constants';

export default class OutRec {
    public readonly index: number;
    public currentIndex: number;
    public isHole: boolean;
    public firstLeftIndex: number;
    public pointIndex: number;

    constructor(index: number, pointIndex: number) {
        this.index = index;
        this.currentIndex = index;
        this.isHole = false;
        this.firstLeftIndex = UNASSIGNED;
        this.pointIndex = pointIndex;
    }
}
