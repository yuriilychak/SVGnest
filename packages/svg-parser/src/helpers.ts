export function getFloatAtrribute(element: SVGElement, key: string): number {
    return parseFloat(element.getAttribute(key)) || 0;
}
