// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

interface Branch {
    id: string;
}

export class BranchTreeProvider implements vscode.TreeDataProvider<Branch> {

    getTreeItem(element: Branch): vscode.TreeItem {
        return new vscode.TreeItem(element.id);
    }
    getChildren(element: Branch): Branch[] {
        if (!element) {
            return [
                {id: 'master'},
                {id: 'other-branch'}
            ];
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
