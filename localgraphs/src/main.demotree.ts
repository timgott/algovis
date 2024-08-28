import { DragNodeInteraction, GraphPhysicsSimulator, SimpleGraphPainter, createGridGraph, createRandomGraph, createRegularTree, shuffleGraphPositions } from "./interaction/graphsim.js";
import { initFullscreenCanvas } from "../../shared/canvas.js";
import { InteractionController } from "./interaction/controller.js";
import { GraphLayoutPhysics, LayoutConfig } from "./interaction/physics.js";
import { TreeLayoutConfig, TreeLayoutPhysics } from "./interaction/treephysics.js";
import { ClickNodeInteraction } from "./interaction/tools.js";

const canvas = document.getElementById('graph_canvas') as HTMLCanvasElement;
initFullscreenCanvas(canvas)

const layoutStyle: TreeLayoutConfig = {
    targetOffsetX: 50,
    targetOffsetY: 30,
    pushDistance: 10,
    rootY: 80,
    dampening: 2,
    pushForce: 20,
    verticalLayoutForce: 10,
    horizontalParentForce: 10,
    horizontalChildForce: 10,
    boundaryForce: 20,
    boundaryWidth: 40,
    sleepVelocity: 0,
    depthLimit: 40,
}
const nodeRadius = 5;

let graph = createRegularTree(5, 3)
shuffleGraphPositions(graph, canvas.clientWidth, canvas.clientHeight)

const physics = new TreeLayoutPhysics(layoutStyle)
const sim = new GraphPhysicsSimulator(
    graph, physics,
    new SimpleGraphPainter(nodeRadius)
)
sim.substeps = 1
sim.visibleFilter = (node) => physics.isNodeVisible(node)
let changeRootInteraction = new ClickNodeInteraction((node) => {
    physics.updateTree(node)
    controller.requestFrame()
})
sim.setInteractionMode(() => changeRootInteraction)
physics.updateTree(graph.nodes[0])
//sim.setInteractionMode(() => new DragNodeInteraction())

const controller = new InteractionController(canvas, sim)
controller.requestFrame()
