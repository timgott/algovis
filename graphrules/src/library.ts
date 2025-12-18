import { Graph } from "../../localgraphs/src/graph"
import { initRepaintOnResize } from "../../shared/canvas"
import { Rect } from "../../shared/rectangle"
import { ensured } from "../../shared/utils"
import { Vector } from "../../shared/vector"
import { UiNodeData } from "./viewmodel/state"
import { MainPainter } from "./painter"

export type LibraryEntry = {
    name: string,
    graph: Graph<UiNodeData>
}

function zoomCanvasToFit(ctx: CanvasRenderingContext2D, points: Iterable<Vector>) {
    const padding = 30;
    let contentRect = Rect.pad(Rect.fromPoints(points), padding)
    ctx.resetTransform()
    let scaleX = ctx.canvas.width / Rect.width(contentRect)
    let scaleY = ctx.canvas.height / Rect.height(contentRect)
    let scale = Math.min(scaleX, scaleY, 1)
    let contentCenter = Rect.center(contentRect)
    // YES THIS ORDER IS RIGHT AND DON'T ASK WHY
    ctx.scale(scale, scale)
    ctx.translate(-contentCenter.x, -contentCenter.y)
    ctx.translate(ctx.canvas.width / 2 / scale, ctx.canvas.height / 2 / scale)
}

type LibraryEntryHTML = {
    caption: Element
    canvas: HTMLCanvasElement
    canvasContainer: Element
    root: HTMLElement
}

export class LibraryController {
    lib: LibraryEntry[] = []

    constructor(private template: HTMLTemplateElement, private root: HTMLElement, private painter: MainPainter) {
    }

    instantiateTemplate(): LibraryEntryHTML {
        let root = this.template.content.cloneNode(true) as HTMLElement
        let caption = ensured(root.querySelector(".caption"))
        let canvas = ensured(root.querySelector("canvas"))
        let canvasContainer = ensured(root.querySelector(".canvas_container"))
        return { root, caption, canvas, canvasContainer }
    }

    paintEntry(canvas: HTMLCanvasElement, entry: LibraryEntry) {
        let ctx = canvas.getContext("2d")
        if (ctx === null) {
            console.error("getting canvas context failed")
            return
        }
        zoomCanvasToFit(ctx, entry.graph.nodes)
        this.painter.drawGraph(ctx, entry.graph, new Set())
    }

    createEntryHTML(entry: LibraryEntry) {
        // will forever draw exactly this entry
        let html = this.instantiateTemplate()
        html.caption.textContent = entry.name
        initRepaintOnResize(html.canvas, html.canvasContainer, () => {
            this.paintEntry(html.canvas, entry)
        })
        return html
    }

    rebuild() {
        // improvement: update instead of rebuilding?
        this.root.replaceChildren(...this.lib.map(x => this.createEntryHTML(x).root))
    }

    addToLibrary(entry: LibraryEntry) {
        this.lib.push(entry)
        this.rebuild()
    }
}
