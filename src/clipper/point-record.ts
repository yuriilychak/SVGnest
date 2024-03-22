import { Point } from "../geom";
import { Direction } from "./enums";

export default class PointRecord<T extends Point> {
  private _next: T | null;
  private _prev: T | null;

  constructor(prev: T | null = null, next: T | null = null) {
    this._next = prev;
    this._prev = next;
  }

  public getByFlag(isClockwise: boolean): T | null {
    return isClockwise ? this._next : this._prev;
  }

  public getByFlagUnsafe(isClockwise: boolean): T {
    return this.getByFlag(isClockwise) as T;
  }

  public getByDirection(direction: Direction): T | null {
    return this.getByFlag(direction == Direction.LeftToRight);
  }

  public update(prev: T | null, next: T | null): void {
    this._prev = prev;
    this._next = next;
  }

  public clean() {
    this._prev = null;
    this._next = null;
  }

  public get unsafeNext(): T {
    return this._next as T;
  }

  public get unsafePev(): T {
    return this._prev as T;
  }

  public get next(): T | null {
    return this._next;
  }

  public set next(value: T | null) {
    this._next = value;
  }

  public get prev(): T | null {
    return this._prev;
  }

  public set prev(value: T | null) {
    this._prev = value;
  }

  public get hasPrev(): boolean {
    return this._prev !== null;
  }

  public get hasNext(): boolean {
    return this._next !== null;
  }

  public get isLooped(): boolean {
    return this._prev === this._next;
  }

  public get isEmpty(): boolean {
    return this._next === null && this._prev === null;
  }
}
