import { Rect } from "../../../shared/rectangle";
import { ensured } from "../../../shared/utils";
import { AnimationFrame, InteractiveSystem, MouseDownResponse, PointerId, SleepState } from "./controller";

function drawWindowFrame(ctx: CanvasRenderingContext2D, contentArea: Rect, titleArea: Rect, borderColor: string, resizable: boolean) {
    ctx.save()
    const cornerRadius = 4
    ctx.strokeStyle = borderColor;
    //ctx.fillStyle = `rgba(200, 220, 255, 0.6)`;
    ctx.fillStyle = `color-mix(in srgb, ${borderColor} 10%, rgba(255, 255, 255, 0.8))`;
    ctx.lineWidth = 1;
    ctx.beginPath()
    ctx.roundRect(contentArea.left, titleArea.top, Rect.width(contentArea), Rect.height(titleArea), [cornerRadius, cornerRadius, 0, 0]);
    ctx.fill()
    ctx.roundRect(contentArea.left, titleArea.top, Rect.width(contentArea), contentArea.bottom - titleArea.top, cornerRadius);
    ctx.moveTo(contentArea.left, contentArea.top);
    ctx.lineTo(contentArea.right, contentArea.top);
    ctx.stroke();
    if (resizable) {
        ctx.fillStyle = ctx.strokeStyle;
        // diagonal lines in the bottom right
        let offset = 6
        let padding = 2
        let count = 2;
        ctx.beginPath()
        for (let i=1; i<=count; i++) {
            ctx.moveTo(contentArea.right - padding, contentArea.bottom - offset * i - padding);
            ctx.lineTo(contentArea.right - offset * i - padding, contentArea.bottom - padding);
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

// simpler
export function drawResizableWindowWithTitle(
    ctx: CanvasRenderingContext2D,
    contentArea: Rect,
    title: string,
    borderColor: string,
) {
    let titleArea = calcWindowTitleArea(contentArea);
    drawWindowFrame(ctx, contentArea, titleArea, borderColor, true);
    drawWindowTitle(ctx, titleArea, title, borderColor);
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

// including entire window frame
export function calcWindowOuterBounds(contentArea: Rect): Rect {
    return Rect.new(
        contentArea.left, contentArea.top - titleHeight, contentArea.right, contentArea.bottom
    )
}

// top area of window frame where title belongs and that can be used to drag the window
export function calcWindowTitleArea(contentArea: Rect): Rect {
    let outerBounds = calcWindowOuterBounds(contentArea)
    return Rect.new(
        outerBounds.left, outerBounds.top, outerBounds.right, contentArea.top
    )
}

export function calcWindowResizeArea(contentArea: Rect): Rect {
    let size = resizeHandleSize / 2
    return Rect.new(
        contentArea.right - size, contentArea.bottom - size, contentArea.right + size, contentArea.bottom + size
    )
}

export function isWindowResizable(window: WindowBounds): boolean {
    return window.resizing !== false
}

// contains only input related data
export class WindowController<T extends WindowBounds> implements InteractiveSystem {
    constructor(
        public windows: T[],
        protected drawContents: (frame: AnimationFrame, ctx: CanvasRenderingContext2D, window: T, titleArea: Rect) => unknown,
        protected onMove: (window: T, dx: number, dy: number) => unknown = () => {;},
    ) {
    }
    
    dragState: null | {
        lastX: number,
        lastY: number,
        pointerId: PointerId
        window: T
        mode: "move" | "resize"
    } = null;

    update(frame: AnimationFrame): SleepState {
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
                this.onMove(window, dx, dy)
                window.bounds = Rect.addOffset(window.bounds, dx, dy)
            }
            this.dragState.lastX = mouse.x
            this.dragState.lastY = mouse.y
        }
        return "Sleeping"
    }

    draw(frame: AnimationFrame, ctx: CanvasRenderingContext2D): void {
        for (let window of this.windows) {
            let titleArea = calcWindowTitleArea(window.bounds)
            drawWindowFrame(ctx, window.bounds, titleArea, window.borderColor, isWindowResizable(window));
            this.drawContents(frame, ctx, window, titleArea)
        }
    }

    mouseDown(x: number, y: number, pointerId: PointerId): MouseDownResponse {
        for (let window of this.windows) {
            let titleArea = calcWindowTitleArea(window.bounds)
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
            let resizeArea = calcWindowResizeArea(window.bounds)
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

    dragEnd(x: number, y: number): void {
        this.dragState = null
    }
}
