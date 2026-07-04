import { parseLinkedList, parsePath } from "../semantics/parse_path"

export const LABEL_DOM_ROOT = "ROOT"

export const LABEL_DOM_PARENT = "parent"
export const LABEL_DOM_CHILD = "child"
export const LABEL_DOM_CLASSES = "class"
export const LABEL_DOM_TEXT = "text"

export const LABEL_DOM_ORDER_BEFORE = "before"
export const LABEL_DOM_ORDER_AFTER = "after"
export const listLabelOrder = [LABEL_DOM_ORDER_BEFORE, LABEL_DOM_ORDER_AFTER, null]

export const LABEL_DOM_ORDER_THEN = "then"
export const listLabelOrderSimple = [LABEL_DOM_ORDER_THEN, null]

export function* parseDomElementList<V>(graph: LabeledGraph<V,string> & LabeledNeighborAccessor<V, string>, root: V): Generator<Element> {
    yield* parseLinkedList(listLabelOrder, graph, root).map(v => parseDomElement(graph, v))
}

export function parseDomElement<V, G>(graph: LabeledGraph<V,string> & LabeledNeighborAccessor<V,string>, root: V): Element {
    const tag = graph.label(root)

    let childElements = parsePath([LABEL_DOM_PARENT, LABEL_DOM_CHILD, null], graph, root)
        .flatMap(child => parseDomElementList(graph, child))
    let classes = parsePath([LABEL_DOM_CLASSES, null], graph, root).map(classNode => graph.label(classNode))
    let texts = parsePath([LABEL_DOM_TEXT, null], graph, root)
        .flatMap(child => parseLinkedList(listLabelOrder, graph, child))
        .map(textNode => graph.label(textNode)).toArray()

    let element = document.createElement(tag)
    element.classList.add(...classes)
    let textNode = document.createTextNode(texts.join(" "))
    element.replaceChildren(textNode, ...childElements)
    return element
}
