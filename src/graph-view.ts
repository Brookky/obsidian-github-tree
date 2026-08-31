import { ItemView, WorkspaceLeaf, setIcon, Notice, Menu } from "obsidian";
import type GitHubTreePlugin from "./main";
import { getCommits, getCommitDetail } from "./git-log";
import { layoutGraph } from "./graph-layout";
import type { CommitRow, Edge, RefLabel, CommitDetail } from "./types";

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

interface DiffLine {
    type: "hunk" | "add" | "remove" | "context";
    content: string;
}

interface DiffFile {
    path: string;
    lines: DiffLine[];
}

function parseDiff(rawDiff: string): DiffFile[] {
    const files: DiffFile[] = [];
    let current: DiffFile | null = null;

    for (const line of rawDiff.split("\n")) {
        if (line.startsWith("diff --git ")) {
            if (current) files.push(current);
            const bIdx = line.lastIndexOf(" b/");
            current = { path: bIdx !== -1 ? line.slice(bIdx + 3) : "", lines: [] };
        } else if (!current) {
            continue;
        } else if (line.startsWith("@@")) {
            current.lines.push({ type: "hunk", content: line });
        } else if (line.startsWith("+") && !line.startsWith("+++")) {
            current.lines.push({ type: "add", content: line.slice(1) });
        } else if (line.startsWith("-") && !line.startsWith("---")) {
            current.lines.push({ type: "remove", content: line.slice(1) });
        } else if (line.startsWith(" ")) {
            current.lines.push({ type: "context", content: line.slice(1) });
        }
    }
    if (current) files.push(current);
    return files;
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
    private selectedHash: string | null = null;
    private detail: CommitDetail | null = null;
    private isDetailLoading = false;
    private detailRequestId = 0;

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

        const hasDetail = this.isDetailLoading || this.detail !== null;
        const body = root.createDiv({ cls: hasDetail ? "git-graph-body git-graph-body--split" : "git-graph-body" });
        const content = body.createDiv({ cls: "git-graph-content" });

        if (this.plugin.settings.repositories.length === 0) {
            this.renderEmpty(content);
        } else if (this.isLoading) {
            this.renderLoading(content);
        } else if (this.rows.length > 0) {
            this.renderGraph(content);
        } else {
            content.createDiv({ cls: "git-graph-hint", text: "No commits found." });
        }

        if (hasDetail) {
            const resizer = body.createDiv({ cls: "git-graph-resizer" });
            this.attachResizer(resizer, content);

            const detailPanel = body.createDiv({ cls: "git-graph-detail-panel" });
            if (this.isDetailLoading) {
                const loading = detailPanel.createDiv({ cls: "git-graph-detail-loading" });
                loading.createDiv({ cls: "git-graph-spinner" });
                loading.createSpan({ text: "Loading diff…" });
            } else if (this.detail) {
                this.renderDetail(detailPanel, this.detail);
            }
        }
    }

    private attachResizer(resizer: HTMLElement, contentEl: HTMLElement) {
        resizer.addEventListener("mousedown", (e: MouseEvent) => {
            const startY = e.clientY;
            const startH = contentEl.offsetHeight;

            const onMove = (ev: MouseEvent) => {
                const newH = Math.max(60, startH + (ev.clientY - startY));
                contentEl.style.flex = `0 0 ${newH}px`;
            };
            const onUp = () => {
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
            e.preventDefault();
        });
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
                this.detailRequestId++;
                this.selectedHash = null;
                this.detail = null;
                this.isDetailLoading = false;
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
        const cls = row.commit.hash === this.selectedHash
            ? "git-graph-row git-graph-row--selected"
            : "git-graph-row";
        const rowEl = container.createDiv({ cls });
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

        // Click: open detail panel
        rowEl.addEventListener("click", () => {
            const repo = this.getActiveRepo();
            if (!repo) return;
            const scrollTop = container.scrollTop;
            this.selectedHash = row.commit.hash;
            this.detail = null;
            this.isDetailLoading = true;
            const requestId = ++this.detailRequestId;
            this.render();
            const newContent = this.containerEl.querySelector(".git-graph-content") as HTMLElement | null;
            if (newContent) newContent.scrollTop = scrollTop;
            void this.loadDetail(repo.path, row.commit.hash, scrollTop, requestId);
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

    // ── Detail ───────────────────────────────────────────────────
    private async loadDetail(repoPath: string, hash: string, scrollTop: number, requestId: number) {
        await new Promise(r => setTimeout(r, 0)); // let loading UI paint first
        if (requestId !== this.detailRequestId) return;
        try {
            this.detail = getCommitDetail(repoPath, hash);
        } catch (err) {
            if (requestId !== this.detailRequestId) return;
            console.error("Git Graph: detail load failed", err);
            new Notice("Failed to load commit details");
            this.detail = null;
        } finally {
            if (requestId !== this.detailRequestId) return;
            this.isDetailLoading = false;
            this.render();
            const el = this.containerEl.querySelector(".git-graph-content") as HTMLElement | null;
            if (el) el.scrollTop = scrollTop;
        }
    }

    private renderDetail(panel: HTMLElement, detail: CommitDetail) {
        // Header
        const header = panel.createDiv({ cls: "git-graph-detail-header" });
        const titleRow = header.createDiv({ cls: "git-graph-detail-title-row" });
        titleRow.createEl("code", { cls: "git-graph-detail-hash", text: detail.shortHash });
        titleRow.createSpan({ cls: "git-graph-detail-author", text: detail.author });
        if (detail.date) {
            titleRow.createSpan({ cls: "git-graph-sep", text: "·" });
            titleRow.createSpan({ cls: "git-graph-detail-date", text: detail.date });
        }
        const closeBtn = titleRow.createEl("button", {
            cls: "git-graph-icon-btn clickable-icon",
            attr: { "aria-label": "Close detail" },
        });
        setIcon(closeBtn, "x");
        closeBtn.addEventListener("click", () => {
            this.detail = null;
            this.selectedHash = null;
            this.isDetailLoading = false;
            this.render();
        });

        header.createDiv({ cls: "git-graph-detail-subject", text: detail.subject });
        if (detail.body) {
            header.createDiv({ cls: "git-graph-detail-body", text: detail.body });
        }

        // File list
        if (detail.files.length > 0) {
            const fileSection = panel.createDiv({ cls: "git-graph-detail-files" });
            fileSection.createDiv({
                cls: "git-graph-detail-section-title",
                text: `Changed Files (${detail.files.length})`,
            });
            for (const file of detail.files) {
                const row = fileSection.createDiv({ cls: "git-graph-detail-file-row" });
                row.createSpan({ cls: "git-graph-detail-file-path", text: file.path });
                const stats = row.createSpan({ cls: "git-graph-detail-file-stats" });
                if (file.added !== null && file.added > 0)
                    stats.createSpan({ cls: "git-graph-stat-add", text: `+${file.added}` });
                if (file.deleted !== null && file.deleted > 0)
                    stats.createSpan({ cls: "git-graph-stat-del", text: `-${file.deleted}` });
                if (file.added === null)
                    stats.createSpan({ cls: "git-graph-stat-bin", text: "binary" });
            }
        }

        // Diff
        if (detail.rawDiff.trim()) {
            const diffSection = panel.createDiv({ cls: "git-graph-diff-section" });
            for (const diffFile of parseDiff(detail.rawDiff)) {
                const block = diffSection.createDiv({ cls: "git-graph-diff-file" });
                block.createDiv({ cls: "git-graph-diff-file-header", text: diffFile.path });
                const linesEl = block.createDiv({ cls: "git-graph-diff-lines" });
                for (const line of diffFile.lines) {
                    const el = linesEl.createDiv({ cls: `git-graph-diff-line git-graph-diff-line--${line.type}` });
                    el.textContent = line.content;
                }
            }
        } else if (detail.files.length > 0) {
            panel.createDiv({ cls: "git-graph-hint", text: "Merge commit — no line diff available." });
        }
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
