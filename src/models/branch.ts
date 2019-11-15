import { Repository } from "../typings/git-extension";

export interface Branch {
    repo: Repository;
    branchName?: string;
    selected?: boolean;
}
