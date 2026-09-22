import * as vscode from 'vscode';
import { GitExtension, Repository, API, Branch as GitBranch, RefType } from './typings/git-extension';
import * as child_process from 'child_process';
import { Branch } from './models/branch';
import { Stash } from './models/stash';
import { RemoteBranch } from './models/remote-branch';

const exec = (command: string, options?: child_process.ExecOptions): Promise<{stdout: string, stderr: string}> => {
    return new Promise((resolve, reject) => {
        child_process.exec(command, options, (err, stdout, stderr) => {
            const result = {stdout: stdout.toString(), stderr: stderr.toString()};

            if (err)  {
                (<any>result).code = err;
                reject(result);
            } else {
                resolve(result);
            }
        });
    });
};

const execFile = (file: string, args: string[], options: child_process.ExecFileOptions): Promise<{stdout: string, stderr: string}> => {
    return new Promise((resolve, reject) => {
        child_process.execFile(file, args, options, (err, stdout, stderr) => {
            const result = {stdout: stdout.toString(), stderr: stderr.toString()};

            if (err)  {
                (<any>result).code = err;
                reject(result);
            } else {
                resolve(result);
            }
        });
    });
};

export interface StashOptions {
    includeUntracked?: boolean;
    staged?: boolean;
    keepIndex?: boolean;
}

export class Git implements vscode.Disposable {
    private gitPath?: string;
    private gitApi?: API;

    private disposables: vscode.Disposable[] = [];
    private repoStateChanges: vscode.Disposable[] = [];

    private repos: Repository[] = [];
    public reposChanged: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();

    private readonly validBranchName: RegExp = /^(?!\/|.*(?:[/.]\.|\/\/|@\{|\\))[^\040\177 ~^:?*[]+(?<!\.lock)(?<![/.])$/;

    constructor() {
        this.getRepos();
        this.getGitPath();

        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(() => this.getGitPath())
        );
    }

    dispose() {
        delete this.gitApi;

        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];

        this.repoStateChanges.forEach(listener => listener.dispose());
        this.repoStateChanges = [];
    }

    private async getGitPath(): Promise<void> {
        const gitConfig = vscode.workspace.getConfiguration('git');
        this.gitPath = 'git';
        if (gitConfig.has('path')) {
            const pathConfig = gitConfig.get<string|string[]>('path');
            if (Array.isArray(pathConfig)) {
                for (const gp of pathConfig) {
                    try {
                        const {stdout, stderr} = await exec(
                            `${gp} --version`,
                        );
                        this.gitPath = gp;
                        return;
                    } catch (err) { }
                }
            } else if (typeof pathConfig === 'string') {
                this.gitPath = pathConfig;
            }
        }
    }

    private getApi(): API|null {
        if (this.gitApi) {
            return this.gitApi;
        }

        const gitContainer = vscode.extensions.getExtension<GitExtension>('vscode.git');

        if (gitContainer) {
            const gitExtension = gitContainer.exports;
            const gitApi = gitExtension.getAPI(1);

            this.gitApi = gitApi;
            this.disposables.push(
                gitApi.onDidChangeState(() => {
                    this.refresh();
                })
            );

            return this.gitApi;
        }

        return null;
    }

    private getRepos() {
        let api = this.getApi();

        this.repoStateChanges.forEach(listener => listener.dispose());
        this.repoStateChanges = [];

        if (api) {
            this.repos = api.repositories;
            this.reposChanged.fire();
            this.repoStateChanges = this.repos.map(
                (repo) => {
                    return repo.state.onDidChange(() => {
                        this.refresh();
                    });
                }
            );
        }
    }

    public refresh(): any {
        this.getRepos();
    }

    public getRepositories(): Repository[] {
        return this.repos;
    }

    public getRepository(uri: vscode.Uri): Repository | null {
        return this.getApi()?.getRepository(uri) ?? null;
    }

    public async getBranches(repo: Repository): Promise<Branch[]> {
        const gitBranches = await repo.getBranches({ remote: false })
            .then<GitBranch[]>((all) => Promise.all(all.map((b) => repo.getBranch(b.name!!))));
        const head = repo.state.HEAD;
        const viewBranches: Branch[] = gitBranches
            .sort((lb, rb) => lb.name!!.localeCompare(rb.name!!))
            .map((branch) => {
                return {
                    repo,
                    branchName: branch.name,
                    selected: branch.name == head?.name,
                    upstreamState: this.createUpstreamStateString(branch),
                    upstream: branch.upstream
                };
            });

        return viewBranches;
    }

