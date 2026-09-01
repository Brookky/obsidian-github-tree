// eslint-disable-next-line @typescript-eslint/no-var-requires
const { execFileSync } = require("child_process") as typeof import("child_process");

import type { GitCommit, RefLabel, FileChange, CommitDetail } from "./types";

function parseRefs(rawD: string): RefLabel[] {
    if (!rawD.trim()) return [];
    return rawD.split(",").map((r) => r.trim()).filter(Boolean).map((r): RefLabel => {
        if (r.startsWith("HEAD -> ")) return { name: r.slice(8), type: "head" };
        if (r === "HEAD") return { name: "HEAD", type: "head" };
        if (r.startsWith("tag: ")) return { name: r.slice(5), type: "tag" };
        if (r.includes("/")) return { name: r, type: "remote" };
        return { name: r, type: "branch" };
    });
}

export function getCommits(
    repoPath: string,
    maxCount: number,
    allBranches: boolean
): GitCommit[] {
    const SEP = "\x1f";
    const args = [
        "log",
        `--format=%H${SEP}%h${SEP}%s${SEP}%an${SEP}%ar${SEP}%P${SEP}%D`,
        `--max-count=${maxCount}`,
        "--topo-order",
    ];
    if (allBranches) args.push("--all");

    let output: string;
    try {
        output = execFileSync("git", args, {
            cwd: repoPath,
            encoding: "utf8",
            timeout: 10000,
            // Suppress stderr
            stdio: ["pipe", "pipe", "pipe"],
        });
    } catch (err: unknown) {
        const msg = (err as { message?: string }).message ?? String(err);
        throw new Error(`git log failed: ${msg}`);
    }

    return output
        .trim()
        .split("\n")
        .filter((l) => l.trim())
        .map((line) => {
            const parts = line.split(SEP);
            return {
                hash: parts[0] ?? "",
                shortHash: parts[1] ?? "",
                subject: parts[2] ?? "",
                author: parts[3] ?? "",
                relativeDate: parts[4] ?? "",
                parents: (parts[5] ?? "").trim().split(" ").filter(Boolean),
                refs: parseRefs(parts[6] ?? ""),
            };
        });
}

export function getRepoName(repoPath: string): string {
    try {
        const output = execFileSync("git", ["rev-parse", "--show-toplevel"], {
            cwd: repoPath,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        return output.split("/").pop() ?? repoPath;
    } catch {
        return repoPath.split("/").pop() ?? repoPath;
    }
}

export function getCommitDetail(repoPath: string, hash: string): CommitDetail {
    const SEP = "\x1f";

    const metaRaw = execFileSync("git", [
        "log", "-1", hash,
        `--format=%H${SEP}%h${SEP}%s${SEP}%b${SEP}%an${SEP}%ad${SEP}%ar`,
        "--date=format:%Y-%m-%d %H:%M",
    ], { cwd: repoPath, encoding: "utf8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] }).trim();

    const parts = metaRaw.split(SEP);

    let files: FileChange[] = [];
    try {
        const numstatRaw = execFileSync("git", [
            "diff-tree", "--root", "--no-commit-id", "-r", "--numstat", hash,
        ], { cwd: repoPath, encoding: "utf8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"] }).trim();

        files = numstatRaw.split("\n").filter(l => l.trim()).map(line => {
            const cols = line.split("\t");
            return {
                added: cols[0] === "-" ? null : parseInt(cols[0] ?? "0", 10),
                deleted: cols[1] === "-" ? null : parseInt(cols[1] ?? "0", 10),
                path: cols.slice(2).join("\t"),
            };
        });
    } catch { /* merge or initial commit */ }

    let rawDiff = "";
    try {
        rawDiff = execFileSync("git", [
            "diff-tree", "--root", "--no-commit-id", "-r", "-p", "--no-color", hash,
        ], { cwd: repoPath, encoding: "utf8", timeout: 30000, stdio: ["pipe", "pipe", "pipe"] });
    } catch { /* silent */ }

    return {
        hash: parts[0] ?? hash,
        shortHash: parts[1] ?? hash.slice(0, 7),
        subject: parts[2] ?? "",
        body: parts[3]?.trim() ?? "",
        author: parts[4] ?? "",
        date: parts[5] ?? "",
        relativeDate: parts[6] ?? "",
        files,
        rawDiff,
    };
}

export function isGitRepo(path: string): boolean {
    try {
        execFileSync("git", ["rev-parse", "--git-dir"], {
            cwd: path,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
        });
        return true;
    } catch {
        return false;
    }
}
