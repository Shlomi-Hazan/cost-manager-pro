# START HERE — GitHub Bootstrap

Repository name selected for this project:

```text
cost-manager-front-end
```

Target repository:

```text
Shlomi-Hazan/cost-manager-front-end
```

Visibility:

```text
Public
```

Collaborator:

```text
eldadsimanian
```

## One local bootstrap command

After extracting this repository foundation, open Terminal in this folder and run:

```bash
bash scripts/bootstrap-github.sh
```

The script will:

1. verify `git` and `gh`,
2. verify GitHub authentication as `Shlomi-Hazan`,
3. initialize Git with `main`,
4. create the initial foundation commit,
5. create the public GitHub repository,
6. push `main`,
7. invite `eldadsimanian` with write access,
8. create the initial project Issues,
9. attempt to protect `main` with PR + one approval,
10. print final repository verification.

The script is safe to rerun: it checks whether the repository and initial Issues already exist before recreating them.

## Why this local command is needed

The ChatGPT GitHub connection available in this session can inspect and modify existing repositories, issues, branches, files, and pull requests, but it does not expose an action for creating a new GitHub repository or adding a new repository collaborator.

Once the repository exists, it can be inspected and worked with directly through the connected GitHub account.
