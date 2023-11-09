import { applyLayoutPhysics, createGridGraph, createRandomGraph, drawGraph, findClosestNode, shuffleGraphPositions } from "./graphlayout.js";
import { getCursorPosition, initFullscreenCanvas } from "../shared/canvas.js";
var canvas = document.getElementById('graph_canvas');
var ctx = canvas.getContext('2d');
initFullscreenCanvas(canvas);
var layoutStyle = {
    nodeRadius: 10,
    targetDistance: 40,
    edgeLength: 200,
    pushForce: 1,
    edgeForce: 5,
    centeringForce: 1.0,
    dampening: 3.0,
};
var graph = createRandomGraph(20, 3);
shuffleGraphPositions(graph, canvas.width, canvas.height);
graph = createGridGraph(11, layoutStyle);
var draggedNode = null;
var mouseX = 0;
var mouseY = 0;
var previousTimeStamp = undefined;
function animate(timeStamp) {
    if (!previousTimeStamp) {
        previousTimeStamp = timeStamp;
    }
    var dt = Math.min(timeStamp - previousTimeStamp, 1. / 30.);
    if (draggedNode) {
        draggedNode.x = mouseX;
        draggedNode.y = mouseY;
        draggedNode.vx = 0;
        draggedNode.vy = 0;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    applyLayoutPhysics(graph, layoutStyle, canvas.width, canvas.height, dt);
    drawGraph(ctx, graph, layoutStyle);
    previousTimeStamp = timeStamp;
    requestAnimationFrame(animate);
}
function mouseDown(x, y) {
    // drag node
    draggedNode = findClosestNode(x, y, graph);
}
function mouseMoved(ev) {
    mouseX = ev.x;
    mouseY = ev.y;
}
canvas.addEventListener("mousedown", function (ev) {
    var _a = getCursorPosition(canvas, ev), x = _a[0], y = _a[1];
    mouseDown(x, y);
});
window.addEventListener("mousemove", mouseMoved);
window.addEventListener("mouseup", function () {
    draggedNode = null;
});
// settle physics
var PreIterations = 0;
for (var i = 0; i < PreIterations; i++) {
    applyLayoutPhysics(graph, layoutStyle, canvas.width, canvas.height, 1 / 30);
}
animate(performance.now());
