import * as vscode from 'vscode';
import { Git } from './git';
import { RemoteBranchTreeProvider } from './remote-branch-tree-provider';
import { RemoteBranchGlobalCommands } from './enums/remote-branch-global-commands.enum';
import { RemoteBranchCommands } from './enums/remote-branch-commands.enum';
import { RemoteBranch } from './models/remote-branch';

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
        this.setupBranchCommands();
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
    setupBranchCommands() {
        this.extensionContext.subscriptions.push(
            vscode.commands.registerCommand(RemoteBranchCommands.checkout, async (branch: RemoteBranch) => {
                const remoteName = `${branch.remote}/${branch.branchName}`;
                const existing = await this.git.getLocalBranch(branch.repo, branch.branchName!!);

                if (!existing) {
                    await this.git.checkoutRemoteBranch(branch, branch.branchName!!);
                    return;
                }

                if (existing.upstream?.remote === branch.remote && existing.upstream?.name === branch.branchName) {
                    // local branch already tracks this remote branch
                    await this.git.checkoutBranch({ repo: branch.repo, branchName: existing.name });
                    return;
                }

                const localName = await vscode.window.showInputBox({
                    value: branch.branchName,
                    placeHolder: 'Enter a branch name',
                    prompt: `A local branch named '${branch.branchName}' already exists and does not track '${remoteName}'. Enter a name for the new local branch.`,
                    validateInput: async (value) => {
                        if (!this.git.isValidBranchName(value)) {
                            return 'Branch name is not valid';
                        }
                        if (await this.git.getLocalBranch(branch.repo, value)) {
                            return `A local branch named '${value}' already exists`;
                        }
                        return undefined;
                    }
                });

                if (localName) {
                    await this.git.checkoutRemoteBranch(branch, localName);
                }
            }),
        );
    }
}
