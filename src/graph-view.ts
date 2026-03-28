import { ItemView, WorkspaceLeaf, setIcon, Notice, Menu } from "obsidian";
import type GitHubTreePlugin from "./main";
import { getCommits } from "./git-log";
import { layoutGraph } from "./graph-layout";
import type { CommitRow, Edge, RefLabel } from "./types";

export const VIEW_TYPE_GIT_GRAPH = "git-graph-view";

const ROW_H = 28;      // px per commit row
const LANE_W = 16;     // px per lane column
const DOT_R = 4;       // commit dot radius
const LINE_W = 2;      // stroke width

function laneX(lane: number): number {
    return (lane + 0.5) * LANE_W;
}

function buildPath(fromX: number, toX: number, y0: number, y1: number): string {
    if (Math.abs(fromX - toX) < 1) {
        return `M ${fromX},${y0} L ${toX},${y1}`;
    }
    const mid = (y0 + y1) / 2;
    return `M ${fromX},${y0} C ${fromX},${mid} ${toX},${mid} ${toX},${y1}`;
}

function renderRowSVG(row: CommitRow): SVGSVGElement {
    const svgW = (row.laneCount + 1) * LANE_W;
    const midY = ROW_H / 2;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", String(svgW));
    svg.setAttribute("height", String(ROW_H));
    svg.classList.add("git-graph-svg");

    const addPath = (d: string, stroke: string) => {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("stroke", stroke);
        path.setAttribute("stroke-width", String(LINE_W));
        path.setAttribute("fill", "none");
        path.setAttribute("stroke-linecap", "round");
        svg.appendChild(path);
    };

    // Top edges (from previous row into this row's midpoint)
    for (const edge of row.topEdges) {
        const fx = laneX(edge.fromLane);
        const tx = laneX(edge.toLane);
        addPath(buildPath(fx, tx, 0, midY), edge.color);
    }

    // Bottom edges (from midpoint to next row)
    for (const edge of row.bottomEdges) {
        const fx = laneX(edge.fromLane);
        const tx = laneX(edge.toLane);
        addPath(buildPath(fx, tx, midY, ROW_H), edge.color);
    }

    // Commit dot
    const cx = laneX(row.lane);
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(cx));
    circle.setAttribute("cy", String(midY));
    circle.setAttribute("r", String(DOT_R));
    circle.setAttribute("fill", row.color);
    circle.setAttribute("stroke", "var(--background-primary)");
    circle.setAttribute("stroke-width", "1.5");
    svg.appendChild(circle);

    return svg;
}

function refBadge(ref: RefLabel): HTMLElement {
    const badge = document.createElement("span");
    badge.className = `git-graph-ref git-graph-ref--${ref.type}`;
    badge.textContent = ref.name;
    return badge;
}

export class GitGraphView extends ItemView {
    private rows: CommitRow[] = [];
    private isLoading = false;
    private searchQuery = "";
    private searchTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(leaf: WorkspaceLeaf, private plugin: GitHubTreePlugin) {
        super(leaf);
    }

    getViewType() { return VIEW_TYPE_GIT_GRAPH; }
    getDisplayText() { return "Git Graph"; }
    getIcon() { return "git-branch"; }

    async onOpen() {
        this.render();
        const repo = this.getActiveRepo();
        if (repo) await this.loadGraph(repo.path);
    }

    async onClose() {
        if (this.searchTimer) clearTimeout(this.searchTimer);
    }

    private getActiveRepo() {
        return this.plugin.settings.repositories.find(
            (r) => r.id === this.plugin.settings.activeRepoId
        ) ?? null;
    }

    // ── Full render ──────────────────────────────────────────────
    private render() {
        const root = this.containerEl.children[1] as HTMLElement;
        root.empty();
        root.addClass("git-graph-container");

        this.renderHeader(root.createDiv({ cls: "git-graph-header" }));
        this.renderSearch(root.createDiv({ cls: "git-graph-search-wrap" }));

        const content = root.createDiv({ cls: "git-graph-content" });

        if (this.plugin.settings.repositories.length === 0) {
            this.renderEmpty(content);
        } else if (this.isLoading) {
            this.renderLoading(content);
        } else if (this.rows.length > 0) {
            this.renderGraph(content);
        } else {
            content.createDiv({ cls: "git-graph-hint", text: "No commits found." });
        }
    }

