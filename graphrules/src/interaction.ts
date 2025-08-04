import { filteredGraphView, Graph, GraphNode } from "../../localgraphs/src/graph"
import { InteractiveSystem, PointerId, AnimationFrame, SleepState, MouseDownResponse } from "../../localgraphs/src/interaction/controller"
import { GraphInteraction, GraphPainter } from "../../localgraphs/src/interaction/graphsim"
import { LayoutPhysics } from "../../localgraphs/src/interaction/physics"
import { UndoHistory } from "../../localgraphs/src/interaction/undo"
import { calcWindowResizeArea, calcWindowTitleArea, WindowBounds } from "../../localgraphs/src/interaction/windows"
import { Rect } from "../../shared/rectangle"
import { ensured, unreachable } from "../../shared/utils"
import { distance, isDistanceLess, vec, vecsub, Vector } from "../../shared/vector"

// generalization to localgraphs interaction model
// TODO: merge both and put into shared

type MouseClickOrDragResponse<T> = "Click" | "Ignore" | MouseDragInteraction<T>

export type MouseInteraction<T> = (state: T, mouseX: number, mouseY: number) => MouseClickOrDragResponse<T>

export interface MouseDragInteraction<T> {
    dragStep?(state: T, mouseX: number, mouseY: number, deltaTime: number): void
    dragDraw?(state: T, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, deltaTime: number): void
    mouseUp?(state: T, mouseX: number, mouseY: number): void
}

class MapDragInteraction<S, T> implements MouseDragInteraction<S> {
    constructor(private f: (state: S) => T, private readonly interaction: MouseDragInteraction<T>) {
    }
    dragStep(state: S, mouseX: number, mouseY: number, deltaTime: number): void {
        if (this.interaction.dragStep) {
            this.interaction.dragStep(this.f(state), mouseX, mouseY, deltaTime)
        }
    }
    dragDraw(state: S, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, deltaTime: number): void {
        if (this.interaction.dragDraw) {
            this.interaction.dragDraw(this.f(state), mouseX, mouseY, drawCtx, deltaTime)
        }
    }
    mouseUp(state: S, mouseX: number, mouseY: number): void {
        if (this.interaction.mouseUp) {
            this.interaction.mouseUp(this.f(state), mouseX, mouseY)
        }
    }
}

export function mapTool<S, T>(f: (state: S) => T, interaction: (state: S) => MouseInteraction<T>): MouseInteraction<S> {
    return (state: S, mouseX: number, mouseY: number): MouseClickOrDragResponse<S> => {
        let response = interaction(state)(f(state), mouseX, mouseY)
        if (response === "Ignore" || response === "Click") {
            return response
        } else {
            return new MapDragInteraction(f, response)
        }
    }
}

export function nestedGraphTool<S, T>(f: (state: S) => Graph<T>, tool: (state: S) => GraphInteraction<T>): MouseInteraction<S> {
    return (state: S, mouseX: number, mouseY: number): MouseClickOrDragResponse<S> => {
        let interaction = tool(state)
        {
            let graph = f(state)
            interaction.mouseDown(graph, graph.nodes, mouseX, mouseY)
        }
        return {
            dragStep(state: S, mouseX: number, mouseY: number, deltaTime: number): void {
                let graph = f(state)
                interaction.dragStep(graph, graph.nodes, mouseX, mouseY, deltaTime)
            },
            dragDraw(state: S, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, deltaTime: number): void {
                if (interaction.dragDraw) {
                    let graph = f(state)
                    interaction.dragDraw(graph, graph.nodes, mouseX, mouseY, drawCtx, deltaTime)
                }
            },
            mouseUp(state: S, mouseX: number, mouseY: number): void {
                let graph = f(state)
                interaction.mouseUp(graph, graph.nodes, mouseX, mouseY)
            }
        }
    }
}

export function wrapToolWithHistory<T>(undoHistory: UndoHistory<T>, tool: MouseInteraction<T>): MouseInteraction<T> {
    return (state: T, mouseX: number, mouseY: number): MouseClickOrDragResponse<T> => {
        // could be improved by not pushing a snapshot on "Ignore" response (e.g. call undo on ignore?)
        let copy = undoHistory.clone(state)
        let response = tool(state, mouseX, mouseY)
        if (response !== "Ignore") {
            undoHistory.pushAlreadyCloned(copy)
        }
        return response
    }
}

export class ToolController<S> implements InteractiveSystem {
    private interactions: Map<PointerId, MouseDragInteraction<S>> = new Map()

    constructor(
        private getState: () => S,
        private tool: MouseInteraction<S> | null = null
    ) {
    }

    // mode is a constructor to enable multitouch
    setTool(tool: MouseInteraction<S> | null) {
        this.tool = tool
    }

    update({dt, width, height, dragState}: AnimationFrame): SleepState {
        for (let [id, pointerState] of dragState) {
            const drag = this.interactions.get(id)
            if (drag !== undefined && drag.dragStep) {
                drag.dragStep(this.getState(), pointerState.x, pointerState.y, dt)
            }
        }
        return "Sleeping" // moving a tool doesn't necessarily force the system to keep running
    }

