import { polygonArea, pointInPolygon } from "../../geometry-util";
import FloatPoint from "../../float-point";
import SharedPolygon from "./shared-polygon";

export default class TreePolygon extends SharedPolygon {
  constructor(polygons, configuration, isOffset) {
    super(configuration, polygons);

    if (isOffset) {
      this._offsetTree(this._polygons, this.spacing * 0.5);
    }
  }

  removeDuplicats() {
    let start;
    let end;
    let node;
    let i;
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

  at(index) {
    return this._polygons[index];
  }

  flat(index) {
    const part = this._polygons[index];

    return part.children && part.children.length > 0
      ? TreePolygon.flattenTree(part.children, true)
      : null;
  }

  // offset tree recursively
  _offsetTree(tree, offset) {
    let i = 0;
    let node;
    let offsetPaths;
    const treeSize = tree.length;

    for (i = 0; i < treeSize; ++i) {
      node = tree[i];
      offsetPaths = this._polygonOffset(node, offset);

      if (offsetPaths.length == 1) {
        // replace array items in place
        Array.prototype.splice.apply(
          node,
          [0, node.length].concat(offsetPaths[0])
        );
      }

      if (node.childNodes && node.childNodes.length > 0) {
        this._offsetTree(node.childNodes, -offset);
      }
    }
  }

  get polygons() {
    return this._polygons.slice();
  }

  static flattenTree(tree, hole, result = []) {
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
        flattenTree(children, !hole, result);
      }
    }

    return result;
  }
}
