function assert(value: any): asserts value {
  console.assert(value)
}

export enum Side {
  Left,
  Right,
}

export type SplayNode<T> = {
  parent: SplayNode<T> | null;
  parentSide: Side;
  children: {[side in Side]?: SplayNode<T>}
  data: T
}

export function createNode<T>(data: T): SplayNode<T> {
  return {
    parent: null,
    parentSide: Side.Left,
    children: {},
    data: data
  };
}

function opposite(side: Side): Side {
  return side === Side.Left ? Side.Right : Side.Left;
}

export function detach(node: SplayNode<unknown>): void {
  if (node.parent) {
    delete node.parent.children[node.parentSide];
    node.parent = null;
  }
}

export function attach(parent: SplayNode<unknown>, side: Side, child: SplayNode<unknown>): void {
  // Set new child
  let oldChild = parent.children[side]
  if (oldChild) {
    detach(oldChild);
  }
  parent.children[side] = child;
  // Set new parent
  if (child.parent) {
    detach(child);
  }
  child.parent = parent;
  child.parentSide = side;
}

function rotateUp(pivot: SplayNode<unknown>): void {
  const direction = opposite(pivot.parentSide);
  const parent = pivot.parent;
  const middleTree = pivot.children[direction];
  assert(parent)
  if (parent.parent) {
    attach(parent.parent, parent.parentSide, pivot);
  } else {
    detach(pivot);
  }
  attach(pivot, direction, parent);
  if (middleTree) {
    attach(parent, opposite(direction), middleTree);
  }
}

function ziczic(pivot: SplayNode<unknown>): void {
  rotateUp(pivot.parent!);
  rotateUp(pivot);
}

function ziczac(pivot: SplayNode<unknown>): void {
  rotateUp(pivot);
  rotateUp(pivot);
}

// moves node x to top
export function splay(x: SplayNode<unknown>): void {
  while (x.parent?.parent) {
    if (x.parentSide === x.parent.parentSide) {
      ziczic(x);
    } else {
      ziczac(x);
    }
  }
  if (x.parent) {
    rotateUp(x);
  }
}

// step by step operation for visualization
export type CommandType = "main" | "sub"
export function splaySteps(node: SplayNode<unknown>): [(() => void), CommandType][] {
  let commands: [(() => void), CommandType][] = []
  let x = node
  while (x.parent?.parent) {
    if (x.parentSide === x.parent.parentSide) {
      //commands.push(function() { ziczic(node) })
      let parent = x.parent
      commands.push([function() { rotateUp(parent) }, "sub"])
      commands.push([function() { rotateUp(node) }, "main"])
    } else {
      commands.push([function() { rotateUp(node) }, "sub"])
      commands.push([function() { rotateUp(node) }, "main"])
    }
    x = x.parent.parent
  }
  if (x.parent) {
    commands.push([function() { rotateUp(node) }, "main"])
    x = x.parent
  }
  return commands
}

export function rotateToTopSteps(node: SplayNode<unknown>): [(() => void), CommandType][] {
  let commands: [(() => void), CommandType][] = []
  let x = node
  while (x.parent) {
    commands.push([function() { rotateUp(node) }, "main"])
    x = x.parent
  }
  return commands
}