    draw(frame: AnimationFrame, ctx: CanvasRenderingContext2D): void {
        for (let [id, pointerState] of frame.dragState) {
            const drag = this.interactions.get(id)
            if (drag !== undefined && drag.dragDraw) {
                drag.dragDraw(this.getState(), pointerState.x, pointerState.y, ctx, frame.dt)
            }
        }
    }

    mouseDown(x: number, y: number, pointerId: PointerId): MouseDownResponse {
        // start dragging node
        if (this.tool !== null) {
            const response = this.tool(this.getState(), x, y)
            if (response === "Ignore" || response === "Click") {
                return response
            } else {
                const drag: MouseDragInteraction<S> = response
                this.interactions.set(pointerId, drag)
                return "Drag"
            }
        }
        return "Ignore"
    }

    dragEnd(x: number, y: number, pointerId: PointerId): void {
        // stop dragging node
        const drag = this.interactions.pop(pointerId)
        if (drag !== undefined && drag.mouseUp) {
            drag.mouseUp(this.getState(), x, y)
        }
    }
}

export class OnlyGraphPhysicsSimulator<T> implements InteractiveSystem {
    constructor(
      private getGraph: () => Graph<T>,
      private layout: LayoutPhysics<T>,
    ) {
    }

    update({dt, width, height}: AnimationFrame): SleepState {
        let activeCount = 0
        activeCount = this.layout.step(this.getGraph(), width, height, dt)
        if (activeCount > 0 || dt == 0) {
            return "Running"
        } else {
            return "Sleeping"
        }
    }

    draw(frame: AnimationFrame, ctx: CanvasRenderingContext2D): void {
        // doesn't draw the graph!
    }

    mouseDown(x: number, y: number, pointerId: PointerId): MouseDownResponse {
        return "Ignore"
    }

    dragEnd(x: number, y: number, pointerId: PointerId): void {
    }
}

export interface StatePainter<S> {
    draw(ctx: CanvasRenderingContext2D, state: S, frame: AnimationFrame): unknown
}

export class PaintingSystem<S> implements InteractiveSystem {
    constructor(private getState: () => S, private painter: StatePainter<S>) {}

    update(frame: AnimationFrame): SleepState {
        return "Sleeping"
    }

    draw(frame: AnimationFrame, ctx: CanvasRenderingContext2D): void {
        this.painter.draw(ctx, this.getState(), frame)
    }

    mouseDown(x: number, y: number, pointerId: PointerId): MouseDownResponse {
        return "Ignore"
    }

    dragEnd(x: number, y: number, pointerId: PointerId): void {
    }
}

function makeDeltaDrag(mx: number, my: number, f: (dx: number, dy: number, dt: number) => unknown): MouseDragInteraction<unknown> {
    let start = {x: mx, y: my}
    let last = start
    return {
        dragStep(state, mx, my, dt) {
            let m = {x: mx, y: my}
            const d = vecsub(m, last)
            f(d.x, d.y, dt)
            last = {x: mx, y: my}
        },
    }
}

export type WindowEventHandler<T extends WindowBounds> = {
    moveWindow?: (window: T, dx: number, dy: number) => unknown
    clickWindow?: (window: T) => unknown
}

export function makeWindowMovingTool<T extends WindowBounds>(events: WindowEventHandler<T>): MouseInteraction<T[]> {
    return function (windows: T[], mouseX: number, mouseY: number): MouseClickOrDragResponse<T[]> {
        for (let window of windows) {
            let hit: "move" | "resize" | null = null
            let resizeArea = calcWindowResizeArea(window.bounds)
            if (Rect.contains(resizeArea, mouseX, mouseY)) {
                hit = "resize"
            }
            let titleArea = calcWindowTitleArea(window.bounds)
            if (Rect.contains(titleArea, mouseX, mouseY)) {
                hit = "move"
            }
            if (hit !== null) {
                events.clickWindow?.(window)
                return makeDeltaDrag(mouseX, mouseY, (dx, dy) => {
                    if (hit === "move") {
                        window.bounds = Rect.addOffset(window.bounds, dx, dy)
                        events.moveWindow?.(window, dx, dy)
                    } else {
                        window.bounds.right += dx
                        window.bounds.bottom += dy
                    }
                })
            }
        }
        return "Ignore"
    }
}

export function makeSpanWindowTool<S>(createWindow: (bounds: Rect, state: S) => unknown): MouseInteraction<S> {
    return function (state: S, mouseX: number, mouseY: number): MouseDragInteraction<S> {
        let startPos = vec(mouseX, mouseY)
        return {
            dragDraw(state, mouseX, mouseY, drawCtx, deltaTime) {
                let bounds = Rect.fromPoints([startPos, vec(mouseX, mouseY)])
                // dashed gray rectangle
                drawCtx.save()
                drawCtx.strokeStyle = "gray"
                drawCtx.setLineDash([5, 5])
                drawCtx.lineWidth = 1
                drawCtx.beginPath()
                drawCtx.strokeRect(bounds.left, bounds.top, Rect.width(bounds), Rect.height(bounds))
                drawCtx.restore()
            },
            mouseUp(state, mouseX: number, mouseY: number): void {
                let bounds = Rect.fromPoints([startPos, vec(mouseX, mouseY)])
                createWindow(bounds, state)
            }
        }
    }
}
