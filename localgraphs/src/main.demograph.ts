import { DragNodeInteraction, GraphPhysicsSimulator, LayoutConfig, SimpleGraphPainter, createGridGraph, createRandomGraph, shuffleGraphPositions } from "./interaction/graphlayout.js";
import { initFullscreenCanvas } from "../../shared/canvas.js"
import { InteractionController } from "./interaction/renderer.js";

const canvas = document.getElementById('graph_canvas') as HTMLCanvasElement;
initFullscreenCanvas(canvas)

const layoutStyle: LayoutConfig = {
    nodeRadius: 10,
    pushDistance: 50,
    minEdgeLength: 200,
    pushForce: 30,
    edgeForce: 10,
    centeringForce: 0.03,
    dampening: 0.5,
    sleepVelocity: 0.1,
}

let graph = createRandomGraph(20, 3)
shuffleGraphPositions(graph, canvas.width, canvas.height)

graph = createGridGraph(9, layoutStyle)

const sim = new GraphPhysicsSimulator(graph, layoutStyle, new SimpleGraphPainter(layoutStyle.nodeRadius))
sim.setInteractionMode(() => new DragNodeInteraction())

const controller = new InteractionController(canvas, sim)
controller.requestFrame()