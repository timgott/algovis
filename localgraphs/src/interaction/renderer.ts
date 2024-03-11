import { getCursorPosition } from "../../../shared/canvas"
import { invertBijectiveMap, unreachable } from "../../../shared/utils"

export type SleepState = "Running" | "Sleeping"

export type DragState = {
    readonly x: number
    readonly y: number
}

export type PointerId = number

export type AnimationFrame = {
    readonly dt: number
    readonly totalTime: number
    readonly width: number
    readonly height: number
    readonly ctx: CanvasRenderingContext2D
    readonly dragState: Map<PointerId, DragState>
}

export type MouseDownResponse = "Click" | "Drag" | "Ignore"

export interface InteractiveSystem {
    animate(frame: AnimationFrame): SleepState;
    onMouseDown(x: number, y: number, pointerId: PointerId): MouseDownResponse;
    onDragEnd(x: number, y: number, pointerId: PointerId): void;
}

export function aggregateSleeping(states: SleepState[]): SleepState {
    if (states.includes("Running")) {
        return "Running"
    } else {
        return "Sleeping"
    }
}

export class UiStack implements InteractiveSystem {
    private pointerCaptures: Map<PointerId, InteractiveSystem> = new Map()

    constructor(public systems: InteractiveSystem[]) {
    }

    animate(frame: AnimationFrame): SleepState {
        const activePointers = [...frame.dragState.keys()]

        // run animation step on all systems
        const sleepStates = this.systems.map((system) => {
            if (system.animate === undefined) {
                return "Sleeping"
            }

            // find pointers that are captured by this system
            const capturedDrags = frame.dragState.filter(
                (pointerId, _) => this.pointerCaptures.get(pointerId) === system
            )
            const dragFrame: AnimationFrame = {
                ...frame,
                dragState: capturedDrags,
            }

            frame.ctx.save()
            let state = system.animate(dragFrame)
            frame.ctx.restore()
            return state
        })

        // running if any subsystem is running
        return aggregateSleeping(sleepStates)
    }

    onMouseDown(x: number, y: number, pointerId: PointerId): MouseDownResponse {
        // reverse order to give priority to what is drawn on top
        for (const system of this.systems.toReversed()) {
            if (system.onMouseDown !== undefined) {
                const result = system.onMouseDown(x, y, pointerId)
                if (result !== "Ignore") {
                    if (result === "Drag") {
                        this.pointerCaptures.set(pointerId, system)
                    }
                    return result
                }
            }
        }
        return "Ignore"
    }

    onDragEnd(x: number, y: number, pointerId: PointerId): void {
        const s = this.pointerCaptures.pop(pointerId)
        if (s !== undefined && s.onDragEnd !== undefined) {
            s.onDragEnd(x, y, pointerId)
        }
    }
}

export class InteractionController {
    private dragState: Map<PointerId, DragState> = new Map()

    private previousTimeStamp: number | null = null
    private hasRequestedFrame: boolean = false
    
    private canvas: HTMLCanvasElement
    private ctx: CanvasRenderingContext2D

    constructor(canvas: HTMLCanvasElement, private system: InteractiveSystem) {
        this.canvas = canvas
        this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

        canvas.addEventListener("pointerdown", (ev) => {
            const [x, y] = getCursorPosition(canvas, ev)
            this.onMouseDown(x, y, ev.pointerId)
        })
        canvas.addEventListener("pointermove", (ev) => {
            const [x, y] = getCursorPosition(canvas, ev)
            this.onMouseMoved(x, y, ev.pointerId)
        })
        canvas.addEventListener("lostpointercapture", (ev) => {
            const [x, y] = getCursorPosition(canvas, ev)
            this.onMouseUp(x, y, ev.pointerId)
        })
        window.addEventListener("resize", () => {
            this.requestFrame()
        })
    }

    frameCallback(timeStamp: number) {
        if (this.previousTimeStamp === null) {
            this.previousTimeStamp = timeStamp
        }
        const dt = Math.min(timeStamp - this.previousTimeStamp, 1. / 30.) // max dt for stability
        if (dt < 0) {
            console.log("Negative dt", dt)
        }

        const width = this.canvas.clientWidth
        const height = this.canvas.clientHeight
        this.ctx.reset()

        const sleepState = this.system.animate({
            dt,
            totalTime: timeStamp,
            width,
            height,
            ctx: this.ctx,
            dragState: this.dragState,
        })

        this.previousTimeStamp = timeStamp

        if (sleepState === "Running") {
            this.requestFrame()
        } else {
            console.log("Physics settled, sleeping")
        }
    }

    requestFrame() {
        if (!this.hasRequestedFrame) {
            this.hasRequestedFrame = true
            if (this.previousTimeStamp === null) {
                this.previousTimeStamp = document.timeline.currentTime as number | null
            }
            requestAnimationFrame((timeStamp) => {
                this.hasRequestedFrame = false
                this.frameCallback(timeStamp)
            })
        }
    }

    onMouseDown(x: number, y: number, pointerId: PointerId) {
        // start dragging node
        const result = this.system.onMouseDown(x, y, pointerId)
        if (result !== "Ignore") {
            console.log(result)
            if (result === "Drag") {
                this.dragState.set(pointerId, { x, y })
                this.canvas.setPointerCapture(pointerId) // capture drag events
            }
            this.requestFrame()
        }
    }

    onMouseMoved(x: number, y: number, pointerId: PointerId) {
        const state = this.dragState.get(pointerId)
        if (state !== undefined) {
            this.dragState.set(pointerId, { x, y })
            this.requestFrame()
        }
    }

    onMouseUp(x: number, y: number, pointerId: PointerId) {
        // stop dragging node
        if (this.dragState.has(pointerId)) {
            this.system.onDragEnd(x, y, pointerId)
            this.requestFrame()
            this.dragState.delete(pointerId) // release mouse capture
        }
    }
}