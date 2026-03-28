import { App, PluginSettingTab, Setting } from "obsidian";
import type GitHubTreePlugin from "./main";
import type { RepoConfig } from "./types";

export type { GitGraphSettings } from "./types";

export const DEFAULT_SETTINGS = {
    repositories: [] as RepoConfig[],
    activeRepoId: "",
    maxCommits: 200,
    showAllBranches: true,
};

function generateId(): string {
    return Math.random().toString(36).slice(2, 9);
}

export class GitGraphSettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: GitHubTreePlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Git Graph" });

        // ── Options ──────────────────────────────────────────────
        containerEl.createEl("h3", { text: "Options" });

        new Setting(containerEl)
            .setName("Max Commits")
            .setDesc("Maximum number of commits to load per repository.")
            .addSlider((s) =>
                s
                    .setLimits(50, 2000, 50)
                    .setValue(this.plugin.settings.maxCommits)
                    .setDynamicTooltip()
                    .onChange(async (v) => {
                        this.plugin.settings.maxCommits = v;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Show All Branches by Default")
            .setDesc("Include all branches (--all flag) when loading commits.")
            .addToggle((t) =>
                t
                    .setValue(this.plugin.settings.showAllBranches)
                    .onChange(async (v) => {
                        this.plugin.settings.showAllBranches = v;
                        await this.plugin.saveSettings();
                    })
            );

        // ── Repositories ─────────────────────────────────────────
        containerEl.createEl("h3", { text: "Repositories" });

        new Setting(containerEl)
            .setName("Add Repository")
            .setDesc("Point to any local git repository folder.")
            .addButton((btn) =>
                btn
                    .setButtonText("+ Add")
                    .setCta()
                    .onClick(async () => {
                        const repo: RepoConfig = {
                            id: generateId(),
                            path: "",
                            displayName: "",
                        };
                        this.plugin.settings.repositories.push(repo);
                        if (!this.plugin.settings.activeRepoId) {
                            this.plugin.settings.activeRepoId = repo.id;
                        }
                        await this.plugin.saveSettings();
                        this.display();
                    })
            );

        for (const repo of this.plugin.settings.repositories) {
            const section = containerEl.createDiv({ cls: "git-graph-repo-section" });

            const label = repo.displayName || repo.path.split("/").pop() || `Repository`;
            section.createEl("h4", { text: label, cls: "git-graph-repo-heading" });

            new Setting(section)
                .setName("Path")
                .setDesc("Absolute path to the repository root")
                .addText((t) =>
                    t
                        .setPlaceholder("/Users/you/Documents/my-repo")
                        .setValue(repo.path)
                        .onChange(async (v) => {
                            repo.path = v.trim();
                            await this.plugin.saveSettings();
                        })
                );

            new Setting(section)
                .setName("Display Name")
                .setDesc("Label shown in the sidebar dropdown")
                .addText((t) =>
                    t
                        .setPlaceholder("Leave empty to use folder name")
                        .setValue(repo.displayName)
                        .onChange(async (v) => {
                            repo.displayName = v.trim();
                            await this.plugin.saveSettings();
                            this.display();
                        })
                );

            new Setting(section).addButton((btn) =>
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
