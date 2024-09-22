import { INode, stringify } from 'svgson';

import formatSVG from './format-svg';
import { IClipperWrapper, IPoint, IPolygon, NestConfig, SVG_TAG } from './types';
import { convertElement, flattenTree, polygonArea } from './helpers';
import SHAPE_BUILDERS from './shape-builders';

export default class SVGParser {
    #svgRoot: INode = null;

    #bin: INode = null;

    #binPolygon: IPolygon = null;

    #parts: INode[] = null;

    public init(svgString: string): void {
        this.#svgRoot = formatSVG(svgString);
    }

    public getTree(configuration: NestConfig, clipperWrapper: IClipperWrapper): IPolygon[] {
        const { curveTolerance } = configuration;
        this.#parts = this.#svgRoot.children.filter(node => node.attributes.guid !== this.#bin.attributes.guid);
        this.#binPolygon = this.clearPolygon(this.#bin, curveTolerance, clipperWrapper);

        const nodeCount = this.#parts.length;
        const trashold = curveTolerance * curveTolerance;
        const polygons = [];
        let polygon: IPolygon = null;
        let i: number = 0;

        for (i = 0; i < nodeCount; ++i) {
            polygon = this.clearPolygon(this.#parts[i], curveTolerance, clipperWrapper);

            if (polygon && polygon.length > 2 && Math.abs(polygonArea(polygon)) > trashold) {
                polygon.source = i;
                polygon.children = [];
                polygons.push(polygon);
            } else {
                console.warn('Can not parse polygon', this.#parts[i]);
            }
        }

        clipperWrapper.generateTree(polygons);

        return polygons;
    }

    public setBin(element: SVGElement): void {
        this.#bin = convertElement(element);
    }

    public get svgAttributes(): { [key: string]: string } {
        return this.#svgRoot.attributes;
    }

    private clearPolygon(element: INode, tolerance: number, clipperWrapper: IClipperWrapper): IPolygon {
        const tagName: SVG_TAG = element.name as SVG_TAG;

        if (!SHAPE_BUILDERS.has(tagName)) {
            return [] as IPolygon;
        }

        const rawPolygon: IPoint[] = SHAPE_BUILDERS.get(tagName)
            .create(element, tolerance, SVGParser.SVG_TOLERANCE)
            .getResult();

        return clipperWrapper.cleanPolygon(rawPolygon) as IPolygon;
    }

    // returns an array of SVG elements that represent the placement, for export or rendering
    public applyPlacement({
        placementsData,
        tree,
        bounds,
        angleSplit
    }: {
        placementsData: Float64Array;
        tree: IPolygon[];
        bounds: { x: number; y: number; width: number; height: number };
        angleSplit: number;
    }): string {
        const clone: INode[] = [];
        const partCount: number = this.#parts.length;
        const placementCount: number = placementsData[1];
        const svglist: INode[] = [];
        let i: number = 0;
        let j: number = 0;
        let k: number = 0;
        let newSvg: INode = null;
        let binClone: INode = null;
        let part: IPolygon = null;
        let partGroup: INode = null;
        let flattened: { polygons: IPolygon[]; holes: number[] } = null;
        let c: INode = null;
        let id: number = 0;
        let rotation: number = 0;
        let placementData: number = 0;
        let offset: number = 0;
        let size: number = 0;

        for (i = 0; i < partCount; ++i) {
            clone.push(JSON.parse(JSON.stringify(this.#parts[i])) as INode);
        }

        for (i = 0; i < placementCount; ++i) {
            newSvg = {
                name: 'svg',
                type: 'element',
                value: '',
                attributes: {},
                children: []
            };

            newSvg.attributes.viewBox = `0 0 ${bounds.width} ${bounds.height}`;
            newSvg.attributes.width = `${bounds.width}px`;
            newSvg.attributes.height = `${bounds.height}px`;

            binClone = JSON.parse(JSON.stringify(this.#bin)) as INode;
            binClone.attributes.id = 'exportRoot';

            binClone.attributes.transform = `translate(${-bounds.x} ${-bounds.y})`;
            newSvg.children.push(binClone);

            placementData = placementsData[2 + i];
            offset = placementData >>> 16;
            size = placementData - (offset << 16);

            for (j = 0; j < size; ++j) {
                id = placementsData[offset + j] >> 16;
                rotation = placementsData[offset + j] - (id << 16);
                part = tree[id];

                partGroup = {
                    name: 'g',
                    type: 'element',
                    value: '',
                    attributes: {},
                    children: []
                };
                // the original path could have transforms and stuff on it, so apply our transforms on a group
                partGroup.attributes.transform = `translate(${placementsData[offset + size + (j << 1)]} ${placementsData[offset + size + (j << 1) + 1]}) rotate(${Math.round((rotation * 360) / angleSplit)})`;
                partGroup.attributes.id = 'exportContent';
                partGroup.children.push(clone[part.source]);

                if (part.children && part.children.length > 0) {
                    flattened = flattenTree(part.children, true);

                    for (k = 0; k < flattened.polygons.length; ++k) {
                        c = clone[flattened.polygons[k].source];
                        // add class to indicate hole
                        if (
                            flattened.holes.includes(flattened.polygons[k].source) &&
                            (!c.attributes.class || c.attributes.class.indexOf('hole') < 0)
                        ) {
                            c.attributes.class = `${c.attributes.class} hole`;
                        }
                        partGroup.children.push(c);
                    }
                }

                newSvg.children.push(partGroup);
            }

            svglist.push(newSvg);
        }

        const resultSvg: INode =
            svglist.length === 1 ? svglist[0] : { ...(JSON.parse(JSON.stringify(newSvg)) as INode), children: svglist };

        return stringify(resultSvg);
    }

    public get svgString(): string {
        return stringify(this.#svgRoot);
    }

    public get binPolygon(): IPolygon {
        return this.#binPolygon;
    }

    private static SVG_TOLERANCE: number = 0.005; // fudge factor for browser inaccuracy in SVG unit handling
}
