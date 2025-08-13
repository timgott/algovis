import { AnimationFrame, DragState, InteractiveSystem, MouseDownResponse, PointerId, SleepState } from "../../localgraphs/src/interaction/controller";
import { Rect } from "../../shared/rectangle";
import { mapValues } from "../../shared/utils";
import { isDistanceLess, Positioned, vecscale, vecsub, Vector } from "../../shared/vector";

export type ZoomState = {
    offset: Vector,
    scale: number
}

export class PanZoomController implements InteractiveSystem {
    panState: InertialDragState
    panPointerId: number | null = null

    constructor(
        protected getZoomState: () => ZoomState,
        protected subsystem: InteractiveSystem) {
        let zoom = getZoomState()
        this.panState = new InertialDragState(zoom.offset.x, zoom.offset.y)
    }

    transformPointInto(p: Positioned): Positioned {
        let view = this.getZoomState()
        return Vector.sub(Vector.scale(view.scale, p), view.offset)
    }

    transformRectInto(bounds: Rect) {
        let view = this.getZoomState()
        let width = Rect.width(bounds) / view.scale
        let height = Rect.height(bounds) / view.scale
        return Rect.fromSize(-view.offset.x, -view.offset.y, width, height)
    }

    transformFrame(frame: AnimationFrame): AnimationFrame {
        return {
            ...frame,
            bounds: this.transformRectInto(frame.bounds),
            dragState: mapValues(frame.dragState, (p: DragState) => this.transformPointInto(p))
        }
    }

    update(frame: AnimationFrame): SleepState {
        if (this.panPointerId !== null) {
            let drag = frame.dragState.get(this.panPointerId)
            if (drag !== undefined) {
                this.panState.dragStep(drag.x, drag.y, frame.dt)
            } else {
                this.panPointerId = null
            }
        }
        let zoomState = this.getZoomState()
        zoomState.offset = this.panState.pos
        return this.subsystem.update(this.transformFrame(frame))
    }
    draw(frame: AnimationFrame, ctx: CanvasRenderingContext2D): void {
        let zoom = this.getZoomState()
        ctx.save()
        ctx.transform(zoom.scale, 0, 0, zoom.scale, zoom.offset.x, zoom.offset.y)
        this.subsystem.draw(this.transformFrame(frame), ctx)
        ctx.restore()
    }
    mouseDown(x: number, y: number, pointerId: PointerId, bounds: Rect): MouseDownResponse {
        let mouse = this.transformPointInto({x, y})
        let subResponse = this.subsystem.mouseDown(mouse.x, mouse.y, pointerId, this.transformRectInto(bounds))
        if (subResponse === "Ignore") {
            this.panState.dragStart(x, y)
            this.panPointerId = pointerId
            return "Drag"
        }
        return subResponse
    }
    dragEnd(x: number, y: number, pointerId: PointerId, bounds: Rect): void {
        let mouse = this.transformPointInto({x, y})
        return this.subsystem.dragEnd(mouse.x, mouse.y, pointerId, this.transformRectInto(bounds))
    }
}

class InertialDragState {
    pos: Vector
    vel: Vector = Vector.Zero
    lastMousePos: Vector = Vector.Zero
    constructor(public x: number, public y: number) {
        this.pos = {x, y}
    }

    dragStart(x: number, y: number) {
        this.lastMousePos = {x, y}
    }

    dragStep(x: number, y: number, dt: number) {
        let mousePos = {x, y}
        let delta = Vector.sub(mousePos, this.lastMousePos)
        this.lastMousePos = mousePos

        this.pos = Vector.add(this.pos, delta)
        let currentVel = Vector.scale(1 / dt, delta)
        this.vel = Vector.mix(this.vel, currentVel, 0.8)
    }

    normalStep(dt: number): SleepState {
        this.pos = Vector.add(this.pos, Vector.scale(dt, this.vel))
        this.vel = Vector.scale(0.95, this.vel) // TODO: proper physics
        if (isDistanceLess(Vector.Zero, this.vel, 1)) {
            this.vel = Vector.Zero
            return "Sleeping"
        } else {
            return "Running"
        }
    }
}