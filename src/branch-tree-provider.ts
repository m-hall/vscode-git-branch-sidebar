import * as vscode from 'vscode';
import { Repository } from './typings/git-extension';
import * as path from 'path';
import { Git } from './git';
import { Branch } from './models/branch';
import { BranchCommands } from './enums/branch-commands.enum';
import { ContextOptions } from './enums/context-options.enum';
import { TreeNodeContext } from './enums/tree-node-context.enum';

export class BranchTreeProvider implements vscode.TreeDataProvider<Branch>, vscode.Disposable {
    private repos: Repository[] = [];

    private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

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
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
    }

    updateRepos(): void {
        this.repos = this.git.getRepositories();
        vscode.commands.executeCommand('setContext', ContextOptions.singleRepository, this.repos.length === 1);
    }

    getTreeItem(element: Branch): vscode.TreeItem {
        if (element.branchName) {
            var displayName = element.branchName;
            const config = vscode.workspace.getConfiguration('scm-local-branches');
            if (config.get('showUpstreamStatus', true)) {
                displayName = (element.upstreamState ?? '') + displayName;
            }
            
            const item = new vscode.TreeItem(displayName);
            item.tooltip = `name: ${element.branchName}`;
            if (element.upstream) {
                item.tooltip += `\ntracking branch: ${element.upstream.remote}/${element.upstream.name}`;
                item.tooltip += `\nupstream status: ${element.upstreamState ?? 'in sync or gone'}`;
            }

            if (element.selected) {
                if (element.upstream) {
                    item.contextValue = TreeNodeContext.activeBranchWithUpstream;
                } else {
                    item.contextValue = TreeNodeContext.activeBranch;
                }
                item.iconPath = {
                    dark: vscode.Uri.file(path.join(this.context.extensionPath, 'images/dark/check.svg')),
                    light: vscode.Uri.file(path.join(this.context.extensionPath, 'images/light/check.svg'))
                };
            } else {
                if (element.upstream) {
                    item.contextValue = TreeNodeContext.branchWithUpstream;
                } else {
                    item.contextValue = TreeNodeContext.branch;
                }
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
