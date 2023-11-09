import { Graph, PhysGraphNode, LayoutConfig, applyLayoutPhysics, createGridGraph, createRandomGraph, drawGraph, findClosestNode, shuffleGraphPositions } from "./graphlayout.js";
import { getCursorPosition, initFullscreenCanvas } from "../shared/canvas.js"

const canvas = document.getElementById('graph_canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
initFullscreenCanvas(canvas)

const layoutStyle: LayoutConfig = {
    nodeRadius: 10,
    targetDistance: 40,
    edgeLength: 200,
    pushForce: 1,
    edgeForce: 5,
    centeringForce: 1.0,
    dampening: 3.0,
}

let graph = createRandomGraph(20, 3)
shuffleGraphPositions(graph, canvas.width, canvas.height)

graph = createGridGraph(11, layoutStyle)

let draggedNode: PhysGraphNode<unknown> | null = null
let mouseX: number = 0
let mouseY: number = 0

let previousTimeStamp: number | undefined = undefined
function animate(timeStamp: number) {
  if (!previousTimeStamp) {
    previousTimeStamp = timeStamp
  }
  let dt = Math.min(timeStamp - previousTimeStamp, 1./30.)
  
  if (draggedNode) {
    draggedNode.x = mouseX
    draggedNode.y = mouseY
    draggedNode.vx = 0
    draggedNode.vy = 0
  }


  ctx.clearRect(0, 0, canvas.width, canvas.height);
  applyLayoutPhysics(graph, layoutStyle, canvas.width, canvas.height, dt)
  drawGraph(ctx, graph, layoutStyle)

  previousTimeStamp = timeStamp
  requestAnimationFrame(animate);
}


function mouseDown(x: number, y: number) {
  // drag node
  draggedNode = findClosestNode(x, y, graph)
}

function mouseMoved(ev: MouseEvent) {
  mouseX = ev.x
  mouseY = ev.y
}

canvas.addEventListener("mousedown", (ev) => { 
  const [x, y] = getCursorPosition(canvas, ev)
  mouseDown(x, y)
})
window.addEventListener("mousemove", mouseMoved)
window.addEventListener("mouseup", () => {
  draggedNode = null
})

// settle physics
const PreIterations = 0
for (let i = 0; i < PreIterations; i++) {
  applyLayoutPhysics(graph, layoutStyle, canvas.width, canvas.height, 1/30)
}

animate(performance.now());