    // ── Header ───────────────────────────────────────────────────
    private renderHeader(header: HTMLElement) {
        const titleRow = header.createDiv({ cls: "git-graph-header-row" });

        // Repo selector
        if (this.plugin.settings.repositories.length > 0) {
            const sel = titleRow.createEl("select", { cls: "git-graph-select" });
            for (const repo of this.plugin.settings.repositories) {
                const label = repo.displayName || repo.path.split("/").pop() || repo.path;
                const opt = sel.createEl("option", { value: repo.id, text: label });
                if (repo.id === this.plugin.settings.activeRepoId) opt.selected = true;
            }
            sel.addEventListener("change", async () => {
                this.plugin.settings.activeRepoId = sel.value;
                await this.plugin.saveSettings();
                const repo = this.getActiveRepo();
                if (repo) await this.loadGraph(repo.path);
            });
        }

        // Options row
        const optRow = header.createDiv({ cls: "git-graph-header-row git-graph-opts" });

        // All branches toggle
        const allBranchWrap = optRow.createEl("label", { cls: "git-graph-toggle-label" });
        const allBranchCheck = allBranchWrap.createEl("input", { type: "checkbox" });
        allBranchCheck.checked = this.plugin.settings.showAllBranches;
        allBranchWrap.createSpan({ text: "All branches" });
        allBranchCheck.addEventListener("change", async () => {
            this.plugin.settings.showAllBranches = allBranchCheck.checked;
            await this.plugin.saveSettings();
            const repo = this.getActiveRepo();
            if (repo) await this.loadGraph(repo.path);
        });

        // Max commits display
        optRow.createSpan({
            cls: "git-graph-meta",
            text: this.rows.length > 0 ? `${this.rows.length} commits` : "",
        });

        // Refresh btn
        const refreshBtn = optRow.createEl("button", {
            cls: "git-graph-icon-btn clickable-icon",
            attr: { "aria-label": "Refresh" },
        });
        setIcon(refreshBtn, "refresh-cw");
        refreshBtn.addEventListener("click", async () => {
            const repo = this.getActiveRepo();
            if (repo) await this.loadGraph(repo.path);
        });

        // Settings btn
        const settingsBtn = optRow.createEl("button", {
            cls: "git-graph-icon-btn clickable-icon",
            attr: { "aria-label": "Settings" },
        });
        setIcon(settingsBtn, "settings");
        settingsBtn.addEventListener("click", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.app as any).setting?.open?.();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.app as any).setting?.openTabById?.("obsidian-github-tree");
        });
    }

    // ── Search ───────────────────────────────────────────────────
    private renderSearch(wrap: HTMLElement) {
        const inner = wrap.createDiv({ cls: "git-graph-search-inner" });
        const icon = inner.createSpan({ cls: "git-graph-search-icon" });
        setIcon(icon, "search");

        const input = inner.createEl("input", {
            cls: "git-graph-search-input",
            attr: { type: "text", placeholder: "Filter commits…" },
        });
        input.value = this.searchQuery;

        input.addEventListener("input", () => {
            if (this.searchTimer) clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => {
                this.searchQuery = input.value.toLowerCase().trim();
                const content = this.containerEl.querySelector(".git-graph-content") as HTMLElement | null;
                if (content) { content.empty(); this.renderGraph(content); }
                // update clear btn
                wrap.empty();
                this.renderSearch(wrap);
            }, 150);
        });

        if (this.searchQuery) {
            const clear = inner.createEl("button", {
                cls: "git-graph-search-clear clickable-icon",
                attr: { "aria-label": "Clear" },
            });
            setIcon(clear, "x");
            clear.addEventListener("click", () => {
                this.searchQuery = "";
                const content = this.containerEl.querySelector(".git-graph-content") as HTMLElement | null;
                if (content) { content.empty(); this.renderGraph(content); }
                wrap.empty();
                this.renderSearch(wrap);
            });
        }
    }

    // ── Graph rows ───────────────────────────────────────────────
    private renderGraph(content: HTMLElement) {
        const filtered = this.searchQuery
            ? this.rows.filter(
                (r) =>
                    r.commit.subject.toLowerCase().includes(this.searchQuery) ||
                    r.commit.author.toLowerCase().includes(this.searchQuery) ||
                    r.commit.shortHash.toLowerCase().includes(this.searchQuery) ||
                    r.commit.refs.some((ref) => ref.name.toLowerCase().includes(this.searchQuery))
            )
            : this.rows;

        if (filtered.length === 0) {
            content.createDiv({ cls: "git-graph-hint", text: "No matching commits." });
            return;
        }

        for (const row of filtered) {
            this.renderRow(content, row);
        }
    }

    private renderRow(container: HTMLElement, row: CommitRow) {
        const rowEl = container.createDiv({ cls: "git-graph-row" });
        rowEl.setAttribute("title", `${row.commit.hash}\n${row.commit.author} · ${row.commit.relativeDate}`);

        // SVG graph cell
        const svgCell = rowEl.createDiv({ cls: "git-graph-cell-svg" });
        svgCell.appendChild(renderRowSVG(row));

        // Info cell
        const info = rowEl.createDiv({ cls: "git-graph-cell-info" });

        // Ref badges
        if (row.commit.refs.length > 0) {
            const badgesEl = info.createDiv({ cls: "git-graph-refs" });
            for (const ref of row.commit.refs) {
                badgesEl.appendChild(refBadge(ref));
            }
        }

        // Subject
        const subject = info.createSpan({ cls: "git-graph-subject", text: row.commit.subject });

        // Meta (author · date · hash)
        const meta = info.createDiv({ cls: "git-graph-meta-row" });
        meta.createSpan({ cls: "git-graph-author", text: row.commit.author });
        meta.createSpan({ cls: "git-graph-sep", text: "·" });
        meta.createSpan({ cls: "git-graph-date", text: row.commit.relativeDate });
        meta.createSpan({ cls: "git-graph-sep", text: "·" });
        meta.createSpan({ cls: "git-graph-hash", text: row.commit.shortHash });

        // Click: copy hash
        rowEl.addEventListener("click", () => {
            navigator.clipboard.writeText(row.commit.hash);
            new Notice(`Copied: ${row.commit.shortHash}`);
        });

        // Context menu
        rowEl.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            const menu = new Menu();
            menu.addItem((i) =>
                i.setTitle("Copy Commit Hash").setIcon("copy").onClick(() => {
                    navigator.clipboard.writeText(row.commit.hash);
                    new Notice(`Copied: ${row.commit.hash}`);
                })
            );
            menu.addItem((i) =>
                i.setTitle("Copy Short Hash").setIcon("hash").onClick(() => {
                    navigator.clipboard.writeText(row.commit.shortHash);
                    new Notice(`Copied: ${row.commit.shortHash}`);
                })
            );
            menu.addItem((i) =>
                i.setTitle("Copy Commit Message").setIcon("message-square").onClick(() => {
                    navigator.clipboard.writeText(row.commit.subject);
                    new Notice("Message copied!");
                })
            );
            menu.showAtMouseEvent(e);
        });
    }

    // ── States ───────────────────────────────────────────────────
    private renderEmpty(container: HTMLElement) {
        const el = container.createDiv({ cls: "git-graph-empty" });
        const iconEl = el.createDiv({ cls: "git-graph-empty-icon" });
        setIcon(iconEl, "git-branch");
        el.createEl("p", { text: "No repositories configured." });
        const btn = el.createEl("button", { text: "Open Settings", cls: "mod-cta" });
        btn.addEventListener("click", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.app as any).setting?.open?.();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this.app as any).setting?.openTabById?.("obsidian-github-tree");
        });
    }

    private renderLoading(container: HTMLElement) {
        const el = container.createDiv({ cls: "git-graph-loading" });
        el.createDiv({ cls: "git-graph-spinner" });
        el.createSpan({ text: "Reading git log…" });
    }

    // ── Data ─────────────────────────────────────────────────────
    async loadGraph(repoPath: string) {
        this.isLoading = true;
        this.render();

        try {
            const raw = getCommits(
                repoPath,
                this.plugin.settings.maxCommits,
                this.plugin.settings.showAllBranches
            );
            this.rows = layoutGraph(raw);
        } catch (err: unknown) {
            console.error("Git Graph: load failed", err);
            new Notice(`Git Graph: ${(err as Error).message ?? "Failed to read git log"}`, 7000);
            this.rows = [];
        } finally {
            this.isLoading = false;
            this.render();
        }
    }

    async refresh() {
        const repo = this.getActiveRepo();
        if (repo) await this.loadGraph(repo.path);
        else this.render();
    }
}
