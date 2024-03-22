import { Point } from "../geom";
import { Direction } from "./enums";

export default class PointRecord<T extends Point> {
  private _next: T | null;
  private _prev: T | null;

  constructor() {
    this._next = null;
    this._prev = null;
  }

  public getNext(direction: Direction): T | null {
    return direction == Direction.LeftToRight ? this._next : this._prev;
  }

  public update(prev: T | null, next: T | null): void {
    this._prev = prev;
    this._next = next;
  }

  public clean(): void {
    this._prev = null;
    this._next = null;
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
