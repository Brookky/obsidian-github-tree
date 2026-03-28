import { ItemView, WorkspaceLeaf, setIcon, Notice, Menu, Platform } from "obsidian";
import type GitHubTreePlugin from "./main";
import { GitHubAPI } from "./github-api";
import { LocalFS } from "./local-fs";
import type { TreeNode, Repository } from "./types";

export const VIEW_TYPE_GITHUB_TREE = "github-tree-view";

const FILE_ICONS: Record<string, string> = {
    ts: "file-code", tsx: "file-code", js: "file-code", jsx: "file-code",
    py: "file-code", rb: "file-code", go: "file-code", rs: "file-code",
    java: "file-code", c: "file-code", cpp: "file-code", cs: "file-code",
    php: "file-code", swift: "file-code", kt: "file-code", vue: "file-code",
    md: "file-text", mdx: "file-text", txt: "file-text", rst: "file-text",
    json: "braces", yaml: "braces", yml: "braces", toml: "braces", xml: "code",
    html: "code", htm: "code", css: "palette", scss: "palette", less: "palette",
    png: "image", jpg: "image", jpeg: "image", gif: "image", svg: "image",
    webp: "image", ico: "image",
    pdf: "file-text", sh: "terminal", bash: "terminal", zsh: "terminal",
    fish: "terminal", lock: "lock",
};

function getFileIcon(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (name.toLowerCase() === "dockerfile") return "container";
    if (name.startsWith(".git")) return "git-branch";
    return FILE_ICONS[ext] ?? "file";
}

