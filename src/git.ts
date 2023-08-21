import * as vscode from 'vscode';
import { GitExtension, Repository, API, Branch as GitBranch } from './typings/git-extension';
import * as child_process from 'child_process';
import { Branch } from './models/branch';

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
            await this.execCustomAction(branch.repo, ['fetch', branch.upstream.remote, branch.upstream.name + ':' + branch.branchName!!]);
            this.reposChanged.fire();
        } catch (err) {
            vscode.window.showErrorMessage('Failed to fetch changes\n\n' + (err as any).stderr);
        }
    }

    private async execCustomAction(repo: Repository, args: string[]): Promise<{stdout: string, stderr: string}> {
        const path = repo.rootUri.fsPath;

        if (!path) {
            return { stdout: "", stderr: "" };
        }

        return await exec(
            [this.gitPath, ...args].join(' '),
            {
                cwd: path,
                timeout: 20000
            }
        );
    }
}
