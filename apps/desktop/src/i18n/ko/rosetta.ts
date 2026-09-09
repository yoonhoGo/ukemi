/** The ⌘G Git-to-jj sheet: step labels, the "why it differs" prose, and the panel's own chrome. */
export const rosetta: Record<string, string> = {
  // The panel itself.
  "Look up a git command": "git 명령 찾아보기",
  "Type the git command you were reaching for": "손이 가던 git 명령을 입력",
  "Git command": "git 명령",
  "ASKED MOST": "많이 찾는 것",
  "{count} match": "{count}개 일치",
  "{count} matches": "{count}개 일치",
  "Nothing here matches that. The command may already work the same way — or it may be one jj has no answer for, which is worth knowing too.":
    "여기 맞는 게 없습니다. 그 명령은 이미 똑같이 동작할 수도 있고, jj가 답을 갖지 않는 명령일 수도 있습니다. 그것도 알아둘 만한 일입니다.",
  "No key for it; the command is the answer.": "단축키는 없습니다. 명령 자체가 답입니다.",
  "Ukemi never hides the command it ran — {key} lists every one this window has run, in order.":
    "Ukemi는 실행한 명령을 감추지 않습니다 — 이 창이 실행한 명령을 {key}가 순서대로 늘어놓습니다.",
  "IN THIS WINDOW": "이 창에서",
  "WHAT ACTUALLY RUNS": "실제로 실행되는 것",
  "WHY IT DIFFERS": "왜 다른가",
  "Copy the commands": "명령 복사",
  Copied: "복사함",
  "Whatever you run, {key} takes it back.": "무엇을 실행했든 {key}가 도로 물립니다.",

  // Steps: what to press in this window.
  "Type the description in the inspector": "인스펙터에 설명 쓰기",
  "Start the next change on top": "위에 다음 체인지 시작",
  "Edit the description in the inspector": "인스펙터에서 설명 고치기",
  "Split a change by hunk": "헝크 단위로 체인지 분리",
  "Squash hunks into the parent": "헝크를 부모에 스쿼시",
  "Read the top row — it is @": "맨 윗줄 읽기 — 그게 @입니다",
  "Focus the revset field": "리브셋 입력란으로",
  "Start a new change on top": "위에 새 체인지 시작",
  "Edit the selected change": "선택한 체인지 편집",
  "Drag a row onto its new parent": "행을 새 부모 위로 끌어다 놓기",
  "Absorb into whatever last touched each line": "각 줄을 마지막으로 건드린 체인지에 absorb",
  "Undo the last operation": "마지막 오퍼레이션 되돌리기",
  "Move the operation playhead": "오퍼레이션 플레이헤드 옮기기",
  "Restore to the parked operation": "세워둔 오퍼레이션으로 복원",
  "Push the stack": "스택 푸시",
  Fetch: "페치",
  "Select both parents, then start a change": "부모 둘을 고르고 체인지 시작",
  "Workspace board": "워크스페이스 보드",
  "Abandon the selected change": "선택한 체인지 버리기",

  // Why it differs: one paragraph per row, and the reason this app exists.
  "-a has nothing to do here: every file you saved is already in @. And describing a change does not close it — jj new is what moves you off it, which is why this is two steps and git commit was one.":
    "여기서 -a가 할 일은 없습니다. 저장한 파일은 이미 전부 @에 들어 있습니다. 설명을 붙여도 체인지가 닫히지는 않습니다 — 거기서 빠져나오게 하는 건 jj new입니다. git commit이 한 단계였던 일이 여기서 두 단계인 까닭입니다.",
  "There is no amend because nothing was sealed. The change keeps its change ID through every edit, so this is not a rewrite that orphans anything.":
    "봉해진 것이 없으니 amend도 없습니다. 체인지는 몇 번을 고치든 체인지 ID를 그대로 지킵니다. 무언가를 떼어내 버리는 재작성이 아닙니다.",
  "There is no index to add to. The change already contains everything, so choosing what goes where happens afterwards instead of before — and it can be redone as often as you like.":
    "add할 인덱스가 없습니다. 체인지가 이미 전부 담고 있으니, 무엇을 어디에 둘지는 미리가 아니라 나중에 고릅니다. 몇 번이고 다시 고를 수 있습니다.",
  "The working copy is the first row of the graph, and the inspector beside it is its diff. Nothing is staged or unstaged, so there are no two lists to compare.":
    "작업 사본은 그래프의 첫 줄이고, 그 옆 인스펙터가 그 디프입니다. 스테이징된 것도 안 된 것도 없으니 견줘볼 목록이 둘로 갈리지 않습니다.",
  "The window is the log. Revsets replace log's flags: one query language for the graph, the sidebar's saved views and every read the app makes.":
    "이 창이 곧 로그입니다. 리브셋이 log의 플래그를 대신합니다. 그래프도, 사이드바에 저장해둔 보기도, 앱이 읽어오는 모든 것도 질의 언어 하나로 다룹니다.",
  "New work needs no name — nothing is checked out and there is no current branch. Set a bookmark only if you want the name now; pushing a stack mints one for you either way.":
    "새 작업에 이름은 필요 없습니다 — 체크아웃된 것도 없고 현재 브랜치라는 것도 없습니다. 지금 이름을 붙이고 싶을 때만 북마크를 지정하면 됩니다. 스택을 푸시하면 어차피 하나 만들어줍니다.",
  "No detached-HEAD warning, because @ moving is the normal case and not a state you can get stranded in. Your uncommitted work is not left behind: it is in the change you were on.":
    "detached HEAD 경고는 없습니다. @가 움직이는 건 정상이고, 거기 갇힐 일도 없습니다. 커밋하지 않은 작업이 뒤에 남겨지지도 않습니다. 방금까지 있던 체인지 안에 그대로 있습니다.",
  "There is no stash stack to lose things in. Park the mess in a change of its own and walk away; coming back is ⌘E on that row.":
    "물건을 잃어버릴 stash 스택이 없습니다. 어질러진 작업은 체인지 하나에 세워두고 그냥 떠나면 됩니다. 돌아올 때는 그 줄에서 ⌘E입니다.",
  "There is no todo list because there is no sequence to step through: a rebase either happens or it does not, and a conflict is recorded rather than stopping it halfway.":
    "밟아나갈 순서가 없으니 todo 목록도 없습니다. 리베이스는 되거나 안 되거나 둘 중 하나고, 충돌은 중간에 멈춰 세우는 대신 그대로 기록됩니다.",
  "Nothing is mid-flight to abort — the rebase finished and the conflict is data inside the commit. Undo reverses the whole operation if you would rather not have it.":
    "중간에 떠 있는 게 없으니 abort할 것도 없습니다 — 리베이스는 이미 끝났고 충돌은 커밋 안에 든 데이터입니다. 그 결과가 마음에 들지 않으면 되돌리기가 오퍼레이션 전체를 뒤집습니다.",
  "Undo reverses the last operation, not your files. To throw away edits to specific files instead, jj restore takes them back from the parent — and ⌘Z takes even that back.":
    "되돌리기가 뒤집는 건 파일이 아니라 마지막 오퍼레이션입니다. 특정 파일의 수정만 버리려면 jj restore가 부모에서 그 파일을 도로 가져옵니다. 그것마저 ⌘Z로 되돌릴 수 있습니다.",
  "The operation log records repository states, not ref movements, so restoring one puts everything back at once instead of you replaying each ref by hand.":
    "오퍼레이션 로그는 ref의 이동이 아니라 저장소의 상태를 적습니다. 그래서 하나를 복원하면 ref를 하나씩 손으로 되짚을 것 없이 전부 한 번에 제자리로 갑니다.",
  "There is no force to argue about: --change mints the bookmark on the first push and moves it after a rebase, so the same button covers create and update.":
    "force를 두고 실랑이할 일이 없습니다. --change가 첫 푸시에 북마크를 만들고 리베이스 뒤에는 그 북마크를 옮깁니다. 만들기와 갱신을 같은 버튼이 덮습니다.",
  "Fetch does not merge or rebase anything into your work — it only moves the remote bookmarks. Rebasing your stack onto the new trunk is a separate, visible step: ⌥ drag it.":
    "페치는 무엇도 작업에 머지하거나 리베이스하지 않습니다 — 리모트 북마크만 옮깁니다. 스택을 새 trunk 위로 리베이스하는 건 눈에 보이는 별개의 단계입니다. ⌥로 끌어다 놓으면 됩니다.",
  "A merge is just a change with two parents, so you make one by starting a change on both instead of running a separate verb from one of them.":
    "머지는 부모가 둘인 체인지일 뿐입니다. 한쪽에서 별도의 명령을 부르는 대신 양쪽 위에서 체인지를 시작하면 그게 머지입니다.",
  "The copy is a new change with its own change ID, so the original and the copy stay distinguishable in the graph rather than being two commits that merely look alike.":
    "복사본은 제 체인지 ID를 가진 새 체인지입니다. 그래서 원본과 복사본은 그저 닮아 보이는 커밋 둘이 아니라, 그래프에서 끝까지 구분됩니다.",
  "Reverting makes a new change that undoes the old one, exactly as in Git. Do not reach for ⌘Z here: that would undo your last operation, not the commit.":
    "revert는 Git에서와 똑같이 이전 것을 무르는 새 체인지를 만듭니다. 여기서 ⌘Z로 손이 가면 안 됩니다. 그건 커밋이 아니라 마지막 오퍼레이션을 되돌립니다.",
  "Workspaces share one operation log, so a second working copy — or an agent running in one — shows up on the same timeline instead of being a repo you have to remember about.":
    "워크스페이스는 오퍼레이션 로그 하나를 함께 씁니다. 그래서 두 번째 작업 사본도, 그 안에서 도는 에이전트도, 따로 기억해둬야 할 저장소가 아니라 같은 타임라인에 나타납니다.",
  "Discarding is undoable here, which it never was in Git: restore rewrites the files and abandon drops the change, and ⌘Z brings either one back.":
    "여기서는 버리는 것도 되돌릴 수 있습니다. Git에서는 한 번도 그러지 못했습니다. restore는 파일을 되돌려 쓰고 abandon은 체인지를 떨굽니다. 어느 쪽이든 ⌘Z가 도로 가져옵니다.",
};