function formatFileSize(bytes?: number): string {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export class GitHubTreeView extends ItemView {
    private api: GitHubAPI;
    private localFs: LocalFS;
    private currentTree: TreeNode[] = [];
    private expandedPaths = new Set<string>();
    private searchQuery = "";
    private isLoading = false;
    private branches: string[] = [];
    private searchTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(leaf: WorkspaceLeaf, private plugin: GitHubTreePlugin) {
        super(leaf);
        this.api = new GitHubAPI(plugin.settings.token, plugin.settings.cacheTimeout);
        this.localFs = new LocalFS();
    }

    getViewType() { return VIEW_TYPE_GITHUB_TREE; }
    getDisplayText() { return "GitHub Tree"; }
    getIcon() { return "github"; }

    async onOpen() {
        this.render();
        const repo = this.getActiveRepo();
        if (repo) await this.loadTree(repo);
    }

    async onClose() {
        if (this.searchTimer) clearTimeout(this.searchTimer);
    }

    private getActiveRepo(): Repository | null {
        return (
            this.plugin.settings.repositories.find(
                (r) => r.id === this.plugin.settings.activeRepoId
            ) ?? null
        );
    }

    // ── Full re-render ──────────────────────────────────────────
    private render() {
        const root = this.containerEl.children[1] as HTMLElement;
        root.empty();
        root.addClass("github-tree-container");

        this.renderHeader(root.createDiv({ cls: "github-tree-header" }));
        this.renderSearch(root.createDiv({ cls: "github-tree-search-wrap" }));

        const content = root.createDiv({ cls: "github-tree-content" });

        if (this.plugin.settings.repositories.length === 0) {
            this.renderEmpty(content);
        } else if (this.isLoading) {
            this.renderLoading(content);
        } else if (this.currentTree.length > 0) {
            this.renderNodes(content, this.currentTree, 0);
        } else {
            content.createDiv({
                cls: "github-tree-hint",
                text: "Select a source to browse.",
            });
        }
    }

    // ── Header ──────────────────────────────────────────────────
    private renderHeader(header: HTMLElement) {
        const activeRepo = this.getActiveRepo();
        const isLocal = activeRepo?.sourceType === "local";

        // Source selector
        if (this.plugin.settings.repositories.length > 0) {
            const repoRow = header.createDiv({ cls: "github-tree-row" });
            const sel = repoRow.createEl("select", { cls: "github-tree-select github-tree-repo-select" });
            for (const repo of this.plugin.settings.repositories) {
                const typePrefix = repo.sourceType === "local" ? "📁 " : "🐙 ";
                const label = typePrefix + (repo.displayName ||
                    (repo.sourceType === "local"
                        ? (repo.localPath.split("/").pop() || repo.localPath)
                        : `${repo.owner}/${repo.name}`));
                const opt = sel.createEl("option", { value: repo.id, text: label });
                if (repo.id === this.plugin.settings.activeRepoId) opt.selected = true;
            }
            sel.addEventListener("change", async () => {
                this.plugin.settings.activeRepoId = sel.value;
                this.expandedPaths.clear();
                this.searchQuery = "";
                this.branches = [];
                await this.plugin.saveSettings();
                const repo = this.getActiveRepo();
                if (repo) await this.loadTree(repo);
            });
        }

        // Actions row
        const actions = header.createDiv({ cls: "github-tree-row github-tree-actions" });

        // Branch selector (GitHub only)
        if (!isLocal) {
            const branchWrap = actions.createDiv({ cls: "github-tree-branch-wrap" });
            const branchIconEl = branchWrap.createSpan({ cls: "github-tree-icon-sm" });
            setIcon(branchIconEl, "git-branch");

            if (this.branches.length > 0) {
                const bSel = branchWrap.createEl("select", { cls: "github-tree-select github-tree-branch-select" });
                for (const b of this.branches) {
                    const opt = bSel.createEl("option", { value: b, text: b });
                    if (activeRepo && b === activeRepo.branch) opt.selected = true;
                }
                bSel.addEventListener("change", async () => {
                    const repo = this.getActiveRepo();
                    if (repo) {
                        repo.branch = bSel.value;
                        this.api.clearCache(repo);
                        this.expandedPaths.clear();
                        await this.plugin.saveSettings();
                        await this.loadTree(repo);
                    }
                });
            } else if (activeRepo) {
                branchWrap.createSpan({
                    cls: "github-tree-branch-label",
                    text: activeRepo.branch || "main",
                });
            }
        } else {
            // Local: show folder path hint
            actions.createDiv({ cls: "github-tree-branch-wrap" }).createSpan({
                cls: "github-tree-branch-label",
                text: activeRepo?.localPath.split("/").pop() ?? "",
                attr: { title: activeRepo?.localPath ?? "" },
            });
        }

        const iconBtn = (parent: HTMLElement, icon: string, label: string, fn: () => void) => {
            const btn = parent.createEl("button", {
                cls: "github-tree-icon-btn clickable-icon",
                attr: { "aria-label": label },
            });
            setIcon(btn, icon);
            btn.addEventListener("click", fn);
        };

        iconBtn(actions, "refresh-cw", "Refresh", async () => {
            const repo = this.getActiveRepo();
            if (repo) {
                if (repo.sourceType !== "local") this.api.clearCache(repo);
                await this.loadTree(repo);
            }
        });

        iconBtn(actions, "chevrons-up-down", "Collapse all", () => {
            this.expandedPaths.clear();
            this.render();
        });

        iconBtn(actions, "settings", "Settings", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.app as any).setting?.open?.();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.app as any).setting?.openTabById?.("obsidian-github-tree");
        });
    }

    // ── Search ──────────────────────────────────────────────────
    private renderSearch(wrap: HTMLElement) {
        const inputWrap = wrap.createDiv({ cls: "github-tree-search-inner" });
        const searchIcon = inputWrap.createSpan({ cls: "github-tree-search-icon" });
        setIcon(searchIcon, "search");

        const input = inputWrap.createEl("input", {
            cls: "github-tree-search-input",
            attr: { type: "text", placeholder: "Filter files…" },
        });
        input.value = this.searchQuery;

        input.addEventListener("input", () => {
            if (this.searchTimer) clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => {
                this.searchQuery = input.value.toLowerCase().trim();
                this.refreshContent();
            }, 150);
        });

        if (this.searchQuery) {
            const clearBtn = inputWrap.createEl("button", {
                cls: "github-tree-search-clear clickable-icon",
                attr: { "aria-label": "Clear" },
            });
            setIcon(clearBtn, "x");
            clearBtn.addEventListener("click", () => {
                this.searchQuery = "";
                input.value = "";
                this.refreshContent();
            });
        }
    }

    private refreshContent() {
        const content = this.containerEl.querySelector(".github-tree-content") as HTMLElement | null;
        if (!content) { this.render(); return; }
        content.empty();
        if (this.currentTree.length > 0) this.renderNodes(content, this.currentTree, 0);
        const searchWrap = this.containerEl.querySelector(".github-tree-search-wrap") as HTMLElement | null;
        if (searchWrap) { searchWrap.empty(); this.renderSearch(searchWrap); }
    }

    // ── Empty / Loading ──────────────────────────────────────────
    private renderEmpty(container: HTMLElement) {
        const el = container.createDiv({ cls: "github-tree-empty" });
        const iconEl = el.createDiv({ cls: "github-tree-empty-icon" });
        setIcon(iconEl, "github");
        el.createEl("p", { text: "No sources configured." });
        const btn = el.createEl("button", { text: "Open Settings", cls: "mod-cta" });
        btn.addEventListener("click", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.app as any).setting?.open?.();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.app as any).setting?.openTabById?.("obsidian-github-tree");
        });
    }

    private renderLoading(container: HTMLElement) {
        const el = container.createDiv({ cls: "github-tree-loading" });
        el.createDiv({ cls: "github-tree-spinner" });
        el.createSpan({ text: "Loading…" });
    }

    // ── Tree nodes ───────────────────────────────────────────────
    private matchesSearch(node: TreeNode): boolean {
        if (!this.searchQuery) return true;
        if (node.name.toLowerCase().includes(this.searchQuery)) return true;
        if (node.type === "folder") return node.children.some((c) => this.matchesSearch(c));
        return false;
    }

    private renderNodes(container: HTMLElement, nodes: TreeNode[], depth: number) {
        for (const node of nodes) {
            if (!this.matchesSearch(node)) continue;
            node.type === "folder"
                ? this.renderFolder(container, node, depth)
                : this.renderFile(container, node, depth);
        }
    }

    private renderFolder(container: HTMLElement, node: TreeNode, depth: number) {
        const forceExpand = this.searchQuery.length > 0;
        const isExpanded =
            forceExpand ||
            this.expandedPaths.has(node.path) ||
            this.plugin.settings.defaultExpanded;

        const folderEl = container.createDiv({ cls: "github-tree-node github-tree-folder" });
        folderEl.style.setProperty("--depth", String(depth));

        const row = folderEl.createDiv({ cls: "github-tree-node-row" });
        const chevron = row.createSpan({ cls: "github-tree-chevron" });
        setIcon(chevron, isExpanded ? "chevron-down" : "chevron-right");
        const folderIcon = row.createSpan({ cls: "github-tree-node-icon" });
        setIcon(folderIcon, isExpanded ? "folder-open" : "folder");
        row.createSpan({ cls: "github-tree-node-name", text: node.name });

        const childrenEl = folderEl.createDiv({ cls: "github-tree-children" });
        if (isExpanded) {
            this.renderNodes(childrenEl, node.children, depth + 1);
            childrenEl.addClass("is-open");
        }

        row.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleFolder(node, childrenEl, chevron, folderIcon, depth);
        });

        row.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            const repo = this.getActiveRepo();
            if (!repo) return;
            const menu = new Menu();
            if (repo.sourceType === "local") {
                const fullPath = this.localFs.resolvePath(repo.localPath, node.path);
                menu.addItem((i) =>
                    i.setTitle("Reveal in Finder").setIcon("folder-open").onClick(() =>
                        this.localFs.revealInFinder(fullPath)
                    )
                );
            } else {
                menu.addItem((i) =>
                    i.setTitle("Open on GitHub").setIcon("external-link").onClick(() =>
                        window.open(this.api.getFolderUrl(repo, node.path), "_blank")
                    )
                );
            }
            menu.addItem((i) =>
                i.setTitle("Copy Path").setIcon("copy").onClick(() => {
                    navigator.clipboard.writeText(node.path);
                    new Notice(`Copied: ${node.path}`);
                })
            );
            menu.showAtMouseEvent(e);
        });
    }

    private toggleFolder(
        node: TreeNode,
        childrenEl: HTMLElement,
        chevron: HTMLElement,
        folderIcon: HTMLElement,
        depth: number
    ) {
        const isOpen = this.expandedPaths.has(node.path) || childrenEl.hasClass("is-open");

        if (isOpen) {
            this.expandedPaths.delete(node.path);
            setIcon(chevron, "chevron-right");
            setIcon(folderIcon, "folder");

            const currentH = childrenEl.scrollHeight;
            childrenEl.style.height = currentH + "px";
            childrenEl.removeClass("is-open");
            childrenEl.getBoundingClientRect();
            childrenEl.style.height = "0px";

            childrenEl.addEventListener("transitionend", () => {
                childrenEl.empty();
                childrenEl.style.height = "";
            }, { once: true });
        } else {
            this.expandedPaths.add(node.path);
            setIcon(chevron, "chevron-down");
            setIcon(folderIcon, "folder-open");

            childrenEl.empty();
            childrenEl.style.height = "0px";
            this.renderNodes(childrenEl, node.children, depth + 1);

            const targetH = childrenEl.scrollHeight;
            childrenEl.addClass("is-open");
            childrenEl.getBoundingClientRect();
            childrenEl.style.height = targetH + "px";

            childrenEl.addEventListener("transitionend", () => {
                childrenEl.style.height = "auto";
            }, { once: true });
        }
    }

    private renderFile(container: HTMLElement, node: TreeNode, depth: number) {
        const repo = this.getActiveRepo();
        const fileEl = container.createDiv({ cls: "github-tree-node github-tree-file" });
        fileEl.style.setProperty("--depth", String(depth));

        const row = fileEl.createDiv({ cls: "github-tree-node-row" });
        row.setAttribute("title", node.path);

        row.createSpan({ cls: "github-tree-chevron github-tree-chevron--file" });
        const icon = row.createSpan({ cls: "github-tree-node-icon" });
        setIcon(icon, getFileIcon(node.name));
        row.createSpan({ cls: "github-tree-node-name", text: node.name });

        if (this.plugin.settings.showFileSize && node.size) {
            row.createSpan({ cls: "github-tree-file-size", text: formatFileSize(node.size) });
        }

        row.addEventListener("click", () => {
            if (!repo) return;
            if (repo.sourceType === "local") {
                if (Platform.isDesktopApp) {
                    const fullPath = this.localFs.resolvePath(repo.localPath, node.path);
                    this.localFs.openFile(fullPath);
                }
            } else {
                window.open(this.api.getFileUrl(repo, node.path), "_blank");
            }
        });

        row.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            if (!repo) return;
            const menu = new Menu();

            if (repo.sourceType === "local") {
                const fullPath = this.localFs.resolvePath(repo.localPath, node.path);
                menu.addItem((i) =>
                    i.setTitle("Open File").setIcon("external-link").onClick(() =>
                        this.localFs.openFile(fullPath)
                    )
                );
                menu.addItem((i) =>
                    i.setTitle("Reveal in Finder").setIcon("folder-open").onClick(() =>
                        this.localFs.revealInFinder(fullPath)
                    )
                );
                menu.addSeparator();
                menu.addItem((i) =>
                    i.setTitle("Copy Absolute Path").setIcon("copy").onClick(() => {
                        navigator.clipboard.writeText(fullPath);
                        new Notice("Path copied!");
                    })
                );
                menu.addItem((i) =>
                    i.setTitle("Copy Relative Path").setIcon("copy").onClick(() => {
                        navigator.clipboard.writeText(node.path);
                        new Notice(`Copied: ${node.path}`);
                    })
                );
            } else {
                menu.addItem((i) =>
                    i.setTitle("Open on GitHub").setIcon("external-link").onClick(() =>
                        window.open(this.api.getFileUrl(repo, node.path), "_blank")
                    )
                );
                menu.addItem((i) =>
                    i.setTitle("Open Raw").setIcon("file-code").onClick(() =>
                        window.open(this.api.getRawUrl(repo, node.path), "_blank")
                    )
                );
                menu.addSeparator();
                menu.addItem((i) =>
                    i.setTitle("Copy Path").setIcon("copy").onClick(() => {
                        navigator.clipboard.writeText(node.path);
                        new Notice(`Copied: ${node.path}`);
                    })
                );
                menu.addItem((i) =>
                    i.setTitle("Copy GitHub URL").setIcon("link").onClick(() => {
                        navigator.clipboard.writeText(this.api.getFileUrl(repo, node.path));
                        new Notice("GitHub URL copied!");
                    })
                );
            }
            menu.showAtMouseEvent(e);
        });
    }

    // ── Data loading ─────────────────────────────────────────────
    async loadTree(repo: Repository) {
        // Migrate old entries
        if (!repo.sourceType) (repo as Repository).sourceType = "github";

        const isLocal = repo.sourceType === "local";
        if (isLocal && !repo.localPath) return;
        if (!isLocal && (!repo.owner || !repo.name)) return;

        this.isLoading = true;
        this.render();

        try {
            if (isLocal) {
                this.currentTree = this.localFs.buildTree(repo.localPath);
                this.branches = [];
            } else {
                this.api.updateToken(this.plugin.settings.token);
                this.api.updateCacheTimeout(this.plugin.settings.cacheTimeout);
                this.currentTree = await this.api.fetchTree(repo);
                this.branches = this.api.getCachedBranches(repo) ?? [repo.branch];
            }

            if (this.plugin.settings.defaultExpanded) {
                this.expandAll(this.currentTree);
            }
        } catch (err: unknown) {
            console.error("GitHub Tree: load failed", err);
            const status = (err as { status?: number }).status;
            const msg = isLocal
                ? `Cannot read folder: ${repo.localPath}`
                : status === 404 ? `"${repo.owner}/${repo.name}" not found or access denied.`
                : status === 401 ? "Invalid GitHub token. Please check Settings."
                : status === 403 ? "Rate limit exceeded. Add a GitHub PAT in Settings."
                : `Failed to load: ${(err as Error).message ?? "Unknown error"}`;
            new Notice(`GitHub Tree: ${msg}`, 7000);
            this.currentTree = [];
        } finally {
            this.isLoading = false;
            this.render();
        }
    }

    private expandAll(nodes: TreeNode[]) {
        for (const node of nodes) {
            if (node.type === "folder") {
                this.expandedPaths.add(node.path);
                this.expandAll(node.children);
            }
        }
    }

    async refresh() {
        this.api.updateToken(this.plugin.settings.token);
        this.api.updateCacheTimeout(this.plugin.settings.cacheTimeout);
        const repo = this.getActiveRepo();
        if (repo) await this.loadTree(repo);
        else this.render();
    }
}
