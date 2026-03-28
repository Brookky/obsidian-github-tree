import { App, PluginSettingTab, Setting } from "obsidian";
import type GitHubTreePlugin from "./main";
import type { Repository } from "./types";

export type { GitHubTreeSettings } from "./types";

export const DEFAULT_SETTINGS = {
    token: "",
    repositories: [] as Repository[],
    activeRepoId: "",
    cacheTimeout: 5,
    defaultExpanded: false,
    showFileSize: false,
};

function generateId(): string {
    return Math.random().toString(36).slice(2, 9);
}

function makeRepo(sourceType: "github" | "local"): Repository {
    return {
        id: generateId(),
        sourceType,
        owner: "",
        name: "",
        branch: "main",
        localPath: "",
        displayName: "",
    };
}

export class GitHubTreeSettingTab extends PluginSettingTab {
    plugin: GitHubTreePlugin;

    constructor(app: App, plugin: GitHubTreePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "GitHub Tree View" });

        // ── GitHub Authentication ───────────────────────────────
        containerEl.createEl("h3", { text: "GitHub Authentication" });

        new Setting(containerEl)
            .setName("Personal Access Token")
            .setDesc(
                "Required for private GitHub repos or to increase rate limits (5,000 req/hr vs 60). Needs 'repo' or 'public_repo' scope. Not needed for local folders."
            )
            .addText((text) => {
                text.inputEl.type = "password";
                text.setPlaceholder("ghp_xxxxxxxxxxxx")
                    .setValue(this.plugin.settings.token)
                    .onChange(async (value) => {
                        this.plugin.settings.token = value.trim();
                        await this.plugin.saveSettings();
                    });
            });

        // ── Display ─────────────────────────────────────────────
        containerEl.createEl("h3", { text: "Display" });

        new Setting(containerEl)
            .setName("Cache Duration (minutes)")
            .setDesc("How long to cache GitHub tree data. 0 = always fetch fresh. (Not used for local folders.)")
            .addSlider((slider) =>
                slider
                    .setLimits(0, 60, 1)
                    .setValue(this.plugin.settings.cacheTimeout)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.cacheTimeout = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Expand All Folders on Load")
            .setDesc("Automatically expand all folders when a repository is loaded.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.defaultExpanded)
                    .onChange(async (value) => {
                        this.plugin.settings.defaultExpanded = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Show File Size")
            .setDesc("Display file size next to each file name.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.showFileSize)
                    .onChange(async (value) => {
                        this.plugin.settings.showFileSize = value;
                        await this.plugin.saveSettings();
                    })
            );

        // ── Repositories ─────────────────────────────────────────
        containerEl.createEl("h3", { text: "Repositories" });

        const addRow = containerEl.createDiv({ cls: "github-tree-add-row" });

        new Setting(addRow)
            .setName("Add Source")
            .setDesc("Add a GitHub repository (needs API) or a local folder (no auth required).")
            .addButton((btn) =>
                btn
                    .setButtonText("+ GitHub Repo")
                    .setCta()
                    .onClick(async () => {
                        const repo = makeRepo("github");
                        this.plugin.settings.repositories.push(repo);
                        if (!this.plugin.settings.activeRepoId) {
                            this.plugin.settings.activeRepoId = repo.id;
                        }
                        await this.plugin.saveSettings();
                        this.display();
                    })
            )
            .addButton((btn) =>
                btn
                    .setButtonText("+ Local Folder")
                    .onClick(async () => {
                        const repo = makeRepo("local");
                        this.plugin.settings.repositories.push(repo);
                        if (!this.plugin.settings.activeRepoId) {
                            this.plugin.settings.activeRepoId = repo.id;
                        }
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );

        for (const [index, repo] of this.plugin.settings.repositories.entries()) {
            // Migrate old entries without sourceType
            if (!repo.sourceType) (repo as Repository).sourceType = "github";
            if (!repo.localPath) (repo as Repository).localPath = "";

            const repoSection = containerEl.createDiv({ cls: "github-tree-repo-section" });

            const label =
                repo.displayName ||
                (repo.sourceType === "local"
                    ? repo.localPath || `Local Folder ${index + 1}`
                    : repo.owner && repo.name
                    ? `${repo.owner}/${repo.name}`
                    : `Repository ${index + 1}`);

            const badge = repo.sourceType === "local" ? " 📁" : " 🐙";
            repoSection.createEl("h4", {
                text: label + badge,
                cls: "github-tree-repo-heading",
            });

            if (repo.sourceType === "local") {
                // ── Local folder settings ──
                new Setting(repoSection)
                    .setName("Folder Path")
                    .setDesc("Absolute path to the local folder (e.g. /Users/you/Documents/my-repo)")
                    .addText((text) =>
                        text
                            .setPlaceholder("/Users/you/Documents/my-repo")
                            .setValue(repo.localPath)
                            .onChange(async (value) => {
                                repo.localPath = value.trim();
                                await this.plugin.saveSettings();
                            })
                    );
            } else {
                // ── GitHub settings ──
                new Setting(repoSection)
                    .setName("Owner")
                    .setDesc("GitHub username or organization")
                    .addText((text) =>
                        text
                            .setPlaceholder("e.g. torvalds")
                            .setValue(repo.owner)
                            .onChange(async (value) => {
                                repo.owner = value.trim();
                                await this.plugin.saveSettings();
                            })
                    );

                new Setting(repoSection)
                    .setName("Repository Name")
                    .addText((text) =>
                        text
                            .setPlaceholder("e.g. linux")
                            .setValue(repo.name)
                            .onChange(async (value) => {
                                repo.name = value.trim();
                                await this.plugin.saveSettings();
                            })
                    );

                new Setting(repoSection)
                    .setName("Default Branch")
                    .addText((text) =>
                        text
                            .setPlaceholder("main")
                            .setValue(repo.branch)
                            .onChange(async (value) => {
                                repo.branch = value.trim() || "main";
                                await this.plugin.saveSettings();
                            })
                    );
            }

            new Setting(repoSection)
                .setName("Display Name")
                .setDesc("Friendly label shown in the sidebar dropdown")
                .addText((text) =>
                    text
                        .setPlaceholder("Leave empty for auto")
                        .setValue(repo.displayName)
                        .onChange(async (value) => {
                            repo.displayName = value.trim();
                            await this.plugin.saveSettings();
                            this.display();
                        })
                );

            new Setting(repoSection).addButton((btn) =>
                btn
                    .setButtonText("Remove")
                    .setWarning()
                    .onClick(async () => {
                        this.plugin.settings.repositories =
                            this.plugin.settings.repositories.filter((r) => r.id !== repo.id);
                        if (this.plugin.settings.activeRepoId === repo.id) {
                            this.plugin.settings.activeRepoId =
                                this.plugin.settings.repositories[0]?.id ?? "";
                        }
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );
        }
    }
}
