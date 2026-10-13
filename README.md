# claude-task-deck

Claude Code が動かしている道具（コマンド・読む・探す・書き換える…）を、窓の並びとして映す小さな画面です。
もう一枚のモニターに出しておくと、いま何をしているかが一目で分かります。

A small dashboard that shows what Claude Code is doing right now — each tool call opens as a window (RUN → DONE / FAILED), with a "thinking" pane while a turn is in progress.

- Claude Code が手元に書く会話の記録（`~/.claude/projects/**/*.jsonl`）を**読むだけ**です。何も書き換えず、外へも送りません。
- いちばん新しく動いている会話を自動で追います。
- 依存パッケージなし（Node.js だけ）。

## 使い方（Docker）

```
git clone https://github.com/mati0516/claude-task-deck
cd claude-task-deck
docker compose up -d --build
```

ブラウザで <http://localhost:8787> を開きます。

- Windows では `%USERPROFILE%\.claude\projects`、macOS / Linux では `~/.claude/projects` を読みます。
- 記録の場所が違う時は、環境変数 `CLAUDE_PROJECTS` で指します。ポートは `DECK_PORT` で変えられます。

```
# PowerShell
$env:CLAUDE_PROJECTS = "D:\somewhere\.claude\projects"; docker compose up -d --build
```

止める時は `docker compose down`。

## 使い方（Node.js だけ）

```
node server.js
```

| 環境変数 | 既定 | 意味 |
|---|---|---|
| `DATA_DIR` | `~/.claude/projects` | 会話の記録の置き場 |
| `PORT` | `8787` | 待ち受けるポート |
| `HOST` | `127.0.0.1` | 待ち受けるアドレス |

## 画面

- 上端の `DARK / LIGHT`：明暗の切り替え（`?theme=light` でも指定できます）
- `SOUND`：効果音（既定は切）
- `DEMO`：見本の窓を回し続けます（Claude Code が動いていなくても見た目を確かめられます）

## 映るもの・映らないもの

- 映る：そのマシンの中で動いている Claude Code（CLI、および手元のフォルダを開いて動かす形）の会話。
- 映らない：手元に記録が残らないもの（ブラウザの普通のチャット、クラウド側で走る会話）。
- 画面には、道具の名前と、その引数の頭 160 字（コマンドやファイルの道）が出ます。人に見せる画面に出す時はご注意ください。
- 既定では自分のマシンの中（127.0.0.1）からしか開けません。

## License

MIT
