import * as vscode from 'vscode';
import { BranchSwitcher } from './branches';

export function activate(context: vscode.ExtensionContext) {
    new BranchSwitcher(context);
}

