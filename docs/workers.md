# Workers

A **worker** is a project that runs in the background without a public URL — queues, mailers, importers, watchers.

Beacon owns the process when you leave **managed** on (the default):

- **Docker** — image or a Dockerfile in the repo. Beacon runs `docker build`/`docker run` with your env, CPU/memory limits, restart policy, and replica count.
- **Native process** — a start command Beacon spawns and restarts (works on Windows without Docker).
- **Compose / systemd** — still available; systemd generates a unit from the start command.

Advanced (collapsed): replicas, restart, cron schedule, autoscale from host CPU/memory, auto-deploy when git is behind.

## A worker you can test with

No repo, no Docker — **Add project**, set service kind **Worker**, run kind **Native process**, and use:

```
node -e "setInterval(() => console.log(new Date().toISOString(), 'tick', process.env.GREETING), 2000)"
```

Add `GREETING=hello` under environment. Save, and the log panel prints a line every two seconds.
`BEACON_REPLICA` is injected too, so raising **Replicas** to 2 shows both instances interleaved.
Kill one from the terminal and the restart policy brings it back.

## Delete

Remove offers two choices:

- **Remove from dashboard** — unlink only. Clone, containers, and units stay on disk (the old behaviour).
- **Delete Beacon files too** — stop the worker and delete labeled containers/images, generated units, worker scratch files, and the git folder **only if Beacon cloned it**. Attached existing containers/folders are never destroyed.

## Logs

The project page streams `docker logs -f`, `journalctl -fu`, or the native process ring buffer over `/api/projects/:id/logs`.
