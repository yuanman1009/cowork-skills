# cowork/

Skills in this directory are **Tuanjie Cowork / Codely only**.

They do not work from a plain terminal session or another agent host, because they use capabilities of
that specific desktop client:

| Capability | Why it pins the skill here |
| --- | --- |
| Live delivery | sends to the client's own loopback hub (`127.0.0.1`), including another conversation's running turn |
| Session discovery | reads the client's own session registry and per-conversation transcripts to find and address peers |
| Offline delivery | resumes the peer through the client's own CLI (from the client's bundled runtime) |
| Role addressing | keeps its role table in the client's user state directory (`~/.codely-cli/cross-chat/`) |

Nothing in this directory is a general-purpose library: product-neutral tooling belongs outside
`cowork/`. Install commands are in the repository [README](../README.md).
