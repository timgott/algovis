import { Graph } from "../../localgraphs/src/graph";
import { vec, Vector } from "../../shared/vector";
import { UiNodeData } from "./viewmodel/state";


export const SYMBOL_HORIZONTAL_ALIGN = "—";
export const SYMBOL_VERTICAL_ALIGN = "|";
export const SYMBOL_ARROW_LEFT = "←";
export const SYMBOL_ARROW_RIGHT = "→";
export const SYMBOL_ARROW_UP = "↑";
export const SYMBOL_ARROW_DOWN = "↓";

export function applyDirectionAlignmentForces(dt: number, graph: Graph<UiNodeData>) {
    const forceStrength = 200;
    for (let node of graph.nodes) {
        if (node.neighbors.size === 2) {
            switch (node.data.label) {
                case SYMBOL_HORIZONTAL_ALIGN:
                    for (let other of node.neighbors) {
                        let force = forceStrength * (node.y - other.y);
                        other.vy += force * dt;
                        node.vy -= force * dt;
                    }
                    break;
                case SYMBOL_VERTICAL_ALIGN:
                    for (let other of node.neighbors) {
                        let force = forceStrength * (node.x - other.x);
                        other.vx += force * dt;
                        node.vx -= force * dt;
                    }
                    break;
            }
        }
    }
}

export function applyArrowAlignmentForces(dt: number, graph: Graph<UiNodeData>) {
    const forceStrength = 50;
    const arrows = new Map([
        [SYMBOL_ARROW_LEFT, { opposite: SYMBOL_ARROW_RIGHT, dir: vec(-1, 0) }],
        [SYMBOL_ARROW_RIGHT, { opposite: SYMBOL_ARROW_LEFT, dir: vec(1, 0) }],
        [SYMBOL_ARROW_UP, { opposite: SYMBOL_ARROW_DOWN, dir: vec(0, -1) }],
        [SYMBOL_ARROW_DOWN, { opposite: SYMBOL_ARROW_UP, dir: vec(0, 1) }],
    ]);
    for (let node of graph.nodes) {
        if (node.neighbors.size === 2) {
            let arrow = arrows.get(node.data.label);
            if (arrow) {
                for (let other of node.neighbors) {
                    let dir = Vector.sub(node, other);
                    let ortho = Vector.rotate(dir, Math.PI / 2, Vector.Zero);
                    let orthodot = Vector.dot(ortho, arrow.dir);
                    let v = Vector.scale(forceStrength * dt * orthodot, Vector.normalize(ortho));
                    if (other.data.label === arrow.opposite) {
                        node.vx -= v.x;
                        node.vy -= v.y;
                    } else {
                        other.vx -= v.x;
                        other.vy -= v.y;
                        node.vx += v.x;
                        node.vy += v.y;
                    }
                }
            }
        }
    }
}
