import { polygonArea } from "../../geometry-util";
import FloatPoint from "../../float-point";
import SharedPolygon from "./shared-polygon";
import { ArrayPolygon, Point, SvgNestConfiguration } from "../../interfaces";

export default class TreePolygon extends SharedPolygon {
  private _polygons: ArrayPolygon[];

  constructor(
    polygons: ArrayPolygon[],
    configuration: SvgNestConfiguration,
    isOffset: boolean
  ) {
    super(configuration);

    this._polygons = polygons;

    if (isOffset) {
      this._offsetTree(this._polygons, this.spacing * 0.5);
    }
  }

  removeDuplicats(): void {
    let start: Point;
    let end: Point;
    let node: ArrayPolygon;
    let i: number = 0;

    // remove duplicate endpoints, ensure counterclockwise winding direction
    for (i = 0; i < this._polygons.length; ++i) {
      node = this._polygons[i];
      start = node[0];
      end = node[node.length - 1];

      if (start === end || FloatPoint.almostEqual(start, end)) {
        node.pop();
      }

      if (polygonArea(node) > 0) {
        node.reverse();
      }
    }
  }

  at(index: number): ArrayPolygon {
    return this._polygons[index];
  }

  flat(index: number) {
    const part = this._polygons[index];

    return part.children && part.children.length > 0
      ? TreePolygon.flattenTree(part.children, true)
      : null;
  }

  // offset tree recursively
  _offsetTree(tree: ArrayPolygon[], offset: number) {
    let i: number = 0;
    let node: ArrayPolygon;
    let offsetPaths: ArrayPolygon[];
    const treeSize: number = tree.length;

    for (i = 0; i < treeSize; ++i) {
      node = tree[i];
      offsetPaths = this._polygonOffset(node, offset);

      if (offsetPaths.length == 1) {
        // replace array items in place
        Array.prototype.splice.apply(
          node,
          //@ts-ignore
          [0, node.length].concat(offsetPaths[0])
        );
      }

      if (node.children && node.children.length > 0) {
        this._offsetTree(node.children, -offset);
      }
    }
  }

  get polygons() {
    return this._polygons.slice();
  }

  static flattenTree(
    tree: ArrayPolygon[],
    hole: boolean,
    result: ArrayPolygon[] = []
  ): ArrayPolygon[] {
    const nodeCount = tree.length;
    let i = 0;
    let node;
    let children;

    for (i = 0; i < nodeCount; ++i) {
      node = tree[i];
      node.hole = hole;
      children = node.children;

      result.push(node);

      if (children && children.length > 0) {
        TreePolygon.flattenTree(children, !hole, result);
      }
    }

    return result;
  }
}