    public async getRemoteBranches(repo: Repository, remote: string): Promise<RemoteBranch[]> {
        const prefix = remote + '/';
        const refs = await repo.getBranches({ remote: true });

        return refs
            .filter((ref) => ref.type === RefType.RemoteHead && ref.remote === remote && ref.name)
            .map((ref) => ref.name!!.startsWith(prefix) ? ref.name!!.substring(prefix.length) : ref.name!!)
            // HEAD is a symbolic ref to the remote's default branch, not a real branch
            .filter((name) => name !== 'HEAD')
            .sort((l, r) => l.localeCompare(r))
            .map((branchName) => {
                return {
                    repo,
                    remote,
                    branchName,
                    commit: refs.find((ref) => ref.name === prefix + branchName)?.commit
                };
            });
    }

    public async getLocalBranch(repo: Repository, name: string): Promise<GitBranch | undefined> {
        try {
            return await repo.getBranch(name);
        } catch (err) {
            // branch does not exist
            return undefined;
        }
    }

    public isValidBranchName(name: string): boolean {
        return this.validBranchName.test(name);
    }

    public async checkoutRemoteBranch(branch: RemoteBranch, localName: string): Promise<void> {
        if (!this.isValidBranchName(localName)) {
            vscode.window.showErrorMessage('Branch name is not valid');
            return;
        }

        try {
            await this.execCustomAction(branch.repo, ['checkout', '-b', localName, '--track', `${branch.remote}/${branch.branchName}`]);
            this.reposChanged.fire();
        } catch (err) {
            vscode.window.showErrorMessage('Failed to checkout branch\n\n' + (err as any).stderr);
        }
    }

    private createUpstreamStateString(branch: GitBranch): string | undefined {
        let upstreamState = null;
        if (branch.upstream) {
            upstreamState = '';
            if (branch.ahead) {
                upstreamState += '↑' + branch.ahead;
            }
            if (branch.behind) {
                if (upstreamState) upstreamState += ' ';
                upstreamState += '↓' + branch.behind;
            }
        }
        if (upstreamState) {
            return '[' + upstreamState + '] ';
        } else {
            return undefined;
        }
    }

    public async checkoutBranch(branch: Branch): Promise<void> {
        try {
            await branch.repo.checkout(branch.branchName!!);
        } catch (err) {
            vscode.window.showErrorMessage('Failed to checkout branch\n\n' + (err as any).stderr);
        }
    }

    public async deleteBranch(branch: Branch): Promise<void> {
        try {
            await branch.repo.deleteBranch(branch.branchName!!, /* force = */ true);
        } catch (err) {
            vscode.window.showErrorMessage('Failed to delete branch\n\n' + (err as any).stderr);
        }
    }

    public async renameBranch(branch: Branch, newName: string): Promise<void> {
        if (!this.validBranchName.test(newName)) {
            vscode.window.showErrorMessage('Branch name is not valid');
            return;
        }

        try {
            if (branch.selected) {
                await this.execCustomAction(branch.repo, ['branch', '-m', newName]);
            } else {
                await this.execCustomAction(branch.repo, ['branch', '-m', branch.branchName!!, newName]);
            }
            this.reposChanged.fire();
        } catch (err) {
            vscode.window.showErrorMessage('Failed to rename branch\n\n' + (err as any).stderr);
        }
    }

    public async setUpstream(branch: Branch, upstream: string): Promise<void> {
        try {
            await branch.repo.setBranchUpstream(branch.branchName!!, upstream);
        } catch (err) {
            vscode.window.showErrorMessage('Failed to set upstream\n\n' + (err as any).stderr);
        }
    }

    public async unsetUpstream(branch: Branch): Promise<void> {
        if (!branch.upstream) {
            return;
        }
        try {
            await this.execCustomAction(branch.repo, ['branch', '--unset-upstream', branch.branchName!!])
            this.reposChanged.fire();
        } catch (err) {
            vscode.window.showErrorMessage('Failed to remove upstream\n\n' + (err as any).stderr);
        }
    }

