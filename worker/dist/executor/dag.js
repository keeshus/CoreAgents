export function topologicalSort(nodes, edges) {
    const adj = new Map();
    const inDegree = new Map();
    for (const n of nodes) {
        adj.set(n.id, []);
        inDegree.set(n.id, 0);
    }
    for (const e of edges) {
        const targets = adj.get(e.source);
        if (targets)
            targets.push(e.target);
        inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }
    const queue = [];
    for (const [id, deg] of inDegree) {
        if (deg === 0)
            queue.push(id);
    }
    const sorted = [];
    while (queue.length > 0) {
        const id = queue.shift();
        const node = nodes.find(n => n.id === id);
        if (node)
            sorted.push(node);
        for (const neighbor of adj.get(id) || []) {
            const newDeg = (inDegree.get(neighbor) || 1) - 1;
            inDegree.set(neighbor, newDeg);
            if (newDeg === 0)
                queue.push(neighbor);
        }
    }
    const cycles = [];
    if (sorted.length < nodes.length) {
        const visited = new Set(sorted.map(n => n.id));
        const unvisited = nodes.filter(n => !visited.has(n.id)).map(n => n.id);
        cycles.push(unvisited);
    }
    return { sorted, cycles };
}
//# sourceMappingURL=dag.js.map