import { polygonArea } from "../../geometry-util";
import FloatPoint from "../../float-point";
import SharedPolygon from "./shared-polygon";
import { ArrayPolygon, Point, SvgNestConfiguration } from "../../interfaces";

export default class TreePolygon extends SharedPolygon {
  constructor(
    polygons: Array<ArrayPolygon>,
    configuration: SvgNestConfiguration,
    isOffset: boolean = false
  ) {
    super(configuration, polygons);

    if (isOffset) {
      this._offsetTree(this._polygons, this.spacing * 0.5);
    }
  }

  removeDuplicats() {
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

  flat(index: number): Array<ArrayPolygon> | null {
    const part: ArrayPolygon = this._polygons[index];

    return part.children && part.children.length > 0
      ? TreePolygon.flattenTree(part.children, true)
      : null;
  }

  // offset tree recursively
  _offsetTree(tree: Array<ArrayPolygon>, offset: number) {
    let i = 0;
    let node: ArrayPolygon;
    let offsetPaths: Array<ArrayPolygon>;
    const treeSize = tree.length;

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

      if (node.childNodes && node.childNodes.length > 0) {
        this._offsetTree(node.childNodes, -offset);
      }
    }
  }

  static flattenTree(
    tree: Array<ArrayPolygon>,
    hole: boolean,
    result: Array<ArrayPolygon> = []
  ): Array<ArrayPolygon> {
    const nodeCount: number = tree.length;
    let i: number = 0;
    let node: ArrayPolygon;
    let children: Array<ArrayPolygon>;

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
