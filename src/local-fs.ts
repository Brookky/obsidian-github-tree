import type { TreeNode } from "./types";

// Using require for Node.js built-ins (available in Obsidian desktop / Electron)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require("fs") as typeof import("fs");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodePath = require("path") as typeof import("path");

const DEFAULT_IGNORE = new Set([
    ".git",
    ".obsidian",
    ".omc",
    ".claude",
    "node_modules",
    ".DS_Store",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".turbo",
    ".vite",
]);

export class LocalFS {
    buildTree(rootPath: string, ignoreExtra: string[] = []): TreeNode[] {
        const ignore = new Set([...DEFAULT_IGNORE, ...ignoreExtra]);
        try {
            return this.readDir(rootPath, rootPath, ignore);
        } catch (err) {
            console.error("GitHub Tree (local): failed to read path", rootPath, err);
            throw err;
        }
    }

    private readDir(rootPath: string, currentPath: string, ignore: Set<string>): TreeNode[] {
        let entries: import("fs").Dirent[];
        try {
            entries = fs.readdirSync(currentPath, { withFileTypes: true });
        } catch {
            return [];
        }

        const nodes: TreeNode[] = [];

        for (const entry of entries) {
            if (ignore.has(entry.name)) continue;

            const fullPath = nodePath.join(currentPath, entry.name);
            const relativePath = nodePath.relative(rootPath, fullPath);

            if (entry.isDirectory()) {
                nodes.push({
                    name: entry.name,
                    path: relativePath,
                    type: "folder",
                    children: this.readDir(rootPath, fullPath, ignore),
                    sha: "",
                });
            } else if (entry.isFile()) {
                let size: number | undefined;
                try {
                    size = fs.statSync(fullPath).size;
                } catch { /* ignore */ }

                nodes.push({
                    name: entry.name,
                    path: relativePath,
                    type: "file",
                    children: [],
                    sha: "",
                    size,
                });
            }
        }

        // Folders first, then alphabetical
        return nodes.sort((a, b) => {
            if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        });
    }

    openFile(fullPath: string) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { shell } = (window as any).require("electron");
            shell.openPath(fullPath);
        } catch {
            navigator.clipboard.writeText(fullPath);
        }
    }

    revealInFinder(fullPath: string) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { shell } = (window as any).require("electron");
            shell.showItemInFolder(fullPath);
        } catch { /* ignore */ }
    }

    resolvePath(localPath: string, filePath: string): string {
        return nodePath.join(localPath, filePath);
    }
}
