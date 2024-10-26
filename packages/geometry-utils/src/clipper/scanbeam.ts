export default class Scanbeam {
    public Y: number;
    public Next: Scanbeam;

    constructor() {
        this.Y = 0;
        this.Next = null;
    }
}
