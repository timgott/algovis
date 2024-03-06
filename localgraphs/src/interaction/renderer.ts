import { getCursorPosition } from "../../../shared/canvas"
import { unreachable } from "../../../shared/utils"

export type SleepState = "Running" | "Sleeping"

export type DragState = {
    readonly mouseX: number
    readonly mouseY: number
}

export type AnimationFrame = {
    readonly dt: number
    readonly totalTime: number
    readonly width: number
    readonly height: number
    readonly ctx: CanvasRenderingContext2D
    readonly dragState: DragState | null
}

export type MouseDownResponse = "Click" | "Drag" | "Ignore"

export interface InteractiveSystem {
    animate(frame: AnimationFrame): SleepState;
    onMouseDown(x: number, y: number): MouseDownResponse;
    onDragEnd(x: number, y: number): void;
}

export function aggregateSleeping(states: SleepState[]): SleepState {
    if (states.includes("Running")) {
        return "Running"
    } else {
        return "Sleeping"
    }
}

export class UiStack implements InteractiveSystem {
    private mouseCapture: InteractiveSystem | null = null

    constructor(public systems: InteractiveSystem[]) {
    }

    animate(frame: AnimationFrame): SleepState {
        // run animation step on all systems
        const sleepStates = this.systems.map((system) => {
            if (system.animate === undefined) {
                return "Sleeping"
            }

            const dragFrame: AnimationFrame = {
                ...frame,
                dragState: (this.mouseCapture == system)? frame.dragState : null,
            }

            frame.ctx.save()
            let state = system.animate(dragFrame)
            frame.ctx.restore()
            return state
        })

        // running if any system is running
        return aggregateSleeping(sleepStates)
    }

    onMouseDown(x: number, y: number): MouseDownResponse {
        this.mouseCapture = null
        // reverse order to give priority to what is drawn on top
        for (const system of this.systems.toReversed()) {
            if (system.onMouseDown !== undefined) {
                const result = system.onMouseDown(x, y)
                if (result !== "Ignore") {
                    if (result === "Drag") {
                        this.mouseCapture = system
                    }
                    return result
                }
            }
        }
        return "Ignore"
    }

    onDragEnd(x: number, y: number): void {
        if (this.mouseCapture !== null && this.mouseCapture.onDragEnd !== undefined) {
            this.mouseCapture.onDragEnd(x, y)
        }
    }
}

export class InteractionController {
    private mouseX: number = 0
    private mouseY: number = 0
    private dragging: boolean = false

    private previousTimeStamp: number | null = null
    private hasRequestedFrame: boolean = false
    
    private canvas: HTMLCanvasElement
    private ctx: CanvasRenderingContext2D

    constructor(canvas: HTMLCanvasElement, private system: InteractiveSystem) {
        this.canvas = canvas
        this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

        canvas.addEventListener("pointerdown", (ev) => {
            const [x, y] = getCursorPosition(canvas, ev)
            this.onMouseDown(x, y)
        })
        window.addEventListener("pointermove", (ev) => {
            const [x, y] = getCursorPosition(canvas, ev)
            this.onMouseMoved(x, y)
        })
        window.addEventListener("pointerup", (ev) => {
            const [x, y] = getCursorPosition(canvas, ev)
            this.onMouseUp(x, y)
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

        const dragState = this.dragging ? { mouseX: this.mouseX, mouseY: this.mouseY } : null
        const sleepState = this.system.animate({
            dt,
            totalTime: timeStamp,
            width,
            height,
            ctx: this.ctx,
            dragState,
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

    onMouseDown(x: number, y: number) {
        // start dragging node
        this.mouseX = x
        this.mouseY = y
        this.dragging = true
        const result = this.system.onMouseDown(x, y)
        if (result !== "Ignore") {
            console.log(result)
            if (result === "Drag") {
                this.dragging = true
            }
            this.requestFrame()
        }
    }

    onMouseMoved(x: number, y: number) {
        this.mouseX = x
        this.mouseY = y

        if (this.dragging) {
            this.requestFrame()
        }
    }

    onMouseUp(x: number, y: number) {
        // stop dragging node
        if (this.dragging) {
            this.system.onDragEnd(x, y)
            this.requestFrame()
        }
        this.dragging = false // release mouse capture
    }
}