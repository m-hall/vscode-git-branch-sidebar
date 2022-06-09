import * as vscode from 'vscode';
import { Git } from './git';
import { Branch } from './models/branch';
import { BranchTreeProvider } from './branch-tree-provider';
import { Repository } from './typings/git-extension';
import { BranchCommands } from './enums/branch-commands.enum';
import { RepoCommands } from './enums/repo-commands.enum';
import { GlobalCommands } from './enums/global-commands.enum';
import { ExternalCommands } from './enums/external-commands.enum';


export class BranchSwitcher {
    private git: Git;
    private tree: BranchTreeProvider;
    private extensionContext: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.extensionContext = context;
        this.git = new Git();
        this.tree = new BranchTreeProvider(this.git, this.extensionContext);

        this.extensionContext.subscriptions.push(this.git, this.tree);

        this.setupTree();
        this.setupGlobalCommands();
        this.setupBranchCommands();
    }

    setupTree() {
        this.extensionContext.subscriptions.push(
            vscode.window.createTreeView('scm-local-branches', { treeDataProvider: this.tree })
        );
    }
    setupGlobalCommands() {
        this.extensionContext.subscriptions.push(
            vscode.commands.registerCommand(GlobalCommands.refresh, () => {
                this.git.refresh();
            }),
            vscode.commands.registerCommand(GlobalCommands.createBranch, async () => {
                const repo = this.tree.getCurrentRepository();
                if (!repo) {
                    return;
                }

                vscode.commands.executeCommand(ExternalCommands.createBranch, [repo]);
            }),
        );
    }
    setupRepoCommands() {
        this.extensionContext.subscriptions.push(
            vscode.commands.registerCommand(RepoCommands.createBranch, async (repo: Repository) => {
                if (!repo) {
                    return;
                }

                vscode.commands.executeCommand(ExternalCommands.createBranch, [repo]);
            }),
        );
    }
    setupBranchCommands() {
        this.extensionContext.subscriptions.push(
            vscode.commands.registerCommand(BranchCommands.checkout, (branch: Branch) => {
                this.git.checkoutBranch(branch);
            }),
            vscode.commands.registerCommand(BranchCommands.delete, async (branch: Branch) => {
                const config = vscode.workspace.getConfiguration('scm-local-branches');
                if (config.get('confirmDelete', false)) {
                    const confirmButton = 'Confirm';
                    const action = await vscode.window.showWarningMessage(
                        `Are you sure you want to delete branch '${branch.branchName}?`,
                        { modal: true },
                        confirmButton
                    );
                    if (action !== confirmButton) {
                        return;
                    }
                }
                this.git.deleteBranch(branch);
            }),
            vscode.commands.registerCommand(BranchCommands.rename, async (branch: Branch) => {
                const newName = await vscode.window.showInputBox({
                    value: branch.branchName,
                    placeHolder: 'Enter a branch name',
                    prompt: `Renaming branch from '${branch.branchName}`
                });

                if (newName) {
                    this.git.renameBranch(branch, newName);
                }
            }),
            vscode.commands.registerCommand(BranchCommands.setUpstream, async (branch: Branch) => {
                const currentUpstream = await this.git.getCurrentUpstream(branch);
                const newUpstream = await vscode.window.showInputBox({
                    value: currentUpstream,
                    placeHolder: 'Enter a new upstream',
                    prompt: `Updating upstream for branch '${branch.branchName}`
                });

                if (newUpstream) {
                    this.git.setUpstream(branch, newUpstream);
                } else if (newUpstream !== undefined) {
                    // set to empty string will be treated like a delete
                    vscode.commands.executeCommand(BranchCommands.deleteUpstream, [branch]);
                }
            }),
            vscode.commands.registerCommand(BranchCommands.deleteUpstream, async (branch: Branch) => {
                const config = vscode.workspace.getConfiguration('scm-local-branches');
                if (config.get('confirmDelete', false)) {
                    const confirmButton = 'Confirm';
                    const action = await vscode.window.showWarningMessage(
                        `Are you sure you want to remove the upstream for branch '${branch.branchName}?`,
                        { modal: true },
                        confirmButton
                    );
                    if (action !== confirmButton) {
                        return;
                    }
                }
                this.git.deleteUpstream(branch);
            })
        );
    }
}
