import { DragNodeInteraction, GraphPainter, GraphPhysicsSimulator, LayoutConfig, createGridGraph, createRandomGraph, shuffleGraphPositions } from "./graphlayout.js";
import { initFullscreenCanvas } from "../../shared/canvas.js"

const canvas = document.getElementById('graph_canvas') as HTMLCanvasElement;
initFullscreenCanvas(canvas)

const layoutStyle: LayoutConfig = {
    nodeRadius: 10,
    pushDistance: 40,
    minEdgeLength: 200,
    pushForce: 9,
    edgeForce: 60,
    centeringForce: 1.0,
    dampening: 1.0,
    sleepVelocity: 0.1,
}

let graph = createRandomGraph(20, 3)
shuffleGraphPositions(graph, canvas.width, canvas.height)

graph = createGridGraph(10, layoutStyle)

const sim = new GraphPhysicsSimulator(canvas, graph, layoutStyle, new GraphPainter(layoutStyle.nodeRadius))
sim.setInteractionMode(new DragNodeInteraction())
sim.run()