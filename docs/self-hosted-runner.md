# Self-hosted runner

The `build` and `deploy` jobs in `.github/workflows/ci.yml` use `runs-on: self-hosted`.
Everything else runs on `ubuntu-latest`. Read the security section before you register a
runner against this repo — it is public.

## Provisioning

Host used here: Ubuntu 22.04, 4 vCPU, 8 GB RAM, 60 GB disk. Docker builds and the Qdrant
container are the memory hogs.

```bash
sudo adduser --disabled-password --gecos "" runner
sudo usermod -aG docker runner
sudo -iu runner

mkdir actions-runner && cd actions-runner
curl -o actions-runner.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.321.0/actions-runner-linux-x64-2.321.0.tar.gz
tar xzf actions-runner.tar.gz
```

Get a registration token (expires in one hour):

```bash
gh api -X POST repos/invincibleRD/nyaya-legal-rag/actions/runners/registration-token --jq .token
```

Configure:

```bash
./config.sh \
  --url https://github.com/invincibleRD/nyaya-legal-rag \
  --token <REGISTRATION_TOKEN> \
  --name nyaya-deploy-01 \
  --labels self-hosted,linux,x64,nyaya-deploy \
  --work _work \
  --unattended
```

## Labels

`config.sh` always adds `self-hosted`, plus the OS and arch labels. `--labels` adds your own.
The workflow currently matches on `self-hosted` alone. If you add a second runner for
something else, narrow it:

```yaml
runs-on: [self-hosted, linux, nyaya-deploy]
```

A job with multiple labels only runs on a runner carrying all of them.

## systemd

The bundled helper writes and enables the unit:

```bash
sudo ./svc.sh install runner
sudo ./svc.sh start
sudo ./svc.sh status
journalctl -u 'actions.runner.*' -f
```

The unit is `actions.runner.invincibleRD-nyaya-legal-rag.nyaya-deploy-01.service`.
It restarts on failure and starts at boot.

## Tokens

Three different tokens, do not mix them up.

- **Registration token** — from the API call above, one hour, one use. Never commit it.
- **Runner credentials** — written to `.credentials` and `.runner` after `config.sh`.
  Mode 0600, owned by `runner`. These are the long-lived identity of the machine.
  Anyone who reads them can impersonate the runner.
- **`GITHUB_TOKEN`** — minted per job by GitHub, expires when the job ends. This is what
  pushes to GHCR. There is no PAT in this pipeline.

Rotation: `sudo ./svc.sh stop && ./config.sh remove --token <REMOVE_TOKEN>`, then re-register
with a fresh registration token. Remove tokens come from
`repos/.../actions/runners/remove-token`. Do this whenever someone with host access leaves,
or if `_work` ever ran untrusted code. Delete stale runners in
Settings > Actions > Runners so offline entries do not linger.

## Deploy prerequisites

`docker-compose.yml` uses `env_file: .env`, and that file is gitignored. Put a populated
`.env` in the runner's workspace (`_work/nyaya-legal-rag/nyaya-legal-rag/.env`) once, mode
0600, owned by `runner`. `actions/checkout` does not delete untracked files, so it survives
between runs. Keys in it (Gemini, OpenRouter) are the reason the runner must not execute
untrusted code.

## The security problem

A self-hosted runner is your machine executing whatever the workflow says. On a public repo,
anyone can open a pull request. If that PR's code reaches the runner, they get code execution
as the `runner` user, on your network, with your Docker socket.

`pull_request` from a fork is relatively safe on GitHub-hosted runners: the token is read-only
and secrets are withheld. On a self-hosted runner that protection is irrelevant — the attacker
does not need your secrets, they already have a shell on your box. They can read `_work` from
previous jobs, scrape `~/.docker/config.json`, plant a backdoor in the build cache, or pivot
to whatever else is on that LAN.

`pull_request_target` is worse. It runs the workflow definition from the base branch but with
a **read-write token and full access to secrets**. Combined with an explicit checkout of
`github.event.pull_request.head.sha`, it hands an attacker your secrets and your machine in
one step. Do not use `pull_request_target` in this repo. If you ever need it for a label bot,
never check out PR code in it.

Mitigations, in the order they actually help:

1. **Do not run fork PR code on the self-hosted runner.** The `build` job is gated on
   `github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository`.
   Fork PRs get lint, test and gitleaks on `ubuntu-latest` and stop there.
2. **Require approval.** Settings > Actions > General > "Require approval for all outside
   collaborators" (or "for all external contributors"). A maintainer must click before any
   workflow runs for a fork.
