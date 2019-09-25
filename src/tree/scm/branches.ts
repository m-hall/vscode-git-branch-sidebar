// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
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
        this.git.getRepositories().subscribe((repos) => {
            this.repos = repos;
            this._onDidChangeTreeData.fire();
        });
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

                return await this.git.getBranches(repo);
            }
        }
        return [];
    }
}

export class BranchSwitcher {
    constructor(context: vscode.ExtensionContext) {
        const git = new Git();
        const treeDataProvider = new BranchTreeProvider(git);
        const scmBranches = vscode.window.createTreeView('scm-local-branches', { treeDataProvider });

        vscode.commands.registerCommand('scm-local-branches.refresh', () => {
            git.refresh();
        });
        vscode.commands.registerCommand('scm-local-branches.switchBranch', (branch: Branch) => {
            git.checkoutBranch(branch);
        });
        vscode.commands.registerCommand('scm-branch.delete', (branch: Branch) => {
            git.deleteBranch(branch);
        });
        vscode.commands.registerCommand('scm-branch.rename', async (branch: Branch) => {
            const newName = await vscode.window.showInputBox({
                value: branch.branchName
            });

            if (newName) {
                git.renameBranch(branch, newName);
            }
        });
    }
}
