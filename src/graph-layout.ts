import type { GitCommit, CommitRow, Edge } from "./types";

const COLORS = [
    "#4C9BE8", // blue
    "#E06C75", // red
    "#98C379", // green
    "#E5C07B", // yellow
    "#C678DD", // purple
    "#56B6C2", // cyan
    "#D19A66", // orange
    "#BE5046", // dark red
    "#61AFEF", // light blue
    "#ABB2BF", // gray
];

function color(lane: number): string {
    return COLORS[lane % COLORS.length];
}

/**
 * Assign graph lanes to commits and compute edge data for SVG rendering.
 *
 * Lane model: `activeLanes[i]` holds the hash this lane is "waiting for"
 * (i.e. the next commit that should continue or merge into this lane).
 * null means the lane is free.
 */
export function layoutGraph(commits: GitCommit[]): CommitRow[] {
    // activeLanes[i] = hash expected in this lane | null (free)
    let lanes: (string | null)[] = [];
    const laneColors: string[] = [];

    const rows: CommitRow[] = [];

    for (const commit of commits) {
        // ── Find this commit's lane ──────────────────────────────
        let myLane = lanes.indexOf(commit.hash);
        if (myLane === -1) {
            // Not yet expected by any lane → open a new or free one
            myLane = lanes.indexOf(null);
            if (myLane === -1) {
                myLane = lanes.length;
                lanes.push(null);
                laneColors.push(color(myLane));
            }
        }
        const myColor = laneColors[myLane];

        // Snapshot before mutation (for topEdges)
        const before = lanes.map((h) => h);

        // ── Update lanes for parents ─────────────────────────────
        // First parent continues this lane
        lanes[myLane] = commit.parents[0] ?? null;

        // Extra parents open or join lanes
        for (let pi = 1; pi < commit.parents.length; pi++) {
            const pHash = commit.parents[pi];
            let pLane = lanes.indexOf(pHash);
            if (pLane === -1) {
                pLane = lanes.indexOf(null);
                if (pLane === -1) {
                    pLane = lanes.length;
                    lanes.push(null);
                    laneColors.push(color(pLane));
                }
                lanes[pLane] = pHash;
            }
        }

        // Trim trailing nulls
        while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();

        const after = lanes.map((h) => h);

        // ── Compute topEdges (previous row → this row) ───────────
        // For each lane active in `before`, find where it lands in `after`
        const topEdges: Edge[] = [];
        for (let li = 0; li < before.length; li++) {
            const h = before[li];
            if (h === null) continue;
            if (li === myLane && h === commit.hash) {
                // This lane was waiting for *this* commit → line ends here
                topEdges.push({ fromLane: li, toLane: myLane, color: laneColors[li] });
            } else {
                // This lane passes through → straight vertical (or curves if rearranged)
                const toLane = after.indexOf(h);
                if (toLane !== -1) {
                    topEdges.push({ fromLane: li, toLane: li, color: laneColors[li] });
                }
            }
        }
        // Also draw lines from parent lanes that merge into myLane
        for (let pi = 0; pi < commit.parents.length; pi++) {
            const pHash = commit.parents[pi];
            const pLane = before.indexOf(pHash);
            if (pLane !== -1 && pLane !== myLane) {
                // Merge line coming in from pLane to myLane
                topEdges.push({ fromLane: pLane, toLane: myLane, color: laneColors[pLane] ?? myColor });
            }
        }

        // ── Compute bottomEdges (this row → next row) ────────────
        const bottomEdges: Edge[] = [];
        for (let li = 0; li < after.length; li++) {
            const h = after[li];
            if (h === null) continue;
            // Where was this hash before?
            const fromLane = before.indexOf(h) !== -1 ? before.indexOf(h) : myLane;
            bottomEdges.push({ fromLane: li === fromLane ? li : fromLane, toLane: li, color: laneColors[li] });
        }

        const laneCount = Math.max(before.length, after.length, myLane + 1);

        rows.push({
            commit,
            lane: myLane,
            color: myColor,
            topEdges,
            bottomEdges,
            laneCount,
        });
    }

    return rows;
}
