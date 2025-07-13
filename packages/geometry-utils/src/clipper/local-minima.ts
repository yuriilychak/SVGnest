export default class LocalMinima {
    public y: number = 0;
    public leftBound: number;
    public rightBound: number;

    constructor(y: number, leftBound: number, rightBound: number) {
        this.y = y;
        this.leftBound = leftBound;
        this.rightBound = rightBound;
    }
}
