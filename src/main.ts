import { Plugin, WorkspaceLeaf } from "obsidian";
import { GitHubTreeView, VIEW_TYPE_GITHUB_TREE } from "./tree-view";
import { GitHubTreeSettingTab, DEFAULT_SETTINGS } from "./settings";
import type { GitHubTreeSettings } from "./types";

export default class GitHubTreePlugin extends Plugin {
    settings!: GitHubTreeSettings;

    async onload() {
        await this.loadSettings();

        this.registerView(
            VIEW_TYPE_GITHUB_TREE,
            (leaf) => new GitHubTreeView(leaf, this)
        );

        this.addRibbonIcon("github", "GitHub Tree View", () => this.activateView());

        this.addCommand({
            id: "open-github-tree-view",
            name: "Open GitHub Tree View",
            callback: () => this.activateView(),
        });

        this.addSettingTab(new GitHubTreeSettingTab(this.app, this));

        this.app.workspace.onLayoutReady(() => {
            if (this.settings.repositories.some((r) => r.owner && r.name)) {
                this.activateView();
            }
        });
    }

    onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_GITHUB_TREE);
    }

    async activateView() {
        const { workspace } = this.app;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_GITHUB_TREE);

        let leaf: WorkspaceLeaf | null =
            leaves.length > 0 ? leaves[0] : workspace.getLeftLeaf(false);

        if (leaf && leaves.length === 0) {
            await leaf.setViewState({ type: VIEW_TYPE_GITHUB_TREE, active: true });
        }

        if (leaf) workspace.revealLeaf(leaf);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Propagate changes to all open views
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_GITHUB_TREE)) {
            if (leaf.view instanceof GitHubTreeView) {
                await leaf.view.refresh();
            }
        }
    }
}
