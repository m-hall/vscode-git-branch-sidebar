import * as vscode from 'vscode';
import { Git } from './git';
import { RemoteBranchTreeProvider } from './remote-branch-tree-provider';
import { RemoteBranchGlobalCommands } from './enums/remote-branch-global-commands.enum';

const VIEW_NAME = 'scm-remote-branches';

export class RemoteBranchManager {
    private git: Git;
    private tree: RemoteBranchTreeProvider;
    private extensionContext: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext, git: Git) {
        this.extensionContext = context;
        this.git = git;
        this.tree = new RemoteBranchTreeProvider(this.git);

        this.extensionContext.subscriptions.push(this.tree);

        this.setupTree();
        this.setupGlobalCommands();
    }

    setupTree() {
        const view = vscode.window.createTreeView(VIEW_NAME, { treeDataProvider: this.tree });
        this.tree.setVisible(view.visible);

        this.extensionContext.subscriptions.push(
            view,
            view.onDidChangeVisibility((e) => this.tree.setVisible(e.visible))
        );
    }
    setupGlobalCommands() {
        this.extensionContext.subscriptions.push(
            vscode.commands.registerCommand(RemoteBranchGlobalCommands.refresh, async () => {
                await this.git.refresh();
            }),
        );
    }
}
