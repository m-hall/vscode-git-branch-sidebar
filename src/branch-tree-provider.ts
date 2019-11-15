import * as vscode from 'vscode';
import { Repository } from './typings/git';
import * as path from 'path';
import { Git } from './git';
import { Branch } from './branch';
import { BranchCommands } from './enums/branch-commands.enum';
import { ContextOptions } from './enums/context-options.enum';
import { TreeNodeContext } from './enums/tree-node-context.enum';

export class BranchTreeProvider implements vscode.TreeDataProvider<Branch>, vscode.Disposable {
    private repos: Repository[] = [];

    private _onDidChangeTreeData: vscode.EventEmitter<any> = new vscode.EventEmitter<any>();
    readonly onDidChangeTreeData: vscode.Event<any> = this._onDidChangeTreeData.event;

    private git: Git;

    private disposables: vscode.Disposable[] = [];

    private context: vscode.ExtensionContext;

    constructor(git: Git, context: vscode.ExtensionContext) {
        this.git = git;
        this.context = context;
        this.updateRepos();
        this.disposables.push(
            this.git.reposChanged.event(() => {
                this.updateRepos();
                this._onDidChangeTreeData.fire();
            })
        );
    }

    dispose(): void {
        delete this.git;
        delete this.context;
        delete this.repos;
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
    }

    updateRepos(): void {
        this.repos = this.git.getRepositories();
        vscode.commands.executeCommand('setContext', ContextOptions.singleRepository, this.repos.length === 1);
    }

    getTreeItem(element: Branch): vscode.TreeItem {
        if (element.branchName) {
            const item = new vscode.TreeItem(element.branchName);

            if (element.selected) {
                item.contextValue = TreeNodeContext.activeBranch;
                item.iconPath = {
                    dark: vscode.Uri.file(path.join(this.context.extensionPath, 'images/dark/check.svg')),
                    light: vscode.Uri.file(path.join(this.context.extensionPath, 'images/light/check.svg'))
                };
            } else {
                item.contextValue = TreeNodeContext.branch;
                item.command = {
                    command: BranchCommands.checkout,
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
        item.contextValue = TreeNodeContext.repo;

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