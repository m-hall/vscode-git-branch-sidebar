import { Repository } from "../typings/git-extension";

export interface Stash {
    readonly repo: Repository;
    readonly index?: number;
    readonly commit?: string;
    readonly message?: string;
    readonly branchName?: string;
    readonly date?: string;
};

export enum StashFileStatus {
    added = 'A',
    modified = 'M',
    deleted = 'D',
    renamed = 'R',
    untracked = 'U'
}

export interface StashFile {
    readonly stash: Stash;
    readonly path: string;
    readonly oldPath?: string;
    readonly status: StashFileStatus;
};
