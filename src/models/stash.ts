import { Repository } from "../typings/git-extension";

export interface Stash {
    readonly repo: Repository;
    readonly index?: number;
    readonly commit?: string;
    readonly message?: string;
    readonly branchName?: string;
    readonly date?: string;
};
