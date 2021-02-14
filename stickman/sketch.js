let t = 0

const head_radius = 30;
const body_height = 80;
const leg_length = 100;
const leg_spread = 20;
const arm_length = 100;
const arm_spread = 20;


let globalStickman
let globalLastDeltaTime = Infinity

const GRAVITY = 0.001;
const MOTOR_FORCE = 0.01;
const LIMB_DAMPENING = 0.02;

const PHYSICS_STEP = 5
const PLAN_EVERY = 10
const PLAN_STEP = 50
const PLAN_ITERATIONS = 1

const PROPAGATE_GROUND_CONSTRAINTS = false


function createStickman(x, y) {
  const head = headNode(0, -body_height - head_radius)
  const shoulders = limbNode(0, -body_height)
  const hips = limbNode(0, 0)
  const leftHip = limbNode(-leg_spread, 0)
  const leftKnee = limbNode(-leg_spread, leg_length / 2)
  const leftFoot = gripNode(-leg_spread, leg_length)
  const rightKnee = mirrorNode(leftKnee)
  const rightFoot = mirrorNode(leftFoot)
  const leftElbow = limbNode(-arm_spread, -body_height + arm_length / 2)
  const leftHand = limbNode(-arm_spread, -body_height + arm_length)
  const rightElbow = mirrorNode(leftElbow)
  const rightHand = mirrorNode(leftHand)

  const nodes = [
    head,
    shoulders,
    hips,
    leftKnee,
    leftFoot,
    rightKnee,
    rightFoot,
    leftElbow,
    leftHand,
    rightElbow,
    rightHand
  ]

  for (node of nodes) {
    node.x += x
    node.y += y
  }

  const limbs = [
    limb(shoulders, head, 0.5),
    limb(shoulders, hips, 1),
    limb(hips, leftKnee, 2),
    limb(leftKnee, leftFoot, 1),
    limb(hips, rightKnee, 2),
    limb(rightKnee, rightFoot, 1),
    limb(shoulders, leftElbow, 2, "leftUpperArm"),
    limb(leftElbow, leftHand, 1, "leftLowerArm"),
    limb(shoulders, rightElbow, 2, "rightUpperArm"),
    limb(rightElbow, rightHand, 1, "rightLowerArm")
  ]

  limbs[3].motor = 1

  return {
    nodes: nodes,
    limbs: limbs
  }
}

function copyStickman(stickman) {
  const newNodes = stickman.nodes.map(node => ({ copy: true, ...node }))
  function mapNode(oldNode) {
    return newNodes[stickman.nodes.indexOf(oldNode)]
  }
  return {
    nodes: newNodes,
    limbs: stickman.limbs.map(limb => ({ ...limb, start: mapNode(limb.start), end: mapNode(limb.end) }))
  }
}

function setup() {
  createCanvas(1000, 400);
  globalStickman = createStickman(100, 100)
}

let globalTimeRemainder = PHYSICS_STEP
let globalPlanningCounter = 0

function draw() {
  globalTimeRemainder += deltaTime
  globalTimeRemainder = min(globalTimeRemainder, PHYSICS_STEP * 5)

  background(220);
  drawStickman(0, 0, globalStickman)

  while (globalTimeRemainder >= PHYSICS_STEP) {
    globalPlanningCounter = (globalPlanningCounter + 1) % PLAN_EVERY
    if (globalPlanningCounter == 0) {
      planMotors(globalStickman, PLAN_STEP, PHYSICS_STEP, evaluate)
    }
    let dt = PHYSICS_STEP
    simulateStep(globalStickman, dt, dt)
    globalTimeRemainder -= dt
  }

}

function simulateStep(stickman, dt, lastDt) {
  //reorderLimbsRandomly(stickman)
  resetForces(stickman)
  applyJointForces(stickman)
  applyPhysics(stickman, dt, lastDt)
  //forceConstraints(stickman)


  for (let index = 0; index < 10; index++) {
    groundConstraints(stickman)
    satisfyConstraints(stickman)
  }

}

function evaluate(stickman) {
  return (
    sq(mouseX - stickman.nodes[0].y) - sq(mouseY - stickman.nodes[0].y)
    + stickman.nodes[10].x - stickman.nodes[8].x
  )
}

