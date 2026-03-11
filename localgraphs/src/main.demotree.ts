import { GraphPhysicsSimulator, SimpleGraphPainter, shuffleGraphPositions } from "./interaction/graphsim.js";
import { initFullscreenCanvas } from "../../shared/canvas.js";
import { InteractionController } from "./interaction/controller.js";
import { TreeLayoutConfig, TreeLayoutPhysics } from "./interaction/treephysics.js";
import { ClickNodeInteraction } from "./interaction/tools.js";
import { createRegularTree } from "./interaction/examplegraph.js";

const canvas = document.getElementById('graph_canvas') as HTMLCanvasElement;
initFullscreenCanvas(canvas)

const layoutStyle: TreeLayoutConfig = {
    targetOffsetX: 50,
    targetOffsetY: 30,
    pushDistance: 20,
    rootY: 80,
    dampening: 2,
    pushForce: 500,
    verticalLayoutForce: 10,
    horizontalParentForce: 10,
    horizontalChildForce: 10,
    boundaryForce: 100,
    boundaryWidth: 80,
    sleepVelocity: 0,
    depthLimit: 40,
}
const nodeRadius = 5;

let graph = createRegularTree(8, 3)
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
