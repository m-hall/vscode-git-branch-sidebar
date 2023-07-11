import * as vscode from 'vscode';
import { Git } from './git';
import { Branch } from './models/branch';
import { BranchTreeProvider } from './branch-tree-provider';
import { Repository, UpstreamRef } from './typings/git-extension';
import { BranchCommands } from './enums/branch-commands.enum';
import { RepoCommands } from './enums/repo-commands.enum';
import { GlobalCommands } from './enums/global-commands.enum';
import { ExternalCommands } from './enums/external-commands.enum';

const EXTENION_NAME = 'scm-local-branches'

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
            vscode.window.createTreeView(EXTENION_NAME, { treeDataProvider: this.tree })
        );
    }
    setupGlobalCommands() {
        this.extensionContext.subscriptions.push(
            vscode.commands.registerCommand(GlobalCommands.refresh, async () => {
                await this.git.refresh();
            }),
            vscode.commands.registerCommand(GlobalCommands.createBranch, async () => {
                const repo = this.tree.getCurrentRepository();
                if (!repo) {
                    return;
                }

                await vscode.commands.executeCommand(ExternalCommands.createBranch, [repo]);
            }),
        );
    }
    setupRepoCommands() {
        this.extensionContext.subscriptions.push(
            vscode.commands.registerCommand(RepoCommands.createBranch, async (repo: Repository) => {
                if (!repo) {
                    return;
                }

                await vscode.commands.executeCommand(ExternalCommands.createBranch, [repo]);
            }),
        );
    }
    setupBranchCommands() {
        this.extensionContext.subscriptions.push(
            vscode.commands.registerCommand(BranchCommands.checkout, async (branch: Branch) => {
                await this.git.checkoutBranch(branch);
            }),
            vscode.commands.registerCommand(BranchCommands.delete, async (branch: Branch) => {
                const config = vscode.workspace.getConfiguration(EXTENION_NAME);
                if (config.get('confirmDelete', true)) {
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
                await this.git.deleteBranch(branch);
            }),
            vscode.commands.registerCommand(BranchCommands.rename, async (branch: Branch) => {
                const config = vscode.workspace.getConfiguration(EXTENION_NAME);
                const options: vscode.InputBoxOptions = {
                    value: branch.branchName,
                    placeHolder: 'Enter a branch name',
                    prompt: `Renaming branch from '${branch.branchName}`,
                };

                if (config.get('renameRespectsPrefix', true)) {
                    const gitConfig = vscode.workspace.getConfiguration('git');
                    const prefix: string = gitConfig.get('branchPrefix', '');

                    if (prefix && branch.branchName?.startsWith(prefix)) {
                        options.valueSelection = [prefix.length, branch.branchName.length];
                    }
                }

                const newName = await vscode.window.showInputBox(options);

                if (newName && newName !== branch.branchName) {
                    await this.git.renameBranch(branch, newName);
                }
            }),
            vscode.commands.registerCommand(BranchCommands.setUpstream, async (branch: Branch) => {
                const newUpstream = await vscode.window.showInputBox({
                    value: fullUpstreamName(branch.upstream),
                    placeHolder: 'Enter a new upstream',
                    prompt: `Updating upstream for branch '${branch.branchName}`
                });

                if (newUpstream) {
                    await this.git.setUpstream(branch, newUpstream);
                } else if (newUpstream !== undefined) {
                    // set to empty string will be treated like a removal of tracking upstream
                    await vscode.commands.executeCommand(BranchCommands.unsetUpstream, [branch]);
                }
            }),
            vscode.commands.registerCommand(BranchCommands.unsetUpstream, async (branch: Branch) => {
                const config = vscode.workspace.getConfiguration(EXTENION_NAME);
                if (config.get('confirmDelete', false)) {
                    const confirmButton = 'Confirm';
                    const action = await vscode.window.showWarningMessage(
                        `Are you sure you want to stop tracking upstream ${fullUpstreamName(branch.upstream)} for branch '${branch.branchName}?`,
                        { modal: true },
                        confirmButton
                    );
                    if (action !== confirmButton) {
                        return;
                    }
                }
                await this.git.unsetUpstream(branch);
            }),
            vscode.commands.registerCommand(BranchCommands.sync, async (branch: Branch) => {
                await vscode.window.withProgress({
                    location: { viewId: EXTENION_NAME }
                }, async () => this.git.sync(branch))
            }),
            vscode.commands.registerCommand(BranchCommands.syncCheckout, async (branch: Branch) => {
                await vscode.window.withProgress({
                    location: { viewId: EXTENION_NAME }
                }, async () => {
                    await this.git.sync(branch);
                    await this.git.checkoutBranch(branch);
                })
            })
        );
    }

}

function fullUpstreamName(upstream?: UpstreamRef): string {
    return upstream ? `${upstream.remote}/${upstream.name}` : '';
}