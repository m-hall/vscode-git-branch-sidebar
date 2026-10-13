import * as vscode from 'vscode';
import { Git } from './git';
import { Stash, StashFile, StashFileStatus } from './models/stash';

export const STASH_SCHEME = 'scm-local-stash';

/**
 * Provides read-only documents containing the patch for a stash, or a single file's contents
 * before or after a stash.
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

    /**
     * Uris for the contents of a file before (left) and after (right) the stash.
     * A side where the file does not exist has no ref and resolves to an empty document.
     */
    static diffUrisFor(file: StashFile): { left: vscode.Uri, right: vscode.Uri } {
        const commit = file.stash.commit!!;
        const isNew = file.status === StashFileStatus.added || file.status === StashFileStatus.untracked;

        return {
            left: StashContentProvider.fileUri(file.stash, file.oldPath ?? file.path, isNew ? undefined : `${commit}^1`),
            right: StashContentProvider.fileUri(
                file.stash,
                file.path,
                file.status === StashFileStatus.deleted ? undefined
                    : file.status === StashFileStatus.untracked ? `${commit}^3`
                    : commit
            )
        };
    }

    private static fileUri(stash: Stash, path: string, ref?: string): vscode.Uri {
        return vscode.Uri.from({
            scheme: STASH_SCHEME,
            // keep the file's own path so the editor picks the right language
            path: `/${path}`,
            query: JSON.stringify({ root: stash.repo.rootUri.fsPath, file: path, ref })
        });
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const { root, commit, file, ref } = JSON.parse(uri.query);
        const repo = this.git.getRepositories().find((r) => r.rootUri.fsPath === root);
        if (!repo) {
            return '';
        }

        if (file !== undefined) {
            return ref ? await this.git.getFileAtRef(repo, ref, file) : '';
        }

        return await this.git.getStashPatch(repo, commit);
    }
}
