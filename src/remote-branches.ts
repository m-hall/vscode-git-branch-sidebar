import * as vscode from 'vscode';
import { Git } from './git';
import { RemoteBranchTreeProvider } from './remote-branch-tree-provider';
import { RemoteBranchGlobalCommands } from './enums/remote-branch-global-commands.enum';
import { RemoteBranchCommands } from './enums/remote-branch-commands.enum';
import { RemoteBranch } from './models/remote-branch';

const CONFIG_NAME = 'scm-local-branches';
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
            vscode.commands.registerCommand(RemoteBranchGlobalCommands.fetch, async (node?: RemoteBranch) => {
                // from a repo or remote row fetch just that, from the view title fetch everything
                const repos = node ? [node.repo] : this.git.getRepositories();
                await vscode.window.withProgress({
                    location: { viewId: VIEW_NAME }
                }, async () => Promise.all(repos.map((repo) => this.git.fetch(repo, node?.remote))));
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
            vscode.commands.registerCommand(RemoteBranchCommands.showGraph, async (branch: RemoteBranch) => {
                const remoteName = `${branch.remote}/${branch.branchName}`;
                this.git.showGraph(branch.repo, `refs/remotes/${remoteName}`, remoteName);
            }),
            vscode.commands.registerCommand(RemoteBranchCommands.merge, async (branch: RemoteBranch) => {
                await vscode.window.withProgress({
                    location: { viewId: VIEW_NAME }
                }, async () => this.git.mergeRemoteBranch(branch));
            }),
            vscode.commands.registerCommand(RemoteBranchCommands.rebase, async (branch: RemoteBranch) => {
                await vscode.window.withProgress({
                    location: { viewId: VIEW_NAME }
                }, async () => this.git.rebaseOntoRemoteBranch(branch));
            }),
            vscode.commands.registerCommand(RemoteBranchCommands.delete, async (branch: RemoteBranch) => {
                const remoteName = `${branch.remote}/${branch.branchName}`;
                const config = vscode.workspace.getConfiguration(CONFIG_NAME);
                if (config.get('confirmDelete', true)) {
                    const confirmButton = 'Delete';
                    const action = await vscode.window.showWarningMessage(
                        `Are you sure you want to delete '${remoteName}' from the remote?`,
                        { modal: true },
                        confirmButton
                    );
                    if (action !== confirmButton) {
                        return;
                    }
                }
                await vscode.window.withProgress({
                    location: { viewId: VIEW_NAME }
                }, async () => this.git.deleteRemoteBranch(branch));
            }),
            vscode.commands.registerCommand(RemoteBranchCommands.copyName, async (branch: RemoteBranch) => {
                await vscode.env.clipboard.writeText(branch.branchName!!);
            }),
        );
    }
}
