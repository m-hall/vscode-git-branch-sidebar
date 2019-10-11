import * as vscode from 'vscode';
import { BranchSwitcher } from './tree/scm/branches';

let branchSwitcher: BranchSwitcher;

export function activate(context: vscode.ExtensionContext) {
    branchSwitcher = new BranchSwitcher(context);
}

export function deactivate() {
    if (branchSwitcher) {
        branchSwitcher.dispose();
    }
}
