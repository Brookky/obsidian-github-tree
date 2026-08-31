export interface RefLabel {
    name: string;
    type: "head" | "branch" | "remote" | "tag";
}

export interface GitCommit {
    hash: string;
    shortHash: string;
    subject: string;
    author: string;
    relativeDate: string;
    parents: string[];
    refs: RefLabel[];
}

export interface Edge {
    fromLane: number;
    toLane: number;
    color: string;
}

export interface CommitRow {
    commit: GitCommit;
    lane: number;
    color: string;
    /** edges drawn in the upper half of this row (arriving from previous row) */
    topEdges: Edge[];
    /** edges drawn in the lower half of this row (leaving to next row) */
    bottomEdges: Edge[];
    /** total active lanes in this row (for SVG width) */
    laneCount: number;
}

export interface FileChange {
    added: number | null;   // null = binary
    deleted: number | null;
    path: string;
}

export interface CommitDetail {
    hash: string;
    shortHash: string;
    subject: string;
    body: string;
    author: string;
    date: string;
    relativeDate: string;
    files: FileChange[];
    rawDiff: string;
}

export interface RepoConfig {
    id: string;
    path: string;
    displayName: string;
}

export interface GitGraphSettings {
    repositories: RepoConfig[];
    activeRepoId: string;
    maxCommits: number;
    showAllBranches: boolean;
}
