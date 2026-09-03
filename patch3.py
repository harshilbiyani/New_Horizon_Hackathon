import codecs
import re

path = 'server/zonePlanner.js'
with codecs.open(path, 'r', 'utf8') as f:
    text = f.read()

bfsCode = """
function findPath(sx, sy, gx, gy, GRID_SIZE, worldMap) {
    const q = [[sx, sy]];
    const visited = new Set();
    visited.add(sx + ',' + sy);
    const parent = new Map();
    const dArr = [[0,1], [0,-1], [1,0], [-1,0]];
    let found = false;

    while(q.length > 0) {
        const [cx, cy] = q.shift();
        if (cx === gx && cy === gy) {
            found = true; break;
        }

        for (let idx = 0; idx < dArr.length; idx++) {
            const nx = cx + dArr[idx][0];
            const ny = cy + dArr[idx][1];
            if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
                const key = nx + ',' + ny;
                if (!visited.has(key)) {
                    visited.add(key);
                    if (!isCellOccupied(nx, ny, worldMap) || (nx===gx && ny===gy)) {
                        parent.set(key, [cx, cy]);
                        q.push([nx, ny]);
                    }
                }
            }
        }
    }

    if (!found) return [];
    const path = [];
    let curr = [gx, gy];
    while(curr) {
        path.push(curr);
        if (curr[0]===sx && curr[1]===sy) break;
        curr = parent.get(curr[0] + ',' + curr[1]);
    }
    return path.reverse();
}

function generateSweepPath(colStart, colEnd, GRID_SIZE, WORLD_BOUNDARY, worldMap, cruiseAltitude) {
    const waypoints = [];
    let lastValid = null;

    for (let cx = colStart; cx < colEnd; cx++) {
        const ascending = (cx - colStart) % 2 === 0;
        const rows = ascending
            ? Array.from({ length: GRID_SIZE }, (_, i) => i)
            : Array.from({ length: GRID_SIZE }, (_, i) => GRID_SIZE - 1 - i);

        for (const cy of rows) {
            if (isCellOccupied(cx, cy, worldMap)) continue;

            if (lastValid && (Math.abs(lastValid.cx - cx) + Math.abs(lastValid.cy - cy) > 1)) {
                const path = findPath(lastValid.cx, lastValid.cy, cx, cy, GRID_SIZE, worldMap);
                for (let i = 1; i < path.length - 1; i++) {
                    waypoints.push({
                        x: cellToWorld(path[i][0], GRID_SIZE, WORLD_BOUNDARY),
                        y: cellToWorld(path[i][1], GRID_SIZE, WORLD_BOUNDARY),
                        z: cruiseAltitude,
                    });
                }
            }

            waypoints.push({
                x: cellToWorld(cx, GRID_SIZE, WORLD_BOUNDARY),
                y: cellToWorld(cy, GRID_SIZE, WORLD_BOUNDARY),
                z: cruiseAltitude,
            });
            lastValid = {cx, cy};
        }
    }
    return waypoints;
}
"""

# Replace the old generateSweepPath
pattern = r"function generateSweepPath[\s\S]*?return waypoints;\n\}"
text = re.sub(pattern, bfsCode.strip(), text)

with codecs.open(path, 'w', 'utf8') as f:
    f.write(text)

print("Patch applied.")
