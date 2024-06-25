import { SVGPathSeg } from '../svg-path-seg';
import Source from './source';

export default class SVGPathSegList {
    #pathElement: SVGPathElement;

    #observerConfig: MutationObserverInit;

    #observer: MutationObserver;

    #list: SVGPathSeg[];

    public constructor(pathElement: SVGPathElement) {
        this.#pathElement = pathElement;
        this.#list = this.parsePath(this.#pathElement.getAttribute('d'));

        // Use a MutationObserver to catch changes to the path's "d" attribute.
        this.#observerConfig = { attributes: true, attributeFilter: ['d'] };
        this.#observer = new MutationObserver(this.updateListFromPathMutations.bind(this));
        this.#observer.observe(this.#pathElement, this.#observerConfig);
    }

    // Process any pending mutations to the path element and update the list as needed.
    // This should be the first call of all public functions and is needed because
    // MutationObservers are not synchronous so we can have pending asynchronous mutations.
    public checkPathSynchronizedToList(): void {
        this.updateListFromPathMutations(this.#observer.takeRecords());
    }

    public updateListFromPathMutations(mutationRecords: MutationRecord[]): void {
        if (!this.#pathElement) {
            return;
        }

        const hasPathMutations = mutationRecords.some(record => record.attributeName === 'd');

        if (hasPathMutations) {
            this.#list = this.parsePath(this.#pathElement.getAttribute('d'));
        }
    }

    // Serialize the list and update the path's 'd' attribute.
    public writeListToPath(): void {
        this.#observer.disconnect();
        this.#pathElement.setAttribute('d', SVGPathSegList.pathSegArrayAsString(this.#list));
        this.#observer.observe(this.#pathElement, this.#observerConfig);
    }

    // When a path segment changes the list needs to be synchronized back to the path element.
    public segmentChanged(): void {
        this.writeListToPath();
    }

    public clear(): void {
        this.checkPathSynchronizedToList();

        this.#list.forEach(segment => {
            segment.owningPathSegList = null;
        });
        this.#list = [];

        this.writeListToPath();
    }

    public initialize(item: SVGPathSeg): SVGPathSeg {
        this.checkPathSynchronizedToList();

        this.#list = [item];
        item.owningPathSegList = this;
        this.writeListToPath();

        return item;
    }

    public checkValidIndex(index: number): void {
        if (isNaN(index) || index < 0 || index >= this.numberOfItems) {
            throw new Error('INDEX_SIZE_ERR');
        }
    }

    public getItem(index: number): SVGPathSeg {
        this.checkPathSynchronizedToList();

        this.checkValidIndex(index);

        return this.#list[index];
    }

    public insertItemBefore(item: SVGPathSeg, index: number): SVGPathSeg {
        this.checkPathSynchronizedToList();

        // Spec: If the index is greater than or equal to numberOfItems, then the new item is appended to the end of the list.
        const resultIndex: number = Math.min(index, this.numberOfItems);
        // SVG2 spec says to make a copy.
        const result: SVGPathSeg = item.owningPathSegList ? item.clone() : item;
        this.#list.splice(resultIndex, 0, result);
        result.owningPathSegList = this;
        this.writeListToPath();

        return result;
    }

    public replaceItem(item: SVGPathSeg, index: number): SVGPathSeg {
        this.checkPathSynchronizedToList();

        // SVG2 spec says to make a copy.
        const result: SVGPathSeg = item.owningPathSegList ? item.clone() : item;
        this.checkValidIndex(index);
        this.#list[index] = item;
        result.owningPathSegList = this;
        this.writeListToPath();

        return result;
    }

    public removeItem(index: number): SVGPathSeg {
        this.checkPathSynchronizedToList();

        this.checkValidIndex(index);
        const item: SVGPathSeg = this.#list[index];
        this.#list.splice(index, 1);
        this.writeListToPath();

        return item;
    }

    public appendItem(segment: SVGPathSeg): SVGPathSeg {
        this.checkPathSynchronizedToList();

        const result: SVGPathSeg = segment.owningPathSegList ? segment.clone() : segment;
        this.#list.push(result);
        result.owningPathSegList = this;

        this.writeListToPath();

        return result;
    }

    // This closely follows SVGPathParser::parsePath from Source/core/svg/SVGPathParser.cpp.
    private parsePath(path: string): SVGPathSeg[] {
        if (!path) {
            return [];
        }

        const result: SVGPathSeg[] = [];
        const source: Source = new Source(path);

        if (!source.initialCommandIsMoveTo) {
            return [];
        }

        let segment: SVGPathSeg = null;

        while (source.hasMoreData) {
            segment = source.parseSegment(this);

            if (segment !== null) {
                return [];
            }
            result.push(segment);
        }

        return result;
    }

    public get numberOfItems(): number {
        this.checkPathSynchronizedToList();

        return this.#list.length;
    }

    private static pathSegArrayAsString(segments: SVGPathSeg[]): string {
        return segments.map(segment => segment.asPathString()).join(' ');
    }
}
