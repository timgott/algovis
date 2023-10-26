import { createNode, attach, SplayNode, Side, splay, splaySteps, CommandType, rotateToTopSteps } from "./tree.js";

const canvas = document.getElementById('splay_canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

function setCanvasSize(width: number, height: number) {
  const dpiRatio = window.devicePixelRatio;
  canvas.width = width * dpiRatio;
  canvas.height = height * dpiRatio;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  ctx.scale(dpiRatio, dpiRatio);
}
setCanvasSize(window.innerWidth, window.innerHeight)

const radius = 10
const targetOffsetY = 30
const targetOffsetX = 30
const targetDistance = 50
let rootX = canvas.clientWidth / 2
let rootY = 80

const dampening = 5

const horizontalPushForce = 100
const verticalLayoutForce = 80
const horizontalParentForce = 40
const horizontalChildForce = 40
const boundaryForce = 100
const boundaryWidth = radius * 4

const mainCommandDelay = 100
const subCommandDelay = 50

class PhysicsNode {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  node: SplayNode<PhysicsNode>

  constructor(x: number, y: number, radius: number) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = radius;
    this.node = createNode(this)
  }

  update(dt: number) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.vx -= this.vx * dampening * dt;
    this.vy -= this.vy * dampening * dt;
  }

  draw(ctx: CanvasRenderingContext2D) {
    let parent = this.node.parent?.data;
    if (parent) {
      ctx.beginPath();
      ctx.lineWidth = this.radius / 3
      ctx.moveTo(this.x, this.y)
      ctx.lineTo(parent.x, parent.y)
      ctx.stroke()
      ctx.closePath()
    }
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    //ctx.fillStyle = 'blue';
    ctx.fill();
    ctx.closePath();
  }
}

function findRoot(nodes: PhysicsNode[]): PhysicsNode {
  for (let node of nodes) {
    if (!node.node.parent) {
      return node
    }
  }
  throw "unrooted tree"
}

function collectLevels(root: PhysicsNode): PhysicsNode[][] {
  let levels: PhysicsNode[][] = []
  let lastLevel = [root]
  do {
    levels.push(lastLevel)
    let newLevel: PhysicsNode[] = []
    for (let node of lastLevel) {
      for (let [side, child] of Object.entries(node.node.children)) {
        newLevel.push(child.data)
      }
    }
    lastLevel = newLevel
  } while(lastLevel.length > 0)
  return levels
}

function applyLayoutForces(root: PhysicsNode, dt: number) {
  let levels = collectLevels(root)
  for (let depth = 0; depth < levels.length; depth++) {
    let siblings = levels[depth]
    // push apart siblings
    for (let i = 1; i < siblings.length; i++) {
      let nodeA = siblings[i - 1]
      let nodeB = siblings[i]
      let diff = nodeA.x + targetDistance - nodeB.x
      if (diff > 0) {
        let force = Math.min(diff, targetDistance) * horizontalPushForce
        nodeA.vx -= force * dt
        nodeB.vx += force * dt
      }
    }
    // push to correct vertical pos
    for (let node of siblings) {
      let targetY = rootY + targetOffsetY * depth
      let diff = targetY - node.y
      let force = diff * verticalLayoutForce
      node.vy += force * dt
    }
    // center children below parent and parent above children
    for (let parent of siblings) {
      for (let [side, childNode] of Object.entries(parent.node.children)) {
        let offsetX = (side == Side.Left.toString() ? -1 : 1) * targetOffsetX
        let child = childNode.data
        let diff = parent.x - child.x + offsetX
        child.vx += diff * horizontalParentForce * dt
        parent.vx -= diff * horizontalChildForce * dt
      }
    }
    // push away from boundaries
    for (let node of siblings) {
      const leftBound = boundaryWidth
      const rightBound = canvas.clientWidth - boundaryWidth
      if (node.x < leftBound) {
        node.vx += Math.min(leftBound - node.x, 100) * boundaryForce * dt
      }
      if (node.x > rightBound) {
        node.vx -= Math.min(node.x - rightBound, 100) * boundaryForce * dt
      }
    }
  }
}