3. **Ephemeral / just-in-time runners.** Register with `--ephemeral` so the runner takes one
   job and unregisters, and re-provision from a clean image. JIT runners
   (`POST /actions/runners/generate-jitconfig`) go further: a one-shot config, no long-lived
   `.credentials` on disk.
4. **Isolate the host.** Run the runner in a VM or a disposable container, not on your laptop
   and not on the box that holds production data. Docker socket access is root-equivalent —
   if the runner has it, treat the runner as root.
5. **Restrict the network.** Egress to github.com, ghcr.io and the npm registry. No route to
   the rest of the LAN. Inbound: nothing.
6. **Least privilege in the workflow.** Top-level `permissions: contents: read`; only `build`
   gets `packages: write`. No PATs, no cloud keys on the runner beyond what deploy needs.
7. **Protect `main` and `dev`.** Branch protection plus required reviews means a merge, not a
   PR, is what reaches the deploy path.

## Rollback

Deploy uses `docker-compose.yml` plus `.github/deploy/compose.deploy.yml`, which swaps the
local `build:` for the GHCR image in `$BACKEND_IMAGE`. The job records the previously running
image to `~/nyaya-previous-image` before it pulls. To go back:

```bash
cd ~/actions-runner/_work/nyaya-legal-rag/nyaya-legal-rag
export COMPOSE_PROJECT_NAME=nyaya
export BACKEND_IMAGE="$(cat ~/nyaya-previous-image)"
docker compose -f docker-compose.yml -f .github/deploy/compose.deploy.yml up -d --no-deps api worker
curl -fsS http://127.0.0.1:8000/api/v1/health
```

The old image is still in the local Docker cache, so this is a container restart: about
10-20 seconds, plus up to 20 more for the healthcheck start period. Call it under a minute.

If the image was pruned, pull it back by SHA first:

```bash
docker pull ghcr.io/invinciblerd/nyaya-legal-rag-backend:<previous-sha>
```

That adds however long the pull takes, typically 30-60 seconds on a warm layer cache.

Rollback only covers the backend container. It does not undo anything written to Qdrant or
Redis, so a migration or a re-ingest needs its own plan.

## What is actually registered (31 Aug 2026)

| | |
|---|---|
| host | `hrn-1`, the same GCP VM that serves hrn.ultronai.me (g2-standard-8, NVIDIA L4) |
| runner name | `hrn-1-gpu` |
| labels | `self-hosted, Linux, X64, gpu` |
| runs as | `ubuntu` — it needs the docker group and write access to the deployed compose project |
| service | `actions.runner.invincibleRD-nyaya-legal-rag.hrn-1-gpu.service`, enabled at boot |
| version | 2.321.0, self-updated to 2.336.0 on first connect |

```bash
sudo systemctl status actions.runner.invincibleRD-nyaya-legal-rag.hrn-1-gpu
cd ~/actions-runner && sudo ./svc.sh stop   # and ./svc.sh start
```

It picked up the queued `build` job within seconds of the service starting, which
is the evidence that it works.

### Jobs that need it

- `build` — docker build, Trivy scan, push to GHCR
- `deploy` — on push to `main` only
- `retrieval` — the golden set regression gate. It lives here rather than on
  `ubuntu-latest` because it needs a live Qdrant with the act already ingested.
  `DATA_DIR` points at the deployed `data/` so the BM25 stats are found; without
  them the sparse leg is skipped and the test self-skips rather than silently
  measuring dense-only.

### Hardening

This repository is public, so an unguarded self-hosted runner would execute
arbitrary code from any fork's pull request. Every self-hosted job is gated:

```yaml
if: github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository
```

A PR from a fork therefore never reaches this machine — it gets lint, tests,
secret scanning and the frontend build on GitHub's runners and stops there.

Still true and worth saying plainly: the runner is not sandboxed. It shares a box
with the running application, and a malicious commit pushed directly to this repo
would run as `ubuntu` with docker access, which is root-equivalent. For anything
beyond a single-maintainer assignment repo this should be an ephemeral runner on
a throwaway VM, one job per machine.

### Token handling

The registration token is short-lived (one hour) and was never written to disk or
into a command line — it was piped from `gh api` straight into `config.sh` over
stdin. `~/actions-runner/.credentials` holds the long-lived credential; it is
mode 600 and owned by `ubuntu`. To revoke, `sudo ./svc.sh uninstall && ./config.sh remove`,
or delete the runner from the repository settings.
