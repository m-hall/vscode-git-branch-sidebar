import { Repository } from "../../typings/git";

export interface Branch {
    repo: Repository;
    branchName?: string;
    selected?: boolean;
}
