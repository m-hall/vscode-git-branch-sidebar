import * as vscode from 'vscode';
import { Repository } from './typings/git-extension';
import { Git } from './git';
import { RemoteBranch } from './models/remote-branch';
import { TreeNodeContext } from './enums/tree-node-context.enum';

export class RemoteBranchTreeProvider implements vscode.TreeDataProvider<RemoteBranch>, vscode.Disposable {
    private repos: Repository[] = [];

    private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

    private git: Git;

    private disposables: vscode.Disposable[] = [];

    // changes are not propagated while the view is hidden, to avoid loading remote branches until they are needed
    private visible = false;
    private stale = false;

    constructor(git: Git) {
        this.git = git;
        this.updateRepos();
        this.disposables.push(
            this.git.reposChanged.event(() => {
                this.updateRepos();
                if (this.visible) {
                    this._onDidChangeTreeData.fire();
                } else {
                    this.stale = true;
                }
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

    setVisible(visible: boolean): void {
        this.visible = visible;
        if (visible && this.stale) {
            this.stale = false;
            this._onDidChangeTreeData.fire();
        }
    }

    getTreeItem(element: RemoteBranch): vscode.TreeItem {
        if (element.branchName) {
            const item = new vscode.TreeItem(element.branchName);
            item.tooltip = `name: ${element.remote}/${element.branchName}`;
            if (element.commit) {
                item.tooltip += `\ncommit: ${element.commit.substring(0, 8)}`;
            }
            item.contextValue = TreeNodeContext.remoteBranch;

            return item;
        }

        if (element.remote) {
            const item = new vscode.TreeItem(element.remote);
            const remote = element.repo.state.remotes.find((r) => r.name === element.remote);
            item.tooltip = remote?.fetchUrl ?? remote?.pushUrl;
            item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            item.contextValue = TreeNodeContext.remote;

            return item;
        }

        const repoPath = element.repo.rootUri.fsPath;
        const repoDirectory = repoPath.split(/\/|\\/);
        const item = new vscode.TreeItem(repoDirectory[repoDirectory.length - 1]);
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        item.contextValue = TreeNodeContext.repo;

        return item;
    }

    async getChildren(element: RemoteBranch): Promise<RemoteBranch[]> {
        if (!this.repos || this.repos.length < 1) {
            return [];
        }
        if (!element) {
            // root level
            if (this.repos.length === 1) {
                // single repo
                return await this.getRemotes(this.repos[0]);
            } else {
                // multi-repo
                return this.repos.map((repo) => {
                    return {
                        repo
                    };
                });
            }
        } else if (!element.remote) {
            // children of repo
            return await this.getRemotes(element.repo);
        } else if (!element.branchName) {
            // children of remote
            return await this.git.getRemoteBranches(element.repo, element.remote);
        }

        // children of branch
        return [];
    }

    private async getRemotes(repo: Repository): Promise<RemoteBranch[]> {
        const remotes = repo.state.remotes;
        if (remotes.length === 1) {
            // single remote, show its branches directly
            return await this.git.getRemoteBranches(repo, remotes[0].name);
        }

        return remotes
            .map((remote) => remote.name)
            .sort((l, r) => l.localeCompare(r))
            .map((remote) => {
                return {
                    repo,
                    remote
                };
            });
    }
}
