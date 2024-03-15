export default class Scanbeam {
  public Y: number = 0;
  public Next: Scanbeam = null;

  constructor(y: number, next: Scanbeam = null) {
    this.Y = y;
    this.Next = next;
  }

  public getLast(y: number) {
    let scanbeam: Scanbeam = this;

    while (scanbeam.Next !== null && y <= scanbeam.Next.Y) {
      scanbeam = scanbeam.Next;
    }

    return scanbeam;
  }

  public insert(y: number) {
    if (y > this.Y) {
      return new Scanbeam(y, this);
    }

    let scanbeam: Scanbeam = this;

    while (scanbeam.Next !== null && y <= scanbeam.Next.Y) {
      scanbeam = scanbeam.Next;
    }

    if (y !== scanbeam.Y) {
      //ie ignores duplicates
      scanbeam.Next = new Scanbeam(y, scanbeam.Next);
    }

    return this;
  }

  public static insert(parent: Scanbeam, y: number) {
    return parent === null ? new Scanbeam(y) : parent.insert(y);
  }
}
