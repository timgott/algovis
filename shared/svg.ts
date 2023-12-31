export type SVGAttrs = { [x: string]: any; }

export function createSvgNode<T extends keyof SVGElementTagNameMap>(
    parent: Element | null,
    tag: T,
    attrs: SVGAttrs = {})
    : SVGElementTagNameMap[T]
{
    let element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    setSvgAttributes(element, attrs);
    parent?.appendChild(element);
    return element
}

export function setSvgAttributes(
    element: SVGElement,
    attrs: SVGAttrs)
{
    for (let key in attrs) {
        element.setAttribute(key, attrs[key]);
    }
}