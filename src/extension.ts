import * as vscode from 'vscode';
import { BranchSwitcher } from './branches';
import { StashManager } from './stashes';
import { Git } from './git';

export function activate(context: vscode.ExtensionContext) {
    const git = new Git();
    context.subscriptions.push(git);

    new BranchSwitcher(context, git);
    new StashManager(context, git);
}
