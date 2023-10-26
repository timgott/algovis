function assert(value) {
    console.assert(value);
}
export var Side;
(function (Side) {
    Side[Side["Left"] = 0] = "Left";
    Side[Side["Right"] = 1] = "Right";
})(Side || (Side = {}));
export function createNode(data) {
    return {
        parent: null,
        parentSide: Side.Left,
        children: {},
        data: data
    };
}
function opposite(side) {
    return side === Side.Left ? Side.Right : Side.Left;
}
export function detach(node) {
    if (node.parent) {
        delete node.parent.children[node.parentSide];
        node.parent = null;
    }
}
export function attach(parent, side, child) {
    // Set new child
    var oldChild = parent.children[side];
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
function rotateUp(pivot) {
    var direction = opposite(pivot.parentSide);
    var parent = pivot.parent;
    var middleTree = pivot.children[direction];
    assert(parent);
    if (parent.parent) {
        attach(parent.parent, parent.parentSide, pivot);
    }
    else {
        detach(pivot);
    }
    attach(pivot, direction, parent);
    if (middleTree) {
        attach(parent, opposite(direction), middleTree);
    }
}
function ziczic(pivot) {
    rotateUp(pivot.parent);
    rotateUp(pivot);
}
function ziczac(pivot) {
    rotateUp(pivot);
    rotateUp(pivot);
}
// moves node x to top
export function splay(x) {
    var _a;
    while ((_a = x.parent) === null || _a === void 0 ? void 0 : _a.parent) {
        if (x.parentSide === x.parent.parentSide) {
            ziczic(x);
        }
        else {
            ziczac(x);
        }
    }
    if (x.parent) {
        rotateUp(x);
    }
}
export function splaySteps(node) {
    var _a;
    var commands = [];
    var x = node;
    var _loop_1 = function () {
        if (x.parentSide === x.parent.parentSide) {
            //commands.push(function() { ziczic(node) })
            var parent_1 = x.parent;
            commands.push([function () { rotateUp(parent_1); }, "sub"]);
            commands.push([function () { rotateUp(node); }, "main"]);
        }
        else {
            commands.push([function () { rotateUp(node); }, "sub"]);
            commands.push([function () { rotateUp(node); }, "main"]);
        }
        x = x.parent.parent;
    };
    while ((_a = x.parent) === null || _a === void 0 ? void 0 : _a.parent) {
        _loop_1();
    }
    if (x.parent) {
        commands.push([function () { rotateUp(node); }, "main"]);
        x = x.parent;
    }
    return commands;
}
export function rotateToTopSteps(node) {
    var commands = [];
    var x = node;
    while (x.parent) {
        commands.push([function () { rotateUp(node); }, "main"]);
        x = x.parent;
    }
    return commands;
}
