import * as vscode from 'vscode';
import { Repository } from './typings/git-extension';
import { Git } from './git';
import { Stash } from './models/stash';
import { StashCommands } from './enums/stash-commands.enum';
import { TreeNodeContext } from './enums/tree-node-context.enum';

export class StashTreeProvider implements vscode.TreeDataProvider<Stash>, vscode.Disposable {
    private repos: Repository[] = [];

    private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

    private git: Git;

    private disposables: vscode.Disposable[] = [];

    constructor(git: Git) {
        this.git = git;
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
    }

    getTreeItem(element: Stash): vscode.TreeItem {
        if (element.commit) {
            const item = new vscode.TreeItem(element.message || `stash@{${element.index}}`);
            item.description = [element.branchName, element.date].filter(Boolean).join(' · ');
            item.tooltip = `stash@{${element.index}}: ${element.message}`;
            if (element.branchName) {
                item.tooltip += `\nbranch: ${element.branchName}`;
            }
            item.tooltip += `\ncreated: ${element.date}`;
            item.contextValue = TreeNodeContext.stash;
            item.command = {
                command: StashCommands.show,
                arguments: [element],
                title: 'Show stash changes'
            };

            return item;
        }

        const repoPath = element.repo.rootUri.fsPath;
        const repoDirectory = repoPath.split(/\/|\\/);
        const item = new vscode.TreeItem(repoDirectory[repoDirectory.length - 1]);
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        item.contextValue = TreeNodeContext.repo;

        return item;
    }

    async getChildren(element: Stash): Promise<Stash[]> {
        if (!this.repos || this.repos.length < 1) {
            return [];
        }
        if (!element) {
            // root level
            if (this.repos.length === 1) {
                // single repo
                return await this.git.getStashes(this.repos[0]);
            } else {
                // multi-repo
                return this.repos.map((repo) => {
                    return {
                        repo
                    };
                });
            }
        } else if (!element.commit) {
            // children of repo
            return await this.git.getStashes(element.repo);
        }

        // children of stash
        return [];
    }

    public getCurrentRepository(): Repository|null {
        if (this.repos.length === 1) {
            return this.repos[0];
        }

        return null;
    }
}
