import { NullPtr } from './types';

export default class Scanbeam {
    public Y: number;
    public Next: Scanbeam;

    constructor(y: number = 0, next: NullPtr<Scanbeam> = null) {
        this.Y = y;
        this.Next = next;
    }

    public static insert(y: number, inputScanbeam: NullPtr<Scanbeam>): Scanbeam {
        if (inputScanbeam === null) {
            return new Scanbeam(y);
        }
        if (y > inputScanbeam.Y) {
            return new Scanbeam(y, inputScanbeam);
        }

        let scanbeam: Scanbeam = inputScanbeam;

        while (scanbeam.Next !== null && y <= scanbeam.Next.Y) {
            scanbeam = scanbeam.Next;
        }

        if (y !== scanbeam.Y) {
            //ie ignores duplicates
            scanbeam.Next = new Scanbeam(y, scanbeam.Next);
        }

        return inputScanbeam;
    }
}
