import { Rect } from "../../../shared/rectangle";
import { Positioned } from "../../../shared/vector";
import { AnimationFrame, InteractiveSystem, MouseDownResponse, SleepState } from "./renderer";

function drawWindowFrame(ctx: CanvasRenderingContext2D, bounds: Rect, headerHeight: number) {
    const cornerRadius = 4
    ctx.strokeStyle = "darkblue";
    ctx.fillStyle = `rgba(200, 220, 255, 0.6)`;
    ctx.lineWidth = 1;
    ctx.beginPath()
    ctx.roundRect(bounds.left, bounds.top, bounds.width, headerHeight, [cornerRadius, cornerRadius, 0, 0]);
    ctx.fill()
    ctx.roundRect(bounds.left, bounds.top, bounds.width, bounds.height, cornerRadius);
    ctx.moveTo(bounds.left, bounds.top + headerHeight);
    ctx.lineTo(bounds.right, bounds.top + headerHeight);
    ctx.stroke();
}

export function drawWindowTitle(ctx: CanvasRenderingContext2D, titleBounds: Rect, title: string): number {
    ctx.fillStyle = "darkblue";
    ctx.font = "15px monospace";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const left = titleBounds.left + 12
    ctx.fillText(title, left, titleBounds.top + titleBounds.height / 2);
    const measured = ctx.measureText(title);
    return left + measured.width
}

const titleHeight = 40

// contains only input related data
export class WindowController implements InteractiveSystem {
    constructor(
        public contentArea: Rect,
        public drawContents: (ctx: CanvasRenderingContext2D, contentArea: Rect, titleArea: Rect) => unknown,
    ) {
    }

    dragState: null | {
        lastX: number,
        lastY: number
    } = null;

    animate(frame: AnimationFrame): SleepState {
        if (frame.dragState && this.dragState) {
            const dx = frame.dragState.mouseX - this.dragState.lastX
            const dy = frame.dragState.mouseY - this.dragState.lastY
            this.contentArea = this.contentArea.addOffset(dx, dy)
            this.dragState.lastX = frame.dragState.mouseX
            this.dragState.lastY = frame.dragState.mouseY
        }
        drawWindowFrame(frame.ctx, this.bounds, titleHeight);
        this.drawContents(frame.ctx, this.contentArea, this.titleArea)
        return "Sleeping"
    }

    get bounds(): Rect {
        return new Rect(
            this.contentArea.left, this.contentArea.top - titleHeight, this.contentArea.right, this.contentArea.bottom
        )
    }

    get titleArea(): Rect {
        return new Rect(
            this.bounds.left, this.bounds.top, this.bounds.right, this.contentArea.top
        )
    }

    onMouseDown(x: number, y: number): MouseDownResponse {
        if (this.titleArea.contains(x, y)) {
            this.dragState = {
                lastX: x,
                lastY: y
            }
            return "Drag"
        }
        return "Ignore"
    }

    onDragEnd(x: number, y: number): void {
        this.dragState = null
    }
}