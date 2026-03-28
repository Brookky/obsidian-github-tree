import { Plugin, WorkspaceLeaf } from "obsidian";
import { GitGraphView, VIEW_TYPE_GIT_GRAPH } from "./graph-view";
import { GitGraphSettingTab, DEFAULT_SETTINGS } from "./settings";
import type { GitGraphSettings } from "./types";

export default class GitHubTreePlugin extends Plugin {
    settings!: GitGraphSettings;

    async onload() {
        await this.loadSettings();

        this.registerView(
            VIEW_TYPE_GIT_GRAPH,
            (leaf) => new GitGraphView(leaf, this)
        );

        this.addRibbonIcon("git-branch", "Git Graph", () => this.activateView());

        this.addCommand({
            id: "open-git-graph",
            name: "Open Git Graph",
            callback: () => this.activateView(),
        });

        this.addSettingTab(new GitGraphSettingTab(this.app, this));

        this.app.workspace.onLayoutReady(() => {
            if (this.settings.repositories.some((r) => r.path)) {
                this.activateView();
            }
        });
    }

    onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_GIT_GRAPH);
    }

    async activateView() {
        const { workspace } = this.app;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_GIT_GRAPH);

        let leaf: WorkspaceLeaf | null =
            leaves.length > 0 ? leaves[0] : workspace.getLeftLeaf(false);

        if (leaf && leaves.length === 0) {
            await leaf.setViewState({ type: VIEW_TYPE_GIT_GRAPH, active: true });
        }

        if (leaf) workspace.revealLeaf(leaf);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_GIT_GRAPH)) {
            if (leaf.view instanceof GitGraphView) {
                await leaf.view.refresh();
            }
        }
    }
}
