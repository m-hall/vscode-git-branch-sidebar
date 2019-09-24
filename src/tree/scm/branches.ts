// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GitExtension, Repository, API } from '../../typings/git';
import { promisify } from 'util';
import * as child_process from 'child_process';

const exec = promisify(child_process.exec);
interface Branch {
    repo: Repository;
    branchName?: string;
    selected?: boolean;
}

export class BranchTreeProvider implements vscode.TreeDataProvider<Branch> {
    private gitApi?: API;
    private repos: Repository[] = [];

    private _onDidChangeTreeData: vscode.EventEmitter<any> = new vscode.EventEmitter<any>();
    readonly onDidChangeTreeData: vscode.Event<any> = this._onDidChangeTreeData.event;

    private repoStateChanges: vscode.Disposable[] = [];

    constructor() {
        this.getRepos();
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
            gitApi.onDidChangeState(() => {
                this.refresh();
            });
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
        this._onDidChangeTreeData.fire();
    }

    public async getBranches(repo: Repository): Promise<Branch[]> {
        const path = repo.rootUri.fsPath;
        if (!path) {
            return [];
        }
        const {stdout} = await exec(
            'git branch',
            {
                cwd: path
            }
        );
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

    public async switchBranch(branch: Branch): Promise<void> {
        const path = branch.repo.rootUri.fsPath;
        if (!path) {
            return;
        }
        await exec(
            `git checkout ${branch.branchName}`,
            {
                cwd: path
            }
        );

        this.refresh();
    }

    getTreeItem(element: Branch): vscode.TreeItem {
        if (element.branchName) {
            const item = new vscode.TreeItem(element.branchName);
            if (element.selected) {
                item.label = '✔ ' + item.label;
            }
            item.command = {
                command: 'scm-local-branches.switchBranch',
                arguments: [element],
                title: 'Switch branch'
            };
            return item;
        }
        const repoPath = element.repo.rootUri.fsPath;
        const repoDirectory = repoPath.slice(repoPath.lastIndexOf('/'));
        return new vscode.TreeItem(repoDirectory);
    }
    async getChildren(element: Branch): Promise<Branch[]> {
        if (!this.repos) {
            return [];
        }
        if (!element) {
            // root level
            if (this.repos.length === 1) {
                const repo = this.repos[0];

                return await this.getBranches(repo);
            }
        }
        return [];
    }
}

export class BranchSwitcher {

    private scmBranches: vscode.TreeView<Branch>;

    constructor(context: vscode.ExtensionContext) {
        const treeDataProvider = new BranchTreeProvider();
        this.scmBranches = vscode.window.createTreeView('scm-local-branches', { treeDataProvider });
        vscode.commands.registerCommand('scm-local-branches.refresh', () => {
            treeDataProvider.refresh();
        });
        vscode.commands.registerCommand('scm-local-branches.switchBranch', (element: Branch) => {
            treeDataProvider.switchBranch(element);
        });
    }
}
