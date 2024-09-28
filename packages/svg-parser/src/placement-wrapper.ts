export default class PlacementWrapper {
    private _placement: number;

    private _memSeg: Float64Array;

    private _offset: number;

    private _size: number;

    private _pointData: number;

    private _pointOffset: number;

    private _placementCount: number;

    private _angleSplit: number;

    constructor(memSeg: Float64Array, angleSplit: number) {
        this._angleSplit = angleSplit;
        this._placementCount = memSeg[1];
        this._memSeg = memSeg;
        this._placement = 0;
        this._offset = 0;
        this._size = 0;
        this._pointData = 0;
        this._pointOffset = 0;
    }

    public bindPlacement(index: number): void {
        this._placement = this._memSeg[2 + index];
        this._offset = this._placement >>> 16;
        this._size = this._placement & ((1 << 16) - 1);
    }

    public bindData(index: number): void {
        this._pointData = this._memSeg[this._offset + index];
        this._pointOffset = this._offset + this._size + (index << 1);
    }

    public get placementCount(): number {
        return this._placementCount;
    }

    public get offset(): number {
        return this._offset;
    }

    public get size(): number {
        return this._size;
    }

    public get id(): number {
        return this._pointData >>> 16;
    }

    public get rotation(): number {
        return Math.round(((this._pointData & ((1 << 16) - 1)) * 360) / this._angleSplit);
    }

    public get x(): number {
        return this._memSeg[this._pointOffset];
    }

    public get y(): number {
        return this._memSeg[this._pointOffset + 1];
    }
}
