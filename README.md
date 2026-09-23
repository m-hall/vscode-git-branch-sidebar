# vscode-git-branch-sidebar

Adds a quick access list of git branches and stashes to the source control sidebar.

## Features

Adds 3 views to the source control sidebar activity.

- Local Branches: Allows switching and deleting branches
- Remote Branches: Allows checking out remote branches as local tracking branches (collapsed by default)
- Stashes: Allows viewing, applying and deleting stashes (collapsed by default)

## Settings

| Setting                                   | Default | Description                                                                 |
| ----------------------------------------- | ------- | --------------------------------------------------------------------------- |
| `scm-local-branches.showUpstreamStatus`   | `true`  | Show upstream status (commits ahead/behind) beside branch name              |
| `scm-local-branches.confirmDelete`        | `true`  | Confirm before deleting a branch, removing an upstream, or dropping a stash |
| `scm-local-branches.renameRespectsPrefix` | `true`  | When renaming a branch, don't select the `git.branchPrefix` by default      |
| `scm-local-branches.stashQuickApply`      | `false` | Show a quick access button to apply stashes                                 |
| `scm-local-branches.stashQuickPop`        | `false` | Show a quick access button to pop stashes                                   |
| `scm-local-branches.stashQuickDrop`       | `true`  | Show a quick access button to drop stashes                                  |

## Requirements

- Only supports Git repositories
- Must have "vscode.git" extension enabled (by default it is available)

## Release Notes

### 1.6.2 - 2024-01-07

- Add custom icon for when moved to own sidebar view
- Allow pulling changes from remote on active branch
