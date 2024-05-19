import { getCursorPosition, initFullscreenCanvas } from "../shared/canvas.js"
import { HashSet } from "../shared/hashset.js";
import { shuffle } from "../shared/utils.js";
import { Vector } from "../shared/vector.js";
import { Circle, expandSmallestCircle, filterUniqueIntPoints, findSmallestCircle } from "./smallestcircle.js";

const canvas = document.getElementById('circle_canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

const emptyCircle = { x: 0, y: 0, r: 0 }
let globalPoints: Vector[] = []
let globalCircle: Circle = emptyCircle

function drawSolution(points: Vector[], boundingCircle: Circle) {
  const pointRadius = 10
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = "black"
  for (let point of points) {
    ctx.circle(point.x, point.y, pointRadius)
    ctx.fill()
  }
  const bcircle = boundingCircle
  ctx.strokeStyle = "red"
  ctx.lineWidth = 4
  ctx.circle(bcircle.x, bcircle.y, bcircle.r)
  ctx.stroke()
}

function clicked(x: number, y: number) {
  let p = new Vector(x, y)
  globalCircle = expandSmallestCircle(globalCircle, globalPoints, p)
  globalPoints.push(p)
  globalPoints = filterUniqueIntPoints(globalPoints)
  drawSolution(globalPoints, globalCircle)
}

function reset() {
  globalPoints = []
  globalCircle = emptyCircle
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

function setupControls() {
  // global click/drag
  let dragging = false
  canvas.addEventListener("pointerdown", (ev) => {
    dragging = true
    const [x, y] = getCursorPosition(canvas, ev)
    clicked(x, y)
  })
  canvas.addEventListener("pointerup", (ev) => { dragging = false })
  canvas.addEventListener("pointermove", (ev) => {
    ev.buttons 
    if (dragging) {
      const [x, y] = getCursorPosition(canvas, ev)
      clicked(x, y)
    }
  })

  // buttons
  const controls = {
    "btn_reset": () => reset(),
  }
  for (let [name, cmd] of Object.entries(controls)) {
    let button = document.getElementById(name)!
    button.addEventListener("click", cmd)
  }
}


setupControls()
initFullscreenCanvas(canvas, () => drawSolution(globalPoints))