import * as vscode from 'vscode';
import { Repository } from '../../typings/git';
import * as path from 'path';
import { Git } from './git';
import { Branch } from './branch';

const extension = vscode.extensions.getExtension('mia-hall.vscode-git-branch-sidebar');
const extensionPath = extension ? extension.extensionPath : './';

export class BranchTreeProvider implements vscode.TreeDataProvider<Branch> {
    private repos: Repository[] = [];

    private _onDidChangeTreeData: vscode.EventEmitter<any> = new vscode.EventEmitter<any>();
    readonly onDidChangeTreeData: vscode.Event<any> = this._onDidChangeTreeData.event;

    private git: Git;

    constructor(git: Git) {
        this.git = git;
        this.updateRepos();
        this.git.reposChanged.event(() => {
            this.updateRepos()
            this._onDidChangeTreeData.fire();
        });
    }

    updateRepos(): void {
        this.repos = this.git.getRepositories();
        vscode.commands.executeCommand('setContext', 'scmLocalBranches:isSingleRepository', this.repos.length === 1);
    }

    getTreeItem(element: Branch): vscode.TreeItem {
        if (element.branchName) {
            const item = new vscode.TreeItem(element.branchName);
            if (element.selected) {
                item.contextValue = 'selectedBranch';
                item.iconPath = {
                    dark: vscode.Uri.file(path.join(extensionPath, 'images/dark/check.svg')),
                    light: vscode.Uri.file(path.join(extensionPath, 'images/light/check.svg'))
                };
            } else {
                item.contextValue = 'branch';
                item.command = {
                    command: 'scm-local-branches.switchBranch',
                    arguments: [element],
                    title: 'Switch branch'
                };
            }
            return item;
        }
        const repoPath = element.repo.rootUri.fsPath;
        const repoDirectory = repoPath.split(/\/|\\/);
        const item = new vscode.TreeItem(repoDirectory[repoDirectory.length - 1]);
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        item.contextValue = 'repo';
        return item;
    }

    async getChildren(element: Branch): Promise<Branch[]> {
        if (!this.repos || this.repos.length < 1) {
            return [];
        }
        if (!element) {
            // root level
            if (this.repos.length === 1) {
                // single repo
                const repo = this.repos[0];

                return await this.git.getBranches(repo);
            } else {
                // multi-repo
                return this.repos.map((repo) => {
                    return {
                        repo
                    };
                });
            }
        } else if (!element.branchName) {
            // children of repo
            const repo = element.repo;

            return await this.git.getBranches(repo);
        }

        // children of branch
        return [];
    }

    public getCurrentRepository(): Repository|null {
        if (this.repos.length === 1) {
            return this.repos[0];
        }

        return null;
    }
}

export class BranchSwitcher {
    private disposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext) {
        const git = new Git();
        const treeDataProvider = new BranchTreeProvider(git);

        this.disposables.push(
            vscode.window.createTreeView('scm-local-branches', { treeDataProvider }),
            vscode.commands.registerCommand('scm-local-branches.refresh', () => {
                git.refresh();
            }),
            vscode.commands.registerCommand('scm-local-branches.create', async () => {
                const repo = treeDataProvider.getCurrentRepository();
                if (!repo) {
                    return;
                }
                const branchName = await vscode.window.showInputBox({
                    placeHolder: 'Enter a branch name',
                    prompt: 'Create a branch from the current commit'
                });

                if (branchName) {
                    git.createBranch(repo, branchName);
                }
            }),
            vscode.commands.registerCommand('scm-local-branches.switchBranch', (branch: Branch) => {
                git.checkoutBranch(branch);
            }),
            vscode.commands.registerCommand('scm-repo.branch', async (branch: Branch) => {
                const branchName = await vscode.window.showInputBox({
                    placeHolder: 'Enter a branch name',
                    prompt: 'Create a branch from the current commit'
                });

                if (branchName) {
                    git.createBranch(branch.repo, branchName);
                }
            }),
            vscode.commands.registerCommand('scm-branch.delete', async (branch: Branch) => {
                const config = vscode.workspace.getConfiguration('scm-local-branches');
                if (config.get('confirmDelete', false)) {
                    const confirmButton = 'Confirm';
                    const action = await vscode.window.showWarningMessage(
                        `Are you sure you want to delete branch '${branch.branchName}`,
                        { modal: true },
                        confirmButton
                    );
                    if (action !== confirmButton) {
                        return;
                    }
                }
                git.deleteBranch(branch);
            }),
            vscode.commands.registerCommand('scm-branch.rename', async (branch: Branch) => {
                const newName = await vscode.window.showInputBox({
                    value: branch.branchName,
                    placeHolder: 'Enter a branch name',
                    prompt: `Renaming branch from '${branch.branchName}`
                });

                if (newName) {
                    git.renameBranch(branch, newName);
                }
            })
        );
    }

    dispose() {
        this.disposables.forEach(disposable => disposable.dispose());
    }
}
