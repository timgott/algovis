import { DragNodeInteraction, GraphPhysicsSimulator, LayoutConfig, createGridGraph, createRandomGraph, shuffleGraphPositions } from "./graphlayout.js";
import { initFullscreenCanvas } from "../../shared/canvas.js"

const canvas = document.getElementById('graph_canvas') as HTMLCanvasElement;
initFullscreenCanvas(canvas)

const layoutStyle: LayoutConfig = {
    nodeRadius: 10,
    targetDistance: 40,
    edgeLength: 200,
    pushForce: 9,
    edgeForce: 16,
    centeringForce: 1.0,
    dampening: 1.0,
}

let graph = createRandomGraph(20, 3)
shuffleGraphPositions(graph, canvas.width, canvas.height)

graph = createGridGraph(10, layoutStyle)

const sim = new GraphPhysicsSimulator(canvas, graph, layoutStyle)
sim.setInteractionMode(new DragNodeInteraction())
sim.run()