import OutPt from "./out-pt";



export class OutPtList {
    private _index: number = 0;
    private _points: OutPt[];

    constructor(index: number = 0) {
        this._index = index;
        this._points = [];
    }

    public get index(): number {
        return this._index;
    }
}