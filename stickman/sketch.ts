import * as p5 from 'p5';
import { MCTS, SeenMCTSNode, createMctsRoot, propagateAverageValue, treePolicyUct, runMctsTimeout, treePolicyEpsilonGreedy } from './mcts';
import { randomChoice, range } from '../shared/utils';

let t = 0

const head_radius = 30;
const body_height = 70;
const leg_length = 100;
const leg_spread = 10;
const knee_ratio = 3/7;
const arm_length = 100;
const arm_spread = 10;
const elbow_ratio = 2/5;


const GRAVITY = 0.0002;
const MOTOR_FORCE = 0.0008;
const LIMB_DAMPENING = 0.0000;

const PHYSICS_STEP = 30
const PLAN_EVERY = 1
const PLAN_STEP = 30 // ideally, PHYSICS_STEP*PLAN_EVERY
const PLAN_ITERATIONS = 1 // how often to iterate over all limbs
const TWO_STEP_PLANNING = true // consider second step in planning
const PREFER_RELAXING = false // relax all limbs before planning
const PROPAGATE_GROUND_CONSTRAINTS = true // more realistic energy transfer? better jumping?
const LOOKAHEAD_EVALUATION = false // don't enable
const GRIP_SURFACE_HEIGHT = 0.00 // surface friction, can be negative
const RANDOM_SAMPLED_PREPLANNING = true
const RANDOM_SAMPLES = 50
const RANDOM_SAMPLING_STEPS = 1

const MCTS_PLANNING = true // Use MCTS instead of the greedy/sampling planner
const MCTS_DRAW_NEW_NODES = true // Show newly explored candidates
const MCTS_TIMEOUT = 25 // ms
const MCTS_MIN_STEPS = 50 // exact step count depends on time budget
const MCTS_MAX_STEPS = 10000
const MCTS_EPSILON = 0.05 // Take random actions with this probability
const MCTS_UCT_C = 1000.0 // exploration/exploitation tradeoff, depends on evaluation scale (fix this?). Look ahead vs find local best option
const MCTS_ACTIONS = 30 // number of movement alternatives per node, higher increases movement precision
const MCTS_ROLLOUT_DEPTH = 10 // how many steps to simulate in the rollout (max depth relative to root), regularizes with random future actions

type Node = {
  x: number,
  y: number,
  lastX?: number,
  lastY?: number,
  forceX?: number,
  forceY?: number,
  velX?: number,
  velY?: number,
  grip?: boolean,
  nodeType?: string
}

type Limb = {
  start: Node,
  end: Node,
  name?: string,
  power: number,
  length: number,
  motor?: number
}

type Stickman = {
  nodes: Node[],
  limbs: Limb[],
}

function createStickman(x, y): Stickman {
  const head = headNode(0, -body_height - head_radius)
  const shoulders = limbNode(0, -body_height)
  const hips = limbNode(0, 0)
  const leftKnee = limbNode(-leg_spread, leg_length * knee_ratio)
  const leftFoot = gripNode(-leg_spread, leg_length)
  const rightKnee = mirrorNode(leftKnee)
  const rightFoot = mirrorNode(leftFoot)
  const leftElbow = limbNode(-arm_spread, -body_height + arm_length * elbow_ratio)
  const leftHand = gripNode(-arm_spread, -body_height + arm_length)
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

  for (const node of nodes) {
    node.x += x
    node.y += y
  }

  const limbs = [
    limb(shoulders, head, 0.5),
    limb(shoulders, hips, 2),
    limb(hips, leftKnee, 8),
    limb(leftKnee, leftFoot, 2),
    limb(hips, rightKnee, 8),
    limb(rightKnee, rightFoot, 2),
    limb(shoulders, leftElbow, 5, "leftUpperArm"),
    limb(leftElbow, leftHand, 1, "leftLowerArm"),
    limb(shoulders, rightElbow, 5, "rightUpperArm"),
    limb(rightElbow, rightHand, 1, "rightLowerArm"),
  ]

  return {
    nodes: nodes,
    limbs: limbs,
  }
}