function evaluateLookahead(stickman) {
  const copiedStickman = stickman;
  planMotors(copiedStickman, PLAN_STEP, PLAN_STEP, evaluate)
  simulateStep(stickman, PLAN_STEP, PLAN_STEP)
  //diffStickman(stickman, copiedStickman)
  let score = evaluate(copiedStickman)
  //print(score)
  return score
}

function diffObject(a, b, name) {
  if (typeof a == "object") {
    if (a === b) {
      print("Identical references found at")
      return
    }

    for (key in a) {
      diffObject(a[key], b[key], name + "/" + key)
    }
  }
  else {
    if (a !== b) {
      print("Difference at " + name + ": " + a + " vs " + b)
    }
  }

}

function diffStickman(a, b) {
  diffObject(a.nodes, b.nodes, "")
  diffObject(a.limbs, b.limbs, "")
}

function evaluateAfterStep(stickman, evaluationFunction, deltaTime, lastDeltaTime) {
  simulateStep(stickman, deltaTime, lastDeltaTime)
  return evaluationFunction(stickman)
}


function planMotors(stickman, dt, lastDt, evaluationFunction) {
  const controlTypes = [0, -1, 1]

  const bestMotorAssignment = stickman.limbs.map(limb => limb.motor)
  let bestScore = evaluateAfterStep(copyStickman(stickman), evaluationFunction, dt, lastDt)

  for (let i = 0; i < PLAN_ITERATIONS; i++) {
    for (let index = 0; index < stickman.limbs.length; index++) {
      const limb = stickman.limbs[index];

      let bestControl
      for (let controlIndex = 0; controlIndex < controlTypes.length; controlIndex++) {
        const control = controlTypes[controlIndex]
        if (control != bestMotorAssignment[index]) {
          const copiedStickman = copyStickman(stickman);
          copiedStickman.limbs[index].motor = control
          score = evaluateAfterStep(copiedStickman, evaluationFunction, dt, lastDt)
          if (score > bestScore) {
            bestScore = score
            bestMotorAssignment[index] = control
          }
        }
      }

      //limb.motor = bestMotorAssignment[index]
    }

    for (let index = 0; index < stickman.limbs.length; index++) {
      stickman.limbs[index].motor = bestMotorAssignment[index]
    }
  }
}

function limbNode(x, y) {
  return { x: x, y: y }
}

function headNode(x, y) {
  return { x: x, y: y, nodeType: "head" }
}

function gripNode(x, y) {
  return { x: x, y: y, grip: true }
}

function mirrorNode(node) {
  return { ...node, x: -node.x }
}

function limb(start, end, power, name) {
  return {
    start: start,
    end: end,
    name: name,
    power: power,
    length: dist(start.x, start.y, end.x, end.y)
  }
}

function reorderLimbsRandomly(stickman) {
  shuffle(stickman.limbs)
  //for (limb of stickman.limbs) {
  //  if (random() > 0.5) {
  //    flipLimb(limb)
  //  }
  //}
}

function flipLimb(limb) {
  const temp = limb.start
  limb.start = limb.end
  limb.end = temp
}

function shuffle(array) {
  for (let index = array.length - 1; index >= 1; index--) {
    let newIndex = Math.floor(Math.random() * index);
    //swap
    const element = array[index];
    array[index] = array[newIndex];
    array[newIndex] = element
  }
}

function reorderLimbsFromRoot(stickman) {
  let roots = new Set([stickman.nodes[7], stickman.nodes[5]])
  let remainingLimbs = new Set([...stickman.limbs])
  while (remainingLimbs.size > 0) {
    print(remainingLimbs)
    for (limb of remainingLimbs) {
      if (roots.has(limb.start)) {
        remainingLimbs.delete(limb)
        roots.add(limb.end)
      } else if (roots.has(limb.end)) {
        flipLimb(limb)
        remainingLimbs.delete(limb)
        roots.add(limb.end)
      }
    }
  }
}

function applyPhysics(stickman, dt, lastDt) {
  for (node of stickman.nodes) {
    x = node.x
    y = node.y
    lastX = node.lastX || x
    lastY = node.lastY || y
    node.lastX = x
    node.lastY = y

    forceX = node.forceX || 0
    forceY = node.forceY || 0

    let velX = (x - lastX) / lastDt
    let velY = (y - lastY) / lastDt

    velX += (forceX) * dt
    velY += (forceY + GRAVITY) * dt

    if (!isFinite(velX)) {
      velX = 0
    }
    if (!isFinite(velY)) {
      velY = 0
    }

    node.x += velX * dt
    node.y += velY * dt

    node.velX = velX
    node.velY = velY
  }
}

