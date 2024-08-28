import { Graph, GraphNode } from "../graph";
import { bfsFold } from "../graphalgos";
import { applyVelocityStep, findActiveNodes, LayoutPhysics } from "./physics";

type InferredTree<T> = {
    root: GraphNode<T>;
    parents: Map<GraphNode<T>, GraphNode<T> | null>;
    levels: GraphNode<T>[][];
    visible: Set<GraphNode<T>>;
};

function makeTree<T>(root: GraphNode<T>, visibilityLimit: number): InferredTree<T> {
    let levels: GraphNode<T>[][] = [];
    let parents: Map<GraphNode<T>, GraphNode<T> | null> = new Map();
    let visible: Set<GraphNode<T>> = new Set();
    bfsFold<GraphNode<T>, [parent: GraphNode<T> | null, depth: number]>(
        root, () => [null, 0],
        (current, [parent, depth]) => {
            if (levels.length <= depth) {
                levels.push([]);
            }
            levels[depth].push(current);
            parents.set(current, parent);
            if (depth < visibilityLimit) {
                visible.add(current);
            }
            else if (depth >= visibilityLimit) {
                return [];
            }
            let children = [...current.neighbors]; // parent filtered out by bfs
            children.sort((a, b) => a.x - b.x);
            return children.map((n) => [n, [current, depth + 1]]);
        },
    );
    return { root, parents, levels, visible };
}

export type TreeLayoutConfig = {
    sleepVelocity: number;
    horizontalParentForce: number;
    horizontalChildForce: number;
    verticalLayoutForce: number;
    rootY: number;
    targetOffsetX: number;
    targetOffsetY: number;
    pushDistance: number;
    pushForce: number;
    boundaryForce: number;
    boundaryWidth: number;
    dampening: number;
    depthLimit: number;
};

function getChildren<T>(
    tree: InferredTree<T>,
    node: GraphNode<T>,
): GraphNode<T>[] {
    return [...node.neighbors].filter((n) => n != tree.parents.get(node));
}

function applyLayoutForces<T>(
    tree: InferredTree<T>,
    layout: TreeLayoutConfig,
    width: number,
    heigth: number,
    dt: number,
) {
    for (let depth = 0; depth < tree.levels.length; depth++) {
        let siblings = tree.levels[depth];
        // push apart siblings
        for (let i = 1; i < siblings.length; i++) {
            let nodeA = siblings[i - 1];
            let nodeB = siblings[i];
            let diff = nodeA.x + layout.pushDistance - nodeB.x;
            if (diff > 0) {
                let force =
                    Math.min(diff, layout.pushDistance) * layout.pushForce;
                nodeA.vx -= force * dt;
                nodeB.vx += force * dt;
            }
        }
        // push to correct vertical pos
        for (let node of siblings) {
            let targetY = layout.rootY + layout.targetOffsetY * depth;
            let diff = targetY - node.y;
            let force = diff * layout.verticalLayoutForce;
            node.vy += force * dt;
        }
        // center children below parent and parent above children
        for (let parent of siblings) {
            let children = getChildren(tree, parent);
            let n = children.length;
            for (let i = 0; i < n; i++) {
                let child = children[i];
                let offsetX;
                if (n <= 1) offsetX = 0;
                else offsetX = (-1 + i / (n - 1) * 2) * layout.targetOffsetX;
                let diff = parent.x - child.x + offsetX;
                child.vx += diff * layout.horizontalParentForce * dt;
                parent.vx -= diff * layout.horizontalChildForce * dt;
            }
        }
        // push away from boundaries
        for (let node of siblings) {
            const leftBound = layout.boundaryWidth;
            const rightBound = width - layout.boundaryWidth;
            let f = layout.boundaryForce;
            if (node.x < leftBound) {
                node.vx += Math.min(leftBound - node.x, 100) * f * dt;
            }
            if (node.x > rightBound) {
                node.vx -= Math.min(node.x - rightBound, 100) * f * dt;
            }
        }
    }
}

export class TreeLayoutPhysics implements LayoutPhysics<unknown> {
    private tree: InferredTree<unknown> | null = null;

    constructor(private layoutStyle: TreeLayoutConfig) {}
    step(graph: Graph<unknown>, width: number, height: number, dt: number) {
        if (this.tree === null) {
            return 0;
        }
        let activeNodes = findActiveNodes(
            graph,
            this.layoutStyle.sleepVelocity,
        );
        let nodes = this.tree.parents.keys();
        applyVelocityStep(nodes, this.layoutStyle.dampening, dt);
        applyLayoutForces(
            this.tree,
            this.layoutStyle,
            width,
            height,
            dt,
        );

        // count at the end again, in case nodes started moving this step
        let activeNodesCount = activeNodes.size;
        activeNodesCount += findActiveNodes(
            graph,
            this.layoutStyle.sleepVelocity,
        ).size;
        return activeNodesCount;
    }

    updateTree(root: GraphNode<unknown>) {
        this.tree = makeTree(root, this.layoutStyle.depthLimit);
    }

    isNodeVisible(node: GraphNode<unknown>): boolean {
        return this.tree?.visible.has(node) ?? false;
    }
}