function copyStickman(stickman: Stickman): Stickman {
  // faster than structuredClone (at least on firefox)
  const newNodes = stickman.nodes.map(node => ({ copy: true, ...node }))
  function mapNode(oldNode: Node) {
    return newNodes[stickman.nodes.indexOf(oldNode)]
  }
  return {
    nodes: newNodes,
    limbs: stickman.limbs.map(limb => ({ ...limb, start: mapNode(limb.start), end: mapNode(limb.end) }))
  }
}

function simulateStep(sketch: p5, stickman: Stickman, dt, lastDt) {
  resetForces(stickman)
  applyJointForces(stickman)
  applyPhysics(stickman, dt, lastDt)
  forceConstraints(stickman)

  // propagate through all limbs -> ~5 iterations
  for (let index = 0; index < 5; index++) {
    satisfyConstraints(stickman)
    groundConstraints(stickman, sketch.width, sketch.height)
  }

}

function evaluate(sketch, stickman) {
  let headMouseDistSqr = sq(sketch.mouseX - stickman.nodes[0].x) + sq(sketch.mouseY - stickman.nodes[0].y)
  let handMouseDistSqr = sq(sketch.mouseX - stickman.nodes[8].x) + sq(sketch.mouseY - stickman.nodes[8].y)
  let hipsMouseDistSqr = sq(sketch.mouseX - stickman.nodes[2].x) + sq(sketch.mouseY - stickman.nodes[2].y)
  let shouldersMouseDistSqr = sq(sketch.mouseX - stickman.nodes[1].x) + sq(sketch.mouseY - stickman.nodes[1].y)
  let headUp = -sq(stickman.nodes[0].y)
  let feetUp = -sq(stickman.nodes[4].y) - sq(stickman.nodes[6].y)
  let handsUp = -sq(stickman.nodes[8].y) - sq(stickman.nodes[10].y)
  let bodyUp = -sq(stickman.nodes[0].y)-sq(stickman.nodes[1].y)
  let headRight = sq(stickman.nodes[0].x)
  let headCenter = -sq(sketch.width / 2 - stickman.nodes[0].x)
  let spreadArms = sq(stickman.nodes[10].x - stickman.nodes[8].x)
  let spreadLegs = sq(stickman.nodes[4].x - stickman.nodes[6].x)
  let movement = stickman.nodes.reduce((sum, node) => sum + sq(node.velX) + sq(node.velY), 0)
  let stability = -stickman.limbs.reduce((sum, limb) => sum + sq(limb.start.velX - limb.end.velX) + sq(limb.start.velY - limb.end.velY), 0)
  return (
    -headMouseDistSqr - handMouseDistSqr
    //+ headRight + headUp
    + 0.1 * stability
  )
}

function evaluateLookahead(sketch, stickman) {
  const copiedStickman = stickman;
  planMotorsSampling(sketch, copiedStickman, PLAN_STEP, PLAN_STEP, evaluate, undefined)
  simulateStep(sketch, stickman, PLAN_STEP, PLAN_STEP)
  //diffStickman(stickman, copiedStickman)
  let score = evaluate(sketch, copiedStickman)
  //console.log(score)
  return score
}

function diffObject(a, b, name) {
  if (typeof a == "object") {
    if (a === b) {
      console.error("Identical references found at")
      return
    }

    for (const key in a) {
      diffObject(a[key], b[key], name + "/" + key)
    }
  }
  else {
    if (a !== b) {
      console.log("Difference at " + name + ": " + a + " vs " + b)
    }
  }

}

function diffStickman(a, b) {
  diffObject(a.nodes, b.nodes, "")
  diffObject(a.limbs, b.limbs, "")
}

function evaluateAfterSteps(sketch: p5, stickman: Stickman, evaluationFunction, deltaTime: number, lastDeltaTime: number, steps) {
  for (let i = 0; i < steps; i++) {
    simulateStep(sketch, stickman, deltaTime, lastDeltaTime)
  }
  return evaluationFunction(sketch, stickman)
}

function simulateWithMotor(sketch: p5, stickman: Stickman, limbIndex, control, dt, lastDt) {
  stickman.limbs[limbIndex].motor = control
  simulateStep(sketch, stickman, dt, lastDt)
}

function evaluateControlSequence(sketch: p5, stickman: Stickman, evaluationFunction, limbIndex: number, controlSequence, dt, lastDt) {
  const copiedStickman = copyStickman(stickman);

  for (let index = 0; index < controlSequence.length; index++) {
    const control = controlSequence[index];
    simulateWithMotor(sketch, copiedStickman, limbIndex, control, dt, lastDt)
    lastDt = dt
  }

  return evaluationFunction(sketch, copiedStickman)
}

function evaluateControlWithContinuation(sketch, copiedStickman, evaluationFunction, limbIndex, firstControl, continuations, dt, lastDt) {
  simulateWithMotor(sketch, copiedStickman, limbIndex, firstControl, dt, lastDt)
  if (continuations) {
    let bestScore = -Infinity

    for (let continuationIndex = 0; continuationIndex < continuations.length; continuationIndex++) {
      const continuedStickman = copyStickman(copiedStickman)
      const nextSequence = continuations[continuationIndex]
      const score = evaluateControlWithContinuation(sketch, continuedStickman, evaluationFunction, limbIndex, nextSequence[0], nextSequence[1], dt, dt)

      if (score > bestScore) {
        bestScore = score
      }
    }

    return bestScore
  }
  else {
    return evaluationFunction(sketch, copiedStickman)
  }
}

function planMotorsIndividual(sketch: p5, stickman: Stickman, dt, lastDt, evaluationFunction) {
  type ControlContinuation = [number, number[]?]
  const controlTypes: ControlContinuation[] = TWO_STEP_PLANNING ? [
    [0, [0]],
    [1, [1, 0, -1]],
    [-1, [-1, 0, 1]]
  ] : [[0], [1], [-1]]

  if (PREFER_RELAXING) {
    stickman.limbs.forEach(limb => limb.motor = 0)
  }

  const bestMotorAssignment: number[] = []
  let bestScore = -Infinity

  for (let i = 0; i < PLAN_ITERATIONS; i++) {
    for (let index = 0; index < stickman.limbs.length; index++) {
      const limb = stickman.limbs[index];

      for (const controlSequence of controlTypes) {
        const firstControl = controlSequence[0]
        const continuations = controlSequence[1]
        if (continuations || firstControl != bestMotorAssignment[index]) {
          let score = evaluateControlWithContinuation(sketch, copyStickman(stickman), evaluationFunction, index, firstControl, continuations, dt, lastDt)
          if (score > bestScore) {
            bestScore = score
            bestMotorAssignment[index] = firstControl
          }
        }
      }
    }

    for (let index = 0; index < stickman.limbs.length; index++) {
      stickman.limbs[index].motor = bestMotorAssignment[index]
    }
  }

  return bestScore
}

function randomMotors(stickman: Stickman) {
  for (let index = 0; index < stickman.limbs.length; index++) {
    stickman.limbs[index].motor = randomChoice([0, -1, 1])
  }
}

function randomMotorsRelaxed(stickman: Stickman, temperature: number) {
  for (let index = 0; index < stickman.limbs.length; index++) {
    if (Math.random() < temperature) {
      stickman.limbs[index].motor = randomChoice([0, -1, 1])
    }
  }
}

function planMotorsSampling(sketch: p5, stickman: Stickman, dt: number, lastDt: number, evaluationFunction, scoreToBeat: number | undefined): void {
  const bestMotorAssignment = stickman.limbs.map(limb => limb.motor)
  let bestScore = scoreToBeat || evaluateAfterSteps(sketch, copyStickman(stickman), evaluationFunction, dt, lastDt, RANDOM_SAMPLING_STEPS)

  for (let i = 0; i < RANDOM_SAMPLES; i++) {
    const copiedStickman = copyStickman(stickman)
    randomMotors(copiedStickman)

    const score = evaluateAfterSteps(sketch, copiedStickman, evaluationFunction, dt, lastDt, RANDOM_SAMPLING_STEPS)
    if (score > bestScore) {
      bestScore = score
      for (let index = 0; index < stickman.limbs.length; index++) {
        bestMotorAssignment[index] = copiedStickman.limbs[index].motor
      }
    }
  }
  for (let index = 0; index < stickman.limbs.length; index++) {
    stickman.limbs[index].motor = bestMotorAssignment[index]
  }
}

