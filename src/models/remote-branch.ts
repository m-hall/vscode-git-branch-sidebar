import { Repository } from "../typings/git-extension";

export interface RemoteBranch {
    readonly repo: Repository;
    readonly remote?: string;
    readonly branchName?: string;
    readonly commit?: string;
    readonly localBranches?: string[];
};
