import * as vscode from 'vscode';
import { BranchSwitcher } from './branches';
import { StashManager } from './stashes';
import { RemoteBranchManager } from './remote-branches';
import { Git } from './git';

export function activate(context: vscode.ExtensionContext) {
    const git = new Git();
    context.subscriptions.push(git);

    new BranchSwitcher(context, git);
    new StashManager(context, git);
    new RemoteBranchManager(context, git);
}
