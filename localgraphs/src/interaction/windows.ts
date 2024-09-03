import { Rect } from "../../../shared/rectangle";
import { ensured } from "../../../shared/utils";
import { AnimationFrame, InteractiveSystem, MouseDownResponse, PointerId, SleepState } from "./controller";

function drawWindowFrame(ctx: CanvasRenderingContext2D, window: WindowBounds, titleArea: Rect) {
    ctx.save()
    const cornerRadius = 4
    ctx.strokeStyle = window.borderColor;
    //ctx.fillStyle = `rgba(200, 220, 255, 0.6)`;
    ctx.fillStyle = `color-mix(in srgb, ${window.borderColor} 10%, rgba(255, 255, 255, 0.8))`;
    ctx.lineWidth = 1;
    ctx.beginPath()
    ctx.roundRect(window.bounds.left, titleArea.top, Rect.width(window.bounds), Rect.height(titleArea), [cornerRadius, cornerRadius, 0, 0]);
    ctx.fill()
    ctx.roundRect(window.bounds.left, titleArea.top, Rect.width(window.bounds), window.bounds.bottom - titleArea.top, cornerRadius);
    ctx.moveTo(window.bounds.left, window.bounds.top);
    ctx.lineTo(window.bounds.right, window.bounds.top);
    ctx.stroke();
    if (window.resizing) {
        ctx.fillStyle = ctx.strokeStyle;
        // diagonal lines in the bottom right
        let offset = 6
        let padding = 2
        let count = 2;
        ctx.beginPath()
        for (let i=1; i<=count; i++) {
            ctx.moveTo(window.bounds.right - padding, window.bounds.bottom - offset * i - padding);
            ctx.lineTo(window.bounds.right - offset * i - padding, window.bounds.bottom - padding);
        }
        ctx.stroke();
    }
    ctx.restore()
}

export function drawWindowTitle(ctx: CanvasRenderingContext2D, titleBounds: Rect, title: string, color: string): number {
    ctx.save()
    ctx.fillStyle = color;
    ctx.font = "15px monospace";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const left = titleBounds.left + 12
    ctx.fillText(title, left, titleBounds.top + Rect.height(titleBounds) / 2);
    ctx.restore()
    const measured = ctx.measureText(title);
    return left + measured.width
}

const titleHeight = 40
const resizeHandleSize = 32

export type WindowBounds = {
    bounds: Rect
    resizing: {
        minWidth: number,
        minHeight: number,
    } | false
    borderColor: string
}

export function satisfyMinBounds(window: WindowBounds) {
    if (window.resizing) {
        if (Rect.width(window.bounds) < window.resizing.minWidth) {
            window.bounds.right = window.bounds.left + window.resizing.minWidth
        }
        if (Rect.height(window.bounds) < window.resizing.minHeight) {
            window.bounds.bottom = window.bounds.top + window.resizing.minHeight
        }
    }
}

// contains only input related data
export class WindowController<T extends WindowBounds> implements InteractiveSystem {
    constructor(
        public windows: T[],
        protected animateContents: (frame: AnimationFrame, window: T, titleArea: Rect) => unknown,
    ) {
    }

    dragState: null | {
        lastX: number,
        lastY: number,
        pointerId: PointerId
        window: T
        mode: "move" | "resize"
    } = null;

    animate(frame: AnimationFrame): SleepState {
        if (this.dragState) {
            const mouse = ensured(frame.dragState.get(this.dragState.pointerId))
            const dx = mouse.x - this.dragState.lastX
            const dy = mouse.y - this.dragState.lastY
            const window = this.dragState.window
            if (this.dragState.mode === "resize") {
                window.bounds.right += dx
                window.bounds.bottom += dy
            }
            if (this.dragState.mode === "move") {
                window.bounds = Rect.addOffset(window.bounds, dx, dy)
            }
            this.dragState.lastX = mouse.x
            this.dragState.lastY = mouse.y
        }
        for (let window of this.windows) {
            let titleArea = this.titleArea(window)
            drawWindowFrame(frame.ctx, window, titleArea);
            this.animateContents(frame, window, titleArea)
        }
        return "Sleeping"
    }

    // including entire window frame
    outerBounds(window: T): Rect {
        let contentArea = window.bounds
        return Rect.new(
            contentArea.left, contentArea.top - titleHeight, contentArea.right, contentArea.bottom
        )
    }

    // top area of window frame where title belongs and that can be used to drag the window
    titleArea(window: T): Rect {
        let outerBounds = this.outerBounds(window)
        let contentArea = window.bounds
        return Rect.new(
            outerBounds.left, outerBounds.top, outerBounds.right, contentArea.top
        )
    }

    resizeArea(window: T): Rect {
        let size = resizeHandleSize / 2
        return Rect.new(
            window.bounds.right - size, window.bounds.bottom - size, window.bounds.right + size, window.bounds.bottom + size
        )
    }

    onMouseDown(x: number, y: number, pointerId: PointerId): MouseDownResponse {
        for (let window of this.windows) {
            let titleArea = this.titleArea(window)
            if (Rect.contains(titleArea, x, y)) {
                this.dragState = {
                    lastX: x,
                    lastY: y,
                    pointerId,
                    mode: "move",
                    window,
                }
                return "Drag"
            }
            let resizeArea = this.resizeArea(window)
            if (Rect.contains(resizeArea, x, y)) {
                this.dragState = {
                    lastX: x,
                    lastY: y,
                    pointerId,
                    mode: "resize",
                    window,
                }
                return "Drag"
            }
        }
        return "Ignore"
    }

    onDragEnd(x: number, y: number): void {
        this.dragState = null
    }
}