function limbNode(x: number, y: number): Node {
  return { x: x, y: y }
}

function headNode(x: number, y: number): Node {
  return { x: x, y: y, nodeType: "head" }
}

function gripNode(x: number, y: number): Node {
  return { x: x, y: y, grip: true }
}

function mirrorNode(node: Node): Node {
  return { ...node, x: -node.x }
}

function sq(x: number): number {
  return x * x
}

function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x1 - x2, y1 - y2)
}

function limb(start: Node, end: Node, power: number, name: string | undefined = undefined): Limb {
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
  //for (const limb of stickman.limbs) {
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
    console.log(remainingLimbs)
    for (const limb of remainingLimbs) {
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
  for (const node of stickman.nodes) {
    const x = node.x
    const y = node.y
    const lastX = node.lastX || x
    const lastY = node.lastY || y
    node.lastX = x
    node.lastY = y

    const forceX = node.forceX || 0
    const forceY = node.forceY || 0

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

function groundConstraints(stickman, width, height) {
  for (const node of stickman.nodes) {
    if (node.y >= height - GRIP_SURFACE_HEIGHT && node.grip) {
      node.x = node.lastX
    }
    if (node.y > height) {
      const offset = node.y - height
      propagateOffset(stickman, node, 0, -1, offset)
    }
    if (node.y < 0) {
      if (node.grip)
        node.x = node.lastX
      const offset = -node.y
      propagateOffset(stickman, node, 0, 1, offset)
    }
    if (node.x > width) {
      if (node.grip)
        node.y = node.lastY
      const offset = node.x - width
      propagateOffset(stickman, node, -1, 0, offset)
    }
    if (node.x < 0) {
      if (node.grip)
        node.y = node.lastY
      const offset = -node.x
      propagateOffset(stickman, node, 1, 0, offset)
    }
  }
}

function propagateOffset(stickman, node, dirX, dirY, offset, sourceLimb: Limb | undefined = undefined) {
  node.x += dirX * offset
  node.y += dirY * offset

  //circle(node.x, node.y, offset)
  if (PROPAGATE_GROUND_CONSTRAINTS) {
    for (const limb of stickman.limbs) {
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

function resetForces(stickman) {
  for (const node of stickman.nodes) {
    node.forceX = 0
    node.forceY = 0
  }
}

function applyJointForces(stickman) {
  for (const limb of stickman.limbs) {
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
  for (const limb of stickman.limbs) {
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
  for (const limb of stickman.limbs) {
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

type EvaluationFunction = (sketch: p5, stickman: Stickman) => number

interface Planner {
  planMotors(sketch: p5, stickman: Stickman, evaluate: EvaluationFunction)
}

class GreedyPlanner implements Planner {
  scoreToBeat: number = -Infinity
  planMotors(sketch: p5, stickman: Stickman, evaluate: EvaluationFunction) {
    if (RANDOM_SAMPLED_PREPLANNING)
      planMotorsSampling(sketch, stickman, PLAN_STEP, PHYSICS_STEP, evaluate, this.scoreToBeat)
    this.scoreToBeat = planMotorsIndividual(sketch, stickman, PLAN_STEP, PHYSICS_STEP, evaluate)
  }
}

function transferMotorAssignment(source: Stickman, target: Stickman) {
  for (let index = 0; index < source.limbs.length; index++) {
    target.limbs[index].motor = source.limbs[index].motor
  }
}

type MctsActions = number
class MctsPlanner implements Planner {
  lastBest: SeenMCTSNode<Stickman, MctsActions> | null = null

  planMotors(sketch: p5, stickman: Stickman, evaluate: EvaluationFunction) {
    // sample 10 random motor assignments as actions
    const actions = [...range(MCTS_ACTIONS)]
    const rolloutDepth = MCTS_ROLLOUT_DEPTH

    // setup mcts
    const mcts: MCTS<Stickman, MctsActions> = {
      actions: (s) => actions,
      expand(s, a) {
        const copiedStickman = copyStickman(s)
        randomMotorsRelaxed(copiedStickman, 0.5)
        simulateStep(sketch, copiedStickman, PLAN_STEP, PLAN_STEP)
        return copiedStickman
      },
      rollout(state, depth) {
        if (MCTS_DRAW_NEW_NODES && Math.random() < 1.0 / depth) {
          drawStickman(sketch, 0, 0, state, 5)
        }
        if (rolloutDepth > 0) {
          const evaluatedStickman = copyStickman(state)
          let evaluateStart = evaluate(sketch, evaluatedStickman)
          for (let i = 0; i < rolloutDepth; i++) {
            randomMotorsRelaxed(evaluatedStickman, 0.1)
            simulateStep(sketch, evaluatedStickman, PLAN_STEP, PLAN_STEP)
          }
          return (evaluateStart + evaluate(sketch, evaluatedStickman)) / 2
        } else {
          return evaluate(sketch, state)
        }
      },
      treePolicy: treePolicyEpsilonGreedy(MCTS_EPSILON, treePolicyUct(MCTS_UCT_C)),
      //treePolicy: treePolicyEpsilonGreedy(MCTS_EPSILON),
      propagation: propagateAverageValue,
      //propagation: propagateMaxValue,
      //propagation: propagateDecay,
    }

    const root = this.lastBest !== null? this.lastBest : createMctsRoot(stickman, mcts)
    /*if (this.lastBest) {
      diffStickman(stickman, root.state)
      throw "End"
    }*/
    const best = runMctsTimeout(root, mcts, MCTS_MIN_STEPS, MCTS_MAX_STEPS, MCTS_TIMEOUT)
    transferMotorAssignment(best.state, stickman)
    best.parent = null
    this.lastBest = best
  }

}

function drawStickman(sketch, x, y, stickman, alpha: number = 255) {
  for (const limb of stickman.limbs) {
    sketch.stroke(0,0,0, alpha)
    sketch.line(limb.start.x + x, limb.start.y + y, limb.end.x + x, limb.end.y + y)
  }
  for (const node of stickman.nodes) {
    //sketch.stroke(255, 100, 0, 100)
    //sketch.line(node.x, node.y, node.x + node.forceX * 1000, node.y + node.forceY * 1000)
    sketch.stroke(0,0,0, alpha)
    if (node.nodeType == "head") {
      sketch.fill(255,255,255,alpha)
      sketch.circle(node.x + x, node.y + y, head_radius * 2)
    }
  }
}

function initSketch(sketch) {
  let globalStickman
  let planner: Planner

  sketch.setup = function setup() {
    sketch.createCanvas(sketch.min(sketch.windowWidth, 1000), sketch.min(sketch.windowHeight, 400));
    globalStickman = createStickman(100, 200)
    planner = MCTS_PLANNING ? new MctsPlanner() : new GreedyPlanner()
  }
  sketch.windowResized = function windowResized() {
    sketch.resizeCanvas(sketch.min(sketch.windowWidth, 1000), sketch.min(sketch.windowHeight, 400));
  }

  let globalTimeRemainder = PHYSICS_STEP
  let globalPlanningCounter = 0

  function draw() {
    if (sketch.keyIsPressed) {
      sketch.deltaTime = sketch.deltaTime * 0.1
    }
    globalTimeRemainder += sketch.deltaTime
    globalTimeRemainder = sketch.min(globalTimeRemainder, PHYSICS_STEP * 10)

    
    if (globalTimeRemainder >= PHYSICS_STEP) {
      sketch.background(220);
      globalPlanningCounter = (globalPlanningCounter + 1) % PLAN_EVERY
      if (globalPlanningCounter == 0) {
        const evaluationFunction = LOOKAHEAD_EVALUATION ? evaluateLookahead : evaluate
        planner.planMotors(sketch, globalStickman, evaluationFunction)
      }
      let dt = PHYSICS_STEP
      //reorderLimbsRandomly(globalStickman) // confuses cached motor assignments (e.g. MCTS)
      drawStickman(sketch, 0, 0, globalStickman)
      simulateStep(sketch, globalStickman, dt, dt)
      globalTimeRemainder -= dt
    }
  }

  sketch.draw = draw
}

new p5(initSketch)