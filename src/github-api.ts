import { requestUrl } from "obsidian";
import type { GitHubAPITreeResponse, TreeNode, CacheEntry, Repository } from "./types";

const GITHUB_API_BASE = "https://api.github.com";

export class GitHubAPI {
    private cache: Map<string, CacheEntry> = new Map();
    private cacheTimeout: number;

    constructor(private token: string, cacheTimeoutMinutes = 5) {
        this.cacheTimeout = cacheTimeoutMinutes * 60 * 1000;
    }

    updateToken(token: string) {
        this.token = token;
    }

    updateCacheTimeout(minutes: number) {
        this.cacheTimeout = minutes * 60 * 1000;
    }

    private getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            Accept: "application/vnd.github.v3+json",
            "X-GitHub-Api-Version": "2022-11-28",
        };
        if (this.token) {
            headers["Authorization"] = `Bearer ${this.token}`;
        }
        return headers;
    }

    private getCacheKey(repo: Repository): string {
        return `${repo.owner}/${repo.name}@${repo.branch}`;
    }

    isCacheValid(repo: Repository): boolean {
        const entry = this.cache.get(this.getCacheKey(repo));
        if (!entry) return false;
        return Date.now() - entry.timestamp < this.cacheTimeout;
    }

    clearCache(repo?: Repository) {
        if (repo) {
            this.cache.delete(this.getCacheKey(repo));
        } else {
            this.cache.clear();
        }
    }

    async fetchBranches(repo: Repository): Promise<string[]> {
        try {
            const response = await requestUrl({
                url: `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.name}/branches?per_page=100`,
                headers: this.getHeaders(),
            });
            return (response.json as Array<{ name: string }>).map((b) => b.name);
        } catch {
            return [repo.branch];
        }
    }

    async fetchTree(repo: Repository): Promise<TreeNode[]> {
        if (this.isCacheValid(repo)) {
            return this.cache.get(this.getCacheKey(repo))!.data;
        }

        const response = await requestUrl({
            url: `${GITHUB_API_BASE}/repos/${repo.owner}/${repo.name}/git/trees/${repo.branch}?recursive=1`,
            headers: this.getHeaders(),
        });

        const apiResponse = response.json as GitHubAPITreeResponse;
        const tree = this.buildTree(apiResponse.tree);
        const branches = await this.fetchBranches(repo);

        this.cache.set(this.getCacheKey(repo), {
            data: tree,
            timestamp: Date.now(),
            branches,
        });

        return tree;
    }

    getCachedBranches(repo: Repository): string[] | null {
        return this.cache.get(this.getCacheKey(repo))?.branches ?? null;
    }

    private buildTree(
        items: Array<{ path: string; type: string; sha: string; size?: number }>
    ): TreeNode[] {
        const root: TreeNode[] = [];
        const nodeMap = new Map<string, TreeNode>();

        // Sort: folders first, then alphabetically
        const sorted = [...items].sort((a, b) => {
            if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
            return a.path.localeCompare(b.path, undefined, { sensitivity: "base" });
        });

        for (const item of sorted) {
            const parts = item.path.split("/");
            const node: TreeNode = {
                name: parts[parts.length - 1],
                path: item.path,
                type: item.type === "tree" ? "folder" : "file",
                children: [],
                sha: item.sha,
                size: item.size,
            };

            nodeMap.set(item.path, node);

            if (parts.length === 1) {
                root.push(node);
            } else {
                const parentPath = parts.slice(0, -1).join("/");
                nodeMap.get(parentPath)?.children.push(node);
            }
        }

        return root;
    }

    getFileUrl(repo: Repository, path: string): string {
        return `https://github.com/${repo.owner}/${repo.name}/blob/${repo.branch}/${path}`;
    }

    getRawUrl(repo: Repository, path: string): string {
        return `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${repo.branch}/${path}`;
    }

    getFolderUrl(repo: Repository, path: string): string {
        return `https://github.com/${repo.owner}/${repo.name}/tree/${repo.branch}/${path}`;
    }
}
