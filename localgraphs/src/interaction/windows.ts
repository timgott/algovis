import { Rect } from "../../../shared/rectangle";
import { AnimationFrame, InteractiveSystem, MouseDownResponse, SleepState } from "./renderer";

export interface WindowContents {
    width: number;
    height: number;
    draw(ctx: CanvasRenderingContext2D, contentArea: Rect, titleArea: Rect): void;
}

export const emptyWindowContents = {
    draw: (ctx: CanvasRenderingContext2D, bounds: Rect) => {},
    width: 200,
    height: 300,
    title: "Empty Window"
}

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
export class Window implements InteractiveSystem {
    constructor(private x: number, private y: number, private contents: WindowContents) {
    }

    dragState: null | {
        lastX: number,
        lastY: number
    } = null;

    animate(frame: AnimationFrame): SleepState {
        if (frame.dragState && this.dragState) {
            const dx = frame.dragState.mouseX - this.dragState.lastX
            const dy = frame.dragState.mouseY - this.dragState.lastY
            this.x += dx
            this.y += dy
            this.dragState.lastX = frame.dragState.mouseX
            this.dragState.lastY = frame.dragState.mouseY
        }
        drawWindowFrame(frame.ctx, this.bounds, titleHeight);
        this.contents.draw(frame.ctx, this.contentArea, this.titleArea)
        return "Sleeping"
    }

    get bounds(): Rect {
        return Rect.fromSize(
            this.x, this.y, this.contents.width, this.contents.height + titleHeight
        )
    }

    get titleArea(): Rect {
        return Rect.fromSize(
            this.x, this.y, this.contents.width, titleHeight
        )
    }

    get contentArea(): Rect {
        return Rect.fromSize(
            this.x, this.y + titleHeight, this.contents.width, this.contents.height
        )
    }

    onMouseDown(x: number, y: number): MouseDownResponse {
        // TODO: only in title bar
        if (this.titleArea.contains(x, y)) {
            this.dragState = {
                lastX: x,
                lastY: y
            }
            return "Drag"
        }
        return "Ignore"
    }

    onMouseUp(x: number, y: number): void {
        this.dragState = null
    }
}