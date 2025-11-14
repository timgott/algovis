import { Graph } from "../../localgraphs/src/graph"
import { Rect } from "../../shared/rectangle"
import { ensured } from "../../shared/utils"
import { Vector } from "../../shared/vector"
import { DataState, MainPainter, UiNodeData } from "./ui"

export type LibraryEntry = {
    name: string,
    graph: Graph<UiNodeData>
}

function zoomCanvasToFit(ctx: CanvasRenderingContext2D, points: Iterable<Vector>) {
    let contentRect = Rect.pad(Rect.fromPoints(points), 20)
    console.log(contentRect)
    ctx.resetTransform()
    let scaleX = ctx.canvas.width / Rect.width(contentRect)
    let scaleY = ctx.canvas.height / Rect.height(contentRect)
    let scale = Math.min(scaleX, scaleY, 1)
    let contentCenter = Rect.center(contentRect)
    console.log(scale)
    // YES THIS ORDER IS RIGHT AND DON'T ASK WHY
    ctx.scale(scale, scale)
    ctx.translate(-contentCenter.x, -contentCenter.y)
    ctx.translate(ctx.canvas.width / 2 / scale, ctx.canvas.height / 2 / scale)
}

export class LibraryController {
    lib: LibraryEntry[] = []

    constructor(private template: HTMLTemplateElement, private root: HTMLElement) {
    }

    instantiateTemplate() {
        return this.template.content.cloneNode(true) as HTMLElement
    }

    createEntryHTML(entry: LibraryEntry) {
        let elem = this.instantiateTemplate()
        this.updateEntryHTML(elem, entry)
        return elem
    }

    paintEntry(ctx: CanvasRenderingContext2D, entry: LibraryEntry) {
        zoomCanvasToFit(ctx, entry.graph.nodes)
        let painter = new MainPainter(16)
        painter.drawGraph(ctx, entry.graph, new Set())
    }

    updateEntryHTML(elem: HTMLElement, entry: LibraryEntry) {
        let captionElem = ensured(elem.querySelector(".caption"))
        let canvas = ensured(elem.querySelector("canvas"))
        captionElem.textContent = entry.name
        let ctx = canvas.getContext("2d")
        if (ctx !== null) {
            this.paintEntry(ctx, entry)
        } else {
            console.warn("getting canvas context failed")
        }
    }

    rebuild() {
        // improvement: update instead of rebuilding?
        this.root.replaceChildren(...this.lib.map(x => this.createEntryHTML(x)))
    }

    addToLibrary(entry: LibraryEntry) {
        this.lib.push(entry)
        this.rebuild()
    }
}