    public async pull(branch: Branch): Promise<void> {
        if (!branch.upstream) {
            vscode.window.showErrorMessage('Branch does not have upstream set');
            return;
        }
        try {
            if (branch.selected) {
                await this.execCustomAction(branch.repo, ['pull']);
            } else {
                await this.execCustomAction(branch.repo, ['fetch', branch.upstream.remote, branch.upstream.name + ':' + branch.branchName!!]);
            }
            this.reposChanged.fire();
        } catch (err) {
            vscode.window.showErrorMessage('Failed to fetch changes\n\n' + (err as any).stderr);
        }
    }

    public async getStashes(repo: Repository): Promise<Stash[]> {
        try {
            // unit separator (\x1f) is used as the field delimiter so messages can contain anything
            const { stdout } = await this.execCustomAction(repo, ['stash', 'list', '--format=%H%x1f%gs%x1f%cr']);

            return stdout
                .split('\n')
                .filter((line) => line)
                .map((line, index) => {
                    const [commit, subject, date] = line.split('\x1f');
                    // subject is formatted as "On <branch>: <message>" or "WIP on <branch>: <commit> <message>"
                    const match = /^(?:WIP on|On) ([^:]+): (.*)$/.exec(subject);

                    return {
                        repo,
                        index,
                        commit,
                        message: match ? match[2] : subject,
                        branchName: match ? match[1] : undefined,
                        date
                    };
                });
        } catch (err) {
            vscode.window.showErrorMessage('Failed to list stashes\n\n' + (err as any).stderr);
            return [];
        }
    }

    public async createStash(repo: Repository, message: string, options: StashOptions = {}): Promise<void> {
        const args = ['stash', 'push'];
        if (options.includeUntracked) {
            args.push('--include-untracked');
        }
        if (options.staged) {
            args.push('--staged');
        }
        if (options.keepIndex) {
            args.push('--keep-index');
        }
        if (message) {
            args.push('-m', message);
        }

        try {
            const { stdout } = await this.execCustomAction(repo, args);
            if (stdout.startsWith('No local changes')) {
                vscode.window.showInformationMessage('There are no local changes to stash');
            }
            this.reposChanged.fire();
        } catch (err) {
            vscode.window.showErrorMessage('Failed to create stash\n\n' + (err as any).stderr);
        }
    }

    public async applyStash(stash: Stash): Promise<void> {
        try {
            await this.execCustomAction(stash.repo, ['stash', 'apply', String(stash.index)]);
            this.reposChanged.fire();
        } catch (err) {
            vscode.window.showErrorMessage('Failed to apply stash\n\n' + ((err as any).stderr || (err as any).stdout));
        }
    }

    public async popStash(stash: Stash): Promise<void> {
        try {
            await this.execCustomAction(stash.repo, ['stash', 'pop', String(stash.index)]);
            this.reposChanged.fire();
        } catch (err) {
            vscode.window.showErrorMessage('Failed to pop stash\n\n' + ((err as any).stderr || (err as any).stdout));
        }
    }

    public async dropStash(stash: Stash): Promise<void> {
        try {
            await this.execCustomAction(stash.repo, ['stash', 'drop', String(stash.index)]);
            this.reposChanged.fire();
        } catch (err) {
            vscode.window.showErrorMessage('Failed to drop stash\n\n' + (err as any).stderr);
        }
    }

    public async getStashPatch(repo: Repository, commit: string): Promise<string> {
        try {
            const { stdout } = await this.execCustomAction(repo, ['stash', 'show', '-p', commit]);
            return stdout;
        } catch (err) {
            vscode.window.showErrorMessage('Failed to show stash\n\n' + (err as any).stderr);
            return '';
        }
    }

    private async execCustomAction(repo: Repository, args: string[]): Promise<{stdout: string, stderr: string}> {
        const path = repo.rootUri.fsPath;

        if (!path) {
            return { stdout: "", stderr: "" };
        }

        return await execFile(
            this.gitPath ?? 'git',
            args,
            {
                cwd: path,
                timeout: 20000
            }
        );
    }
}