function groundConstraints(stickman) {
  for (node of stickman.nodes) {
    if (node.y > height) {
      if (node.grip)
        node.x = node.lastX
      offset = node.y - height
      propagateOffset(stickman, node, 0, -1, offset)
    }
    if (node.y < 0) {
      if (node.grip)
        node.x = node.lastX
      offset = -node.y
      propagateOffset(stickman, node, 0, 1, offset)
    }
    if (node.x > width) {
      if (node.grip)
        node.y = node.lastY
      offset = node.x - width
      propagateOffset(stickman, node, -1, 0, offset)
    }
    if (node.x < 0) {
      if (node.grip)
        node.y = node.lastY
      offset = -node.x
      propagateOffset(stickman, node, 1, 0, offset)
    }
  }
}

function propagateOffset(stickman, node, dirX, dirY, offset, sourceLimb) {
  node.x += dirX * offset
  node.y += dirY * offset

  //circle(node.x, node.y, offset)
  if (PROPAGATE_GROUND_CONSTRAINTS) {
    for (limb of stickman.limbs) {
      if (limb != sourceLimb) {
        let nextNode
        if (limb.start == node) {
          nextNode = limb.end
        }
        if (limb.end == node) {
          nextNode = limb.start
        }

        if (nextNode) {
          const dot = dirX * (nextNode.x - node.x) + dirY * (nextNode.y - node.y)
          if (dot > 0) {
            const factor = dot / (limb.length)
            propagateOffset(stickman, nextNode, dirX, dirY, offset * factor, limb)
          }
        }
      }
    }
  }
}

function clamp(value, lower, upper) {
  return min(max(lower, value), upper)
}

function resetForces(stickman) {
  for (node of stickman.nodes) {
    node.forceX = 0
    node.forceY = 0
  }
}

function applyJointForces(stickman) {
  for (limb of stickman.limbs) {
    const start = limb.start
    const end = limb.end
    const length = dist(start.x, start.y, end.x, end.y)
    const offsetX = end.x - start.x
    const offsetY = end.y - start.y
    const leftX = offsetY / length
    const leftY = -offsetX / length

    const relVelX = end.velX - start.velX
    const relVelY = end.velY - start.velY
    const leftVel = leftX * relVelX + leftY * relVelY
    const dampeningForce = -LIMB_DAMPENING * leftVel

    const motorControl = limb.motor || 0
    const force = MOTOR_FORCE * limb.power * motorControl + dampeningForce
    end.forceX += leftX * force;
    end.forceY += leftY * force;
    start.forceX -= leftX * force;
    start.forceY -= leftY * force;
  }
}

function satisfyConstraints(stickman) {
  for (limb of stickman.limbs) {
    const start = limb.start
    const end = limb.end
    const currentLength = dist(start.x, start.y, end.x, end.y)
    const factor = limb.length / currentLength
    const offsetX = end.x - start.x
    const offsetY = end.y - start.y
    const centerX = start.x + offsetX * 0.5
    const centerY = start.y + offsetY * 0.5
    const tx = offsetX * factor * 0.5
    const ty = offsetY * factor * 0.5
    end.x = centerX + tx
    end.y = centerY + ty
    start.x = centerX - tx
    start.y = centerY - ty
  }
}

function forceConstraints(stickman) {
  for (limb of stickman.limbs) {
    const start = limb.start
    const end = limb.end
    const currentLength = dist(start.x, start.y, end.x, end.y)
    const offsetX = (end.x - start.x) / currentLength
    const offsetY = (end.y - start.y) / currentLength

    const force = (limb.length - currentLength) / currentLength * 1

    end.forceX += offsetX * force
    end.forceY += offsetY * force

    start.forceX += -offsetX * force
    start.forceY += -offsetY * force
  }
}

function drawStickman(x, y, stickman) {

  for (limb of stickman.limbs) {
    line(limb.start.x + x, limb.start.y + y, limb.end.x + x, limb.end.y + y)
  }
  for (node of stickman.nodes) {
    stroke(255, 100, 0, 100)
    line(node.x, node.y, node.x + node.forceX * 10000, node.y + node.forceY * 10000)
    stroke("black")
    if (node.nodeType == "head") {
      circle(node.x + x, node.y + y, head_radius * 2)
    }
  }
}