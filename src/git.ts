import * as vscode from 'vscode';
import { GitExtension, Repository, API } from './typings/git-extension';
import { promisify } from 'util';
import * as child_process from 'child_process';
import { Branch } from './models/branch';

const exec = promisify(child_process.exec);

export class Git implements vscode.Disposable {
    private gitApi?: API;

    private disposables: vscode.Disposable[] = [];
    private repoStateChanges: vscode.Disposable[] = [];

    private repos: Repository[] = [];
    public reposChanged: vscode.EventEmitter<null> = new vscode.EventEmitter<null>();

    private readonly validBranchName: RegExp = /^(?!\/|.*(?:[/.]\.|\/\/|@\{|\\))[^\040\177 ~^:?*[]+(?<!\.lock)(?<![/.])$/;

    constructor() {
        this.getRepos();
    }

    dispose() {
        delete this.getApi;
        delete this.repos;

        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];

        this.repoStateChanges.forEach(listener => listener.dispose());
        this.repoStateChanges = [];
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

        const {stdout, stderr} = await exec(
            'git branch',
            {
                cwd: path
            }
        );

        if (stderr) {
            vscode.window.showErrorMessage('Failed to retrieve the branches', stderr);
        }

        const branchNames = stdout.split(/\n/g).filter(branch => !!branch);
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

        const {stderr} = await exec(
            `git checkout -b ${branchName}`,
            {
                cwd: path
            }
        );

        if (stderr) {
            vscode.window.showErrorMessage('Failed to create branch', stderr);
        }
    }
    public async checkoutBranch(branch: Branch): Promise<void> {
        const path = branch.repo.rootUri.fsPath;

        if (!path) {
            return;
        }

        const {stderr} = await exec(
            `git checkout ${branch.branchName}`,
            {
                cwd: path
            }
        );

        if (stderr) {
            vscode.window.showErrorMessage('Failed to checkout branch', stderr);
        }
    }
    public async deleteBranch(branch: Branch): Promise<void> {
        const path = branch.repo.rootUri.fsPath;

        if (!path) {
            return;
        }

        const {stderr} = await exec(
            `git branch -D ${branch.branchName}`,
            {
                cwd: path
            }
        );

        if (stderr) {
            vscode.window.showErrorMessage('Failed to delete branch', stderr);
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
            ? `git branch -m ${newName}`
            : `git branch -m ${branch.branchName} ${newName}`;

        const {stderr} = await exec(
            cmd,
            {
                cwd: path
            }
        );

        if (stderr) {
            vscode.window.showErrorMessage('Failed to rename branch', stderr);
        }
    }
}
