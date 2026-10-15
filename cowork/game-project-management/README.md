# game-project-management

Run a multi-role game-production team as the project-management side.

A **Codely / Tuanjie Cowork agent skill**. Activating it in a conversation makes that conversation
the **project-management (orchestration) side**, stands up the team scaffolding (role charters, ownership
whitelist, task board, ledgers) and walks the human through running a multi-role production team.

It delegates transport to the companion skill — install that too.

> **Tuanjie Cowork / Codely only.** This skill is installed into that client and drives its local hub;
> a plain terminal session or another agent host cannot use it.

## Install

```bash
# from the umbrella repository (the skill lives in the cowork/ sub-directory):
codely skills install https://github.com/yuanman1009/cowork-skills --path cowork/game-project-management
# or from a local clone:
codely skills install ./cowork/game-project-management --scope user
```

Then run `/skills reload` in the session to pick it up.

## Use

Ask the agent to do the work ("hand this to the art window"), or drive the bundled CLI yourself:

```powershell
$cc = "$env:USERPROFILE\.codely-cli\skills\game-project-management\cross-chat.cmd"
& $cc version                 # self-check: prints the version
& $cc list                    # conversations, runtime state, bound roles
& $cc send --to <role|title> --message "…" --intent work --wake wake
& $cc scheduled               # background deliveries waiting for a busy peer
```

On macOS/Linux use `./cross-chat.sh` instead of `cross-chat.cmd`.

## Requirements

- You are using **Tuanjie Cowork / Codely** — the skill talks to that client's own local hub.
- The client must be **running** for live delivery (the offline channel works without it).
- **No Node install needed**: the launcher finds a runtime by itself — `node` on `PATH`, or the copy the
  client ships (`CODELY_HOME`, `CODELY_CLI_BASE_DIR`, next to `codely`, or a standard install location).

If neither exists, the launcher says so instead of failing obscurely (`exit 127`).

## What it touches

Reads the client's own stores (the session registry and the per-conversation transcripts) and writes only
its own state under `~/.codely-cli/cross-chat/`. Loopback only — no network exposure, no credentials read
or stored.

## Docs

| File | What |
| --- | --- |
| `SKILL.md` | the agent-facing contract (this is what the client loads) |
| `references/cross-chat-cli.md` | every command, flag, environment variable and failure mode |
| `references/delivery-contract.md` | the delivery rules that the tool enforces |
| `docs/HUB-PROTOCOL.md` | the client's local API: reverse engineered and measured |
| `docs/DELIVERY-MECHANISM.md` | why the delivery rules are what they are (failure → rule) |
| `docs/ROLE-BOUNDARIES.md` | why the role/ownership rules are what they are |


## Companion skill

`cross-session-delivery` provides the delivery CLI and the delivery contract:
```bash
codely skills install https://github.com/yuanman1009/cowork-skills --path cowork/cross-session-delivery
```

## License

MIT — see [LICENSE](LICENSE).
