import { UNASSIGNED } from './constants';

export default class OutRec {
    public readonly index: number;
    public currentIndex: number;
    public firstLeftIndex: number;

    constructor(index: number) {
        this.index = index;
        this.currentIndex = index;
        this.firstLeftIndex = UNASSIGNED;
    }
}
