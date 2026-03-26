export interface GitHubTreeItem {
    path: string;
    mode: string;
    type: "blob" | "tree";
    sha: string;
    size?: number;
    url: string;
}

export interface GitHubAPITreeResponse {
    sha: string;
    url: string;
    tree: GitHubTreeItem[];
    truncated: boolean;
}

export interface TreeNode {
    name: string;
    path: string;
    type: "file" | "folder";
    children: TreeNode[];
    sha: string;
    size?: number;
}

export interface Repository {
    id: string;
    owner: string;
    name: string;
    branch: string;
    displayName: string;
}

export interface GitHubTreeSettings {
    token: string;
    repositories: Repository[];
    activeRepoId: string;
    cacheTimeout: number;
    defaultExpanded: boolean;
    showFileSize: boolean;
}

export interface CacheEntry {
    data: TreeNode[];
    timestamp: number;
    branches: string[];
}
