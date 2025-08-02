import { Graph } from "../../localgraphs/src/graph"
import { GraphInteraction } from "../../localgraphs/src/interaction/graphsim"

export interface StateInteraction<T> {
    onMouseDown(state: T, mouseX: number, mouseY: number): void
    onDragStep(state: T, mouseX: number, mouseY: number, deltaTime: number): void
    onDragDraw?(state: T, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, deltaTime: number): void
    onMouseUp(state: T, mouseX: number, mouseY: number): void
}

export class MapInteraction<S, T> implements StateInteraction<S> {
    constructor(private f: (state: S) => T, private readonly interaction: StateInteraction<T>) {
    }
    onDragStep(state: S, mouseX: number, mouseY: number, deltaTime: number): void {
        this.interaction.onDragStep(this.f(state), mouseX, mouseY, deltaTime)
    }
    onDragDraw(state: S, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, deltaTime: number): void {
        if (this.interaction.onDragDraw) {
            this.interaction.onDragDraw(this.f(state), mouseX, mouseY, drawCtx, deltaTime)
        }
    }
    onMouseUp(state: S, mouseX: number, mouseY: number): void {
        this.interaction.onMouseUp(this.f(state), mouseX, mouseY)
    }
    onMouseDown(state: S, mouseX: number, mouseY: number): void {
        this.interaction.onMouseDown(this.f(state), mouseX, mouseY)
    }
}

export class MapGraphInteraction<S, T> implements StateInteraction<S> {
    constructor(private f: (state: S) => Graph<T>, private readonly interaction: GraphInteraction<T>) {
    }
    onDragStep(state: S, mouseX: number, mouseY: number, deltaTime: number): void {
        let graph = this.f(state)
        this.interaction.onDragStep(graph, graph.nodes, mouseX, mouseY, deltaTime)
    }
    onDragDraw(state: S, mouseX: number, mouseY: number, drawCtx: CanvasRenderingContext2D, deltaTime: number): void {
        if (this.interaction.onDragDraw) {
            let graph = this.f(state)
            this.interaction.onDragDraw(graph, graph.nodes, mouseX, mouseY, drawCtx, deltaTime)
        }
    }
    onMouseUp(state: S, mouseX: number, mouseY: number): void {
        let graph = this.f(state)
        this.interaction.onMouseUp(graph, graph.nodes, mouseX, mouseY)
    }
    onMouseDown(state: S, mouseX: number, mouseY: number): void {
        let graph = this.f(state)
        this.interaction.onMouseDown(graph, graph.nodes, mouseX, mouseY)
    }
}