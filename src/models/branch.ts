import { Repository, UpstreamRef } from "../typings/git-extension";

export interface Branch {
    readonly repo: Repository;
    readonly branchName?: string;
    readonly selected?: boolean;
    readonly upstreamState?: string;
    readonly upstream?: UpstreamRef;
};
