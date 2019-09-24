// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GitExtension, Repository } from '../../typings/git';
import { promisify } from 'util';
import * as child_process from 'child_process';

const exec = promisify(child_process.exec);
interface Branch {
    branchName: string;
}

export class BranchTreeProvider implements vscode.TreeDataProvider<Branch> {
    private repos: Repository[] = [];

    constructor() {
        const gitContainer = vscode.extensions.getExtension<GitExtension>('vscode.git');
        if (gitContainer) {
            const gitExtension = gitContainer.exports;
            const git = gitExtension.getAPI(1);
            this.repos = git.repositories;
        }
    }

    public async getBranches(repo: Repository): Promise<string[]> {
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
        const branches = stdout.replace(/^\*\s+/g, '').split(/\n/g).filter(branch => !!branch);
        return branches;
    }

    getTreeItem(element: Branch): vscode.TreeItem {
        return new vscode.TreeItem(element.branchName);
    }
    async getChildren(element: Branch): Promise<Branch[]> {
        if (!this.repos) {
            return [];
        }
        if (!element) {
            // root level
            if (this.repos.length === 1) {
                const repo = this.repos[0];
                const branches = await this.getBranches(repo);

                return branches.map(branchName => <Branch>{branchName: branchName});
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
        // vscode.commands.registerCommand('fileExplorer.openFile', (resource) => this.openResource(resource));
    }

    // private openResource(resource: vscode.Uri): void {
    //     vscode.window.showTextDocument(resource);
    // }
}
