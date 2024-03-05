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
    animate?(frame: AnimationFrame): SleepState;
    onMouseDown?(x: number, y: number): MouseDownResponse;
    onDragEnd?(x: number, y: number): void;
}

export function aggregateSleeping(states: SleepState[]): SleepState {
    if (states.includes("Running")) {
        return "Running"
    } else {
        return "Sleeping"
    }
}

export class InteractionController {
    private mouseX: number = 0
    private mouseY: number = 0
    private mouseCapture: InteractiveSystem | null = null

    private previousTimeStamp: number | null = null
    private hasRequestedFrame: boolean = false
    
    private canvas: HTMLCanvasElement
    private ctx: CanvasRenderingContext2D

    constructor(canvas: HTMLCanvasElement, private systems: InteractiveSystem[]) {
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
        

        // run animation step on all systems
        const sleepStates = this.systems.map((system) => {
            if (system.animate === undefined) {
                return "Sleeping"
            }

            // only system that has captured mouse gets drag info
            const dragState = {
                mouseX: this.mouseX,
                mouseY: this.mouseY,
            }

            const frame: AnimationFrame = {
                dt: dt,
                totalTime: timeStamp,
                width: width,
                height: height,
                ctx: this.ctx,
                dragState: (this.mouseCapture == system)? dragState : null,
            }

            this.ctx.save()
            let state = system.animate(frame)
            this.ctx.restore()
            return state
        })

        // find if a system is running
        const sleepState = aggregateSleeping(sleepStates)

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
        this.mouseCapture = null
        // reverse order to give priority to what is drawn on top
        for (const system of this.systems.toReversed()) {
            if (system.onMouseDown !== undefined) {
                const result = system.onMouseDown(x, y)
                if (result !== "Ignore") {
                    if (result === "Drag") {
                        this.mouseCapture = system
                    }
                    this.requestFrame()
                    break // do not propagate event
                }
            }
        }
    }

    onMouseMoved(x: number, y: number) {
        this.mouseX = x
        this.mouseY = y

        if (this.mouseCapture !== null) {
            this.requestFrame()
        }
    }

    onMouseUp(x: number, y: number) {
        // stop dragging node
        if (this.mouseCapture !== null && this.mouseCapture.onDragEnd !== undefined) {
            this.mouseCapture.onDragEnd(x, y)
            this.requestFrame()
        }
        this.mouseCapture = null // release mouse capture
    }
}