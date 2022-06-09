import * as vscode from 'vscode';
import { GitExtension, Repository, API } from './typings/git-extension';
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
                    } catch (err: any) { }
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
        const path = repo.rootUri.fsPath;

        if (!path) {
            return [];
        }

        let branchNames: string[];

        try {
            const {stdout, stderr} = await exec(
                `${this.gitPath} branch`,
                {
                    cwd: path
                }
            );
            branchNames = stdout.split(/\n/g).filter(branch => !!branch);
        } catch (err: any) {
            vscode.window.showErrorMessage('Failed to retrieve the branches\n\n' + err.stderr);

            throw err;
        }

        const branches: Branch[] = branchNames.map((branch) => {
            const isStarred = branch.indexOf('*') === 0;
            const branchName = isStarred ? branch.slice(1).trim() : branch.trim();

            return {
                repo,
                branchName,
                selected: isStarred
            };
        });

        return branches;
    }

    public async createBranch(repo: Repository, branchName: string): Promise<void> {
        if (!this.validBranchName.test(branchName)) {
            vscode.window.showErrorMessage('Branch name is not valid');
        }

        const path = repo.rootUri.fsPath;

        if (!path) {
            return;
        }

        try {
            await exec(
                `${this.gitPath} checkout -b ${branchName}`,
                {
                    cwd: path
                }
            );
        } catch (err: any) {
            vscode.window.showErrorMessage('Failed to create branch\n\n' + err.stderr);
        }
    }
    public async checkoutBranch(branch: Branch): Promise<void> {
        const path = branch.repo.rootUri.fsPath;

        if (!path) {
            return;
        }

        try {
            await exec(
                `${this.gitPath} checkout ${branch.branchName}`,
                {
                    cwd: path
                }
            );
        } catch (err: any) {
            vscode.window.showErrorMessage('Failed to checkout branch\n\n' + err.stderr);
        }
    }
    public async deleteBranch(branch: Branch): Promise<void> {
        const path = branch.repo.rootUri.fsPath;

        if (!path) {
            return;
        }

        try {
            await exec(
                `${this.gitPath} branch -D ${branch.branchName}`,
                {
                    cwd: path
                }
            );
        } catch (err: any) {
            vscode.window.showErrorMessage('Failed to delete branch\n\n' + err.stderr);
        }
    }
    public async renameBranch(branch: Branch, newName: string): Promise<void> {
        if (!this.validBranchName.test(newName)) {
            vscode.window.showErrorMessage('Branch name is not valid');
        }

        const path = branch.repo.rootUri.fsPath;

        if (!path) {
            return;
        }

        const cmd: string = branch.selected
            ? `${this.gitPath} branch -m ${newName}`
            : `${this.gitPath} branch -m ${branch.branchName} ${newName}`;

        try {
            await exec(
                cmd,
                {
                    cwd: path
                }
            );
        } catch (err: any) {
            vscode.window.showErrorMessage('Failed to rename branch\n\n' + err.stderr);
        }
    }
    public async getCurrentUpstream(branch: Branch): Promise<string> {
        const path = branch.repo.rootUri.fsPath;

        if (!path) {
            return '';
        }

        try {
            const {stdout, stderr} = await exec(
                `${this.gitPath} rev-parse --abbrev-ref ${branch.branchName}@{upstream}`,
                {
                    cwd: path
                }
            );
            return stdout.trim();
        } catch (err: any) { }

        return '';
    }

    public async setUpstream(branch: Branch, upstream: string): Promise<void> {
        const path = branch.repo.rootUri.fsPath;

        if (!path) {
            return;
        }

        try {
            const {stdout, stderr} = await exec(
                `${this.gitPath} branch ${branch.branchName} -u ${upstream}`,
                {
                    cwd: path
                }
            );
        } catch (err: any) {
            vscode.window.showErrorMessage('Failed to set upstream\n\n' + err.stderr);
        }
    }

    public async deleteUpstream(branch: Branch): Promise<void> {
        const path = branch.repo.rootUri.fsPath;

        if (!path) {
            return;
        }

        try {
            const {stdout, stderr} = await exec(
                `${this.gitPath} branch ${branch.branchName} --unset-upstream`,
                {
                    cwd: path
                }
            );
        } catch (err: any) {
            vscode.window.showErrorMessage('Failed to remove upstream\n\n' + err.stderr);
        }
    }
}
