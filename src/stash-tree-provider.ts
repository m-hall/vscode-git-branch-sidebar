import * as vscode from 'vscode';
import * as path from 'path';
import { Repository } from './typings/git-extension';
import { Git } from './git';
import { Stash, StashFile, StashFileStatus } from './models/stash';
import { StashCommands } from './enums/stash-commands.enum';
import { TreeNodeContext } from './enums/tree-node-context.enum';

type StashTreeNode = Stash | StashFile;

const isStashFile = (node: StashTreeNode): node is StashFile => 'status' in node;

const STATUS_LABELS: { [status in StashFileStatus]: string } = {
    [StashFileStatus.added]: 'Added',
    [StashFileStatus.modified]: 'Modified',
    [StashFileStatus.deleted]: 'Deleted',
    [StashFileStatus.renamed]: 'Renamed',
    [StashFileStatus.untracked]: 'Untracked'
};

export class StashTreeProvider implements vscode.TreeDataProvider<StashTreeNode>, vscode.Disposable {
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

    getTreeItem(element: StashTreeNode): vscode.TreeItem {
        if (isStashFile(element)) {
            return this.getFileTreeItem(element);
        }

        if (element.commit) {
            const item = new vscode.TreeItem(element.message || `stash@{${element.index}}`);
            item.id = `${element.repo.rootUri.fsPath}:${element.commit}`;
            item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            item.description = [element.branchName, element.date].filter(Boolean).join(' · ');
            item.tooltip = `stash@{${element.index}}: ${element.message}`;
            if (element.branchName) {
                item.tooltip += `\nbranch: ${element.branchName}`;
            }
            item.tooltip += `\ncreated: ${element.date}`;
            item.contextValue = TreeNodeContext.stash;

            return item;
        }

        const repoPath = element.repo.rootUri.fsPath;
        const repoDirectory = repoPath.split(/\/|\\/);
        const item = new vscode.TreeItem(repoDirectory[repoDirectory.length - 1]);
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        item.contextValue = TreeNodeContext.repo;

        return item;
    }

    private getFileTreeItem(file: StashFile): vscode.TreeItem {
        // resourceUri lets the file icon theme pick an icon for the file
        const item = new vscode.TreeItem(vscode.Uri.joinPath(file.stash.repo.rootUri, file.path));
        const directory = path.posix.dirname(file.path);
        item.description = [directory === '.' ? '' : directory, file.status].filter(Boolean).join(' · ');
        item.tooltip = `${file.path} · ${STATUS_LABELS[file.status]}`;
        if (file.oldPath) {
            item.tooltip += `\nfrom: ${file.oldPath}`;
        }
        item.iconPath = vscode.ThemeIcon.File;
        item.contextValue = TreeNodeContext.stashFile;
        item.command = {
            command: StashCommands.openFile,
            arguments: [file],
            title: 'Open stash file changes'
        };

        return item;
    }

    async getChildren(element?: StashTreeNode): Promise<StashTreeNode[]> {
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
        } else if (isStashFile(element)) {
            return [];
        } else if (!element.commit) {
            // children of repo
            return await this.git.getStashes(element.repo);
        }

        // children of stash
        return await this.git.getStashFiles(element);
    }

    public getCurrentRepository(): Repository|null {
        if (this.repos.length === 1) {
            return this.repos[0];
        }

        return null;
    }
}
