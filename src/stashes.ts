import * as vscode from 'vscode';
import { Git } from './git';
import { Stash } from './models/stash';
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
                await this.createStash(this.tree.getCurrentRepository(), false);
            }),
            vscode.commands.registerCommand(StashGlobalCommands.createIncludeUntracked, async () => {
                await this.createStash(this.tree.getCurrentRepository(), true);
            }),
            vscode.commands.registerCommand(StashGlobalCommands.createForRepo, async (node: Stash) => {
                await this.createStash(node?.repo, false);
            }),
        );
    }
    setupStashCommands() {
        this.extensionContext.subscriptions.push(
            vscode.commands.registerCommand(StashCommands.show, async (stash: Stash) => {
                const doc = await vscode.workspace.openTextDocument(StashContentProvider.uriFor(stash));
                await vscode.window.showTextDocument(doc, { preview: true });
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

    private async createStash(repo: Repository|null|undefined, includeUntracked: boolean) {
        if (!repo) {
            return;
        }

        const message = await vscode.window.showInputBox({
            placeHolder: 'Enter a stash message (optional)',
            prompt: includeUntracked ? 'Stash changes, including untracked files' : 'Stash changes'
        });

        if (message === undefined) {
            // cancelled
            return;
        }

        await vscode.window.withProgress({
            location: { viewId: VIEW_NAME }
        }, async () => this.git.createStash(repo, message, includeUntracked));
    }
}