function findClosestNode(x: number, y: number, nodes: PhysicsNode[]) {
  let result = nodes[0]
  let minDistance = Number.POSITIVE_INFINITY
  for (let node of nodes) {
    let dx = (node.x - x)
    let dy = (node.y - y)
    let dist = dx*dx + dy*dy
    if (dist < minDistance) {
      result = node
      minDistance = dist
    }
  }
  return result
}

let nodes: PhysicsNode[] = []
function createRoot() {
  let root = new PhysicsNode(rootX, rootY, radius * (0.2 * Math.random() + 0.9))
  nodes.push(root)
  return root
}

function createChild(parent: PhysicsNode, side: Side) {
  let offsetX = (side == Side.Left ? -1 : 1) * targetOffsetX
  let offsetY = targetOffsetY
  let node = new PhysicsNode(parent.x + offsetX, parent.y + offsetY, radius * (0.2 * Math.random() + 0.9))
  attach(parent.node, side, node.node)
  nodes.push(node)
  return node
}

function createTwoSpines(size: number) {
  let root = createRoot()
  for (let side of [Side.Left, Side.Right]) {
    let node = root
    for (let i = 0; i < size; i++) {
      node = createChild(node, side)
    }
  }
}

function createTwoStrings(size: number) {
  let root = createRoot()
  for (let side of [Side.Left, Side.Right]) {
    let node = root
    for (let i = 0; i < size; i++) {
      node = createChild(node, side)
      side = Math.random() > 0.5 ? Side.Left : Side.Right
    }
  }
}

function heapInsert(root: PhysicsNode, value: number) {
  let next: PhysicsNode | undefined = root
  let last
  let side: Side
  console.log(value)
  do {
    side = value > next.radius ? Side.Right : Side.Left
    last = next
    next = next.node.children[side]?.data
  } while(next)
  let node = createChild(last, side)
  node.radius = value
}

function createUniformsHeap(size: number) {
  let root = createRoot()
  root.radius = radius
  for (let i = 0; i < size; i++) {
    let r = Math.random()
    let value = (r + 0.3) * radius
    heapInsert(root, value)
  }
}

let commands: [(() => void), CommandType][] = []
let lastCommandExecution = Number.NEGATIVE_INFINITY

let previousTimeStamp: number | undefined = undefined

function animate(timeStamp: number) {
  if (!previousTimeStamp) {
    previousTimeStamp = timeStamp
  }
  let dt = Math.min(timeStamp - previousTimeStamp, 1./30.)
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  
  let root = findRoot(nodes)
  applyLayoutForces(root, dt)
  
  for (let node of nodes) {
    node.update(dt);
    node.draw(ctx);
  }

  while (commands.length > 0 && timeStamp > lastCommandExecution) {
    let entry = commands.shift()
    if (entry) {
      let [cmd, cmdtype] = entry
      cmd()
      let delay = cmdtype == "main" ? mainCommandDelay : subCommandDelay
      lastCommandExecution = timeStamp + delay
    }
  }
  requestAnimationFrame(animate);
}


function clicked(x: number, y: number) {
  let node = findClosestNode(x, y, nodes)
  // execute pending commands
  for (let [cmd, cmdtype] of commands) {
    cmd()
  }
  commands = splaySteps(node.node)
}

function getCursorPosition(canvas: HTMLCanvasElement, event: MouseEvent): [number, number] {
  // https://stackoverflow.com/a/18053642/8853490
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  return [x, y]
}

canvas.addEventListener("click", (ev) => { 
  const [x, y] = getCursorPosition(canvas, ev)
  clicked(x, y)
})

//createTwoSpines(100)
//createTwoStrings(200)
createUniformsHeap(200)
animate(performance.now());
