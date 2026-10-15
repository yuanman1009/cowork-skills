# cowork-skills

Agent skills that make several conversations of the **Tuanjie Cowork / Codely desktop client** work as one
team: hand a task to another conversation and get an answer back, and run a multi-role game-production
team with an ownership whitelist, a task board and ledgers.

Every skill here lives under [`cowork/`](cowork) — that directory means **this client only**.
The skills drive the client's own local hub (its session registry, its conversation transcripts, its
delivery queue), so they are not portable to a plain terminal session or another agent host. The bundled
`cross-chat` CLI is self-contained: the launcher locates a Node runtime itself, so there is nothing
else to install.

## Skills

| Skill | What it does |
| --- | --- |
| [`cross-session-delivery`](cowork/cross-session-delivery) | Hand work to another conversation of the same Codely / Tuanjie Cowork client. |
| [`game-project-management`](cowork/game-project-management) | Run a multi-role game-production team as the project-management side. |

## Install

Each skill lives in a sub-directory, so the install command names it with `--path`:

```bash
codely skills install https://github.com/yuanman1009/cowork-skills --path cowork/cross-session-delivery
codely skills install https://github.com/yuanman1009/cowork-skills --path cowork/game-project-management
```

Then run `/skills reload` in the session to pick it up. Installing the skill installs the bundled
`cross-chat` CLI with it — no npm, no global install, no `PATH` entry.

## Layout

```
cowork/<skill name>/     one self-contained skill: SKILL.md, references/, assets/,
                              the cross-chat CLI (bin/ + src/), its launchers and docs/
```

## License

MIT — see [LICENSE](LICENSE). Each skill directory carries its own copy.
