import * as vscode from 'vscode';
import { Git } from './git';
import { Stash } from './models/stash';

export const STASH_SCHEME = 'scm-local-stash';

/**
 * Provides read-only documents containing the patch for a stash.
 */
export class StashContentProvider implements vscode.TextDocumentContentProvider {
    private git: Git;

    constructor(git: Git) {
        this.git = git;
    }

    static uriFor(stash: Stash): vscode.Uri {
        return vscode.Uri.from({
            scheme: STASH_SCHEME,
            // .diff extension gives the document diff syntax highlighting
            path: `/stash@{${stash.index}}.diff`,
            query: JSON.stringify({ root: stash.repo.rootUri.fsPath, commit: stash.commit })
        });
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const { root, commit } = JSON.parse(uri.query);
        const repo = this.git.getRepositories().find((r) => r.rootUri.fsPath === root);
        if (!repo) {
            return '';
        }

        return await this.git.getStashPatch(repo, commit);
    }
}
