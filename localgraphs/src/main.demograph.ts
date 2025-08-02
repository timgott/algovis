import { DragNodeInteraction, GraphPhysicsSimulator, SimpleGraphPainter, shuffleGraphPositions } from "./interaction/graphsim.js";
import { initFullscreenCanvas } from "../../shared/canvas.js";
import { InteractionController } from "./interaction/controller.js";
import { GraphLayoutPhysics, LayoutConfig } from "./interaction/physics.js";
import { createGridGraph, createRandomGraph } from "./interaction/examplegraph.js";

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
shuffleGraphPositions(graph, canvas.clientWidth, canvas.clientHeight)

graph = createGridGraph(9, layoutStyle.minEdgeLength)

const sim = new GraphPhysicsSimulator(
    graph, new GraphLayoutPhysics(layoutStyle),
    new SimpleGraphPainter(layoutStyle.nodeRadius)
)
sim.setInteractionMode(() => new DragNodeInteraction())

const controller = new InteractionController(canvas, sim)
controller.requestFrame()
