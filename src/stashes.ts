import * as vscode from 'vscode';
import { Git, StashOptions } from './git';
import * as path from 'path';
import { Stash, StashFile } from './models/stash';
import { StashTreeProvider } from './stash-tree-provider';
import { StashContentProvider, STASH_SCHEME } from './stash-content-provider';
import { Repository } from './typings/git-extension';
import { StashCommands } from './enums/stash-commands.enum';
import { StashGlobalCommands } from './enums/stash-global-commands.enum';

const CONFIG_NAME = 'scm-local-branches';
const VIEW_NAME = 'scm-local-stashes';

export class StashManager {
    private git: Git;
    private tree: StashTreeProvider;
    private extensionContext: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext, git: Git) {
        this.extensionContext = context;
        this.git = git;
        this.tree = new StashTreeProvider(this.git);

        this.extensionContext.subscriptions.push(this.tree);

        this.setupTree();
        this.setupGlobalCommands();
        this.setupStashCommands();
    }

    setupTree() {
        this.extensionContext.subscriptions.push(
            vscode.window.createTreeView(VIEW_NAME, { treeDataProvider: this.tree }),
            vscode.workspace.registerTextDocumentContentProvider(STASH_SCHEME, new StashContentProvider(this.git))
        );
    }
    setupGlobalCommands() {
        this.extensionContext.subscriptions.push(
            vscode.commands.registerCommand(StashGlobalCommands.refresh, async () => {
                await this.git.refresh();
            }),
            vscode.commands.registerCommand(StashGlobalCommands.create, async () => {
                await this.createStash(this.tree.getCurrentRepository());
            }),
            vscode.commands.registerCommand(StashGlobalCommands.createIncludeUntracked, async () => {
                await this.createStash(this.tree.getCurrentRepository(), { includeUntracked: true });
            }),
            vscode.commands.registerCommand(StashGlobalCommands.createForRepo, async (node: Stash) => {
                await this.createStash(node?.repo);
            }),
            vscode.commands.registerCommand(StashGlobalCommands.createFromStaged, async (group?: vscode.SourceControlResourceGroup) => {
                await this.createStash(this.getRepositoryForGroup(group), { staged: true });
            }),
            vscode.commands.registerCommand(StashGlobalCommands.createFromUnstaged, async (group?: vscode.SourceControlResourceGroup) => {
                // --keep-index leaves the staged changes in place so only unstaged changes are removed
                await this.createStash(this.getRepositoryForGroup(group), { keepIndex: true });
            }),
            vscode.commands.registerCommand(StashGlobalCommands.clear, async (node?: Stash) => {
                const repo = node?.repo ?? this.tree.getCurrentRepository();
                if (!repo) {
                    return;
                }
                // always confirm, dropping every stash at once is not recoverable from the sidebar
                const confirmButton = 'Clear';
                const action = await vscode.window.showWarningMessage(
                    'Are you sure you want to drop all stashes? This cannot be undone.',
                    { modal: true },
                    confirmButton
                );
                if (action === confirmButton) {
                    await this.git.clearStashes(repo);
                }
            }),
        );
    }
    setupStashCommands() {
        this.extensionContext.subscriptions.push(
            vscode.commands.registerCommand(StashCommands.show, async (stash: Stash) => {
                const doc = await vscode.workspace.openTextDocument(StashContentProvider.uriFor(stash));
                await vscode.window.showTextDocument(doc, { preview: true });
            }),
            vscode.commands.registerCommand(StashCommands.openFile, async (file: StashFile) => {
                const { left, right } = StashContentProvider.diffUrisFor(file);
                const title = `${path.posix.basename(file.path)} (stash@{${file.stash.index}})`;
                await vscode.commands.executeCommand('vscode.diff', left, right, title, { preview: true });
            }),
            vscode.commands.registerCommand(StashCommands.applyFile, async (file: StashFile) => {
                await vscode.window.withProgress({
                    location: { viewId: VIEW_NAME }
                }, async () => this.git.applyStashFile(file));
            }),
            vscode.commands.registerCommand(StashCommands.compareFileWithWorkingTree, async (file: StashFile) => {
                const { right: stashed } = StashContentProvider.diffUrisFor(file);
                const working = vscode.Uri.joinPath(file.stash.repo.rootUri, file.path);
                const title = `${path.posix.basename(file.path)} (stash@{${file.stash.index}}) ↔ Working Tree`;
                await vscode.commands.executeCommand('vscode.diff', stashed, working, title, { preview: true });
            }),
            vscode.commands.registerCommand(StashCommands.openWorkingFile, async (file: StashFile) => {
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.joinPath(file.stash.repo.rootUri, file.path));
            }),
            vscode.commands.registerCommand(StashCommands.createBranch, async (stash: Stash) => {
                const name = await vscode.window.showInputBox({
                    placeHolder: 'Enter a branch name',
                    prompt: `Create a branch from stash '${stash.message}'. The stash is dropped once it applies cleanly.`,
                    validateInput: async (value) => {
                        if (!this.git.isValidBranchName(value)) {
                            return 'Branch name is not valid';
                        }
                        if (await this.git.getLocalBranch(stash.repo, value)) {
                            return `A local branch named '${value}' already exists`;
                        }
                        return undefined;
                    }
                });

                if (name) {
                    await vscode.window.withProgress({
                        location: { viewId: VIEW_NAME }
                    }, async () => this.git.createBranchFromStash(stash, name));
                }
            }),
            vscode.commands.registerCommand(StashCommands.apply, async (stash: Stash) => {
                await vscode.window.withProgress({
                    location: { viewId: VIEW_NAME }
                }, async () => this.git.applyStash(stash));
            }),
            vscode.commands.registerCommand(StashCommands.pop, async (stash: Stash) => {
                await vscode.window.withProgress({
                    location: { viewId: VIEW_NAME }
                }, async () => this.git.popStash(stash));
            }),
            vscode.commands.registerCommand(StashCommands.drop, async (stash: Stash) => {
                const config = vscode.workspace.getConfiguration(CONFIG_NAME);
                if (config.get('confirmDelete', true)) {
                    const confirmButton = 'Confirm';
                    const action = await vscode.window.showWarningMessage(
                        `Are you sure you want to drop stash '${stash.message}'?`,
                        { modal: true },
                        confirmButton
                    );
                    if (action !== confirmButton) {
                        return;
                    }
                }
                await this.git.dropStash(stash);
            }),
        );
    }

    private getRepositoryForGroup(group?: vscode.SourceControlResourceGroup): Repository|null {
        const resource = group?.resourceStates[0];
        if (!resource) {
            return this.tree.getCurrentRepository();
        }

        return this.git.getRepository(resource.resourceUri);
    }

    private async createStash(repo: Repository|null|undefined, options: StashOptions = {}) {
        if (!repo) {
            return;
        }

        const message = await vscode.window.showInputBox({
            placeHolder: 'Enter a stash message (optional)',
            prompt: options.staged ? 'Stash staged changes'
                : options.keepIndex ? 'Stash unstaged changes'
                : options.includeUntracked ? 'Stash changes, including untracked files'
                : 'Stash changes'
        });

        if (message === undefined) {
            // cancelled
            return;
        }

        await vscode.window.withProgress({
            location: { viewId: VIEW_NAME }
        }, async () => this.git.createStash(repo, message, options));
    }
}
