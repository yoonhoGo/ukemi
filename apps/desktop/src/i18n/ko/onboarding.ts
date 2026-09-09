/** 첫 실행 카드, 코치 버블, 진행 패널 — Git에서 넘어오는 길에 읽는 문장들. */
export const onboarding: Record<string, string> = {
  // ---- 코치 버블 ----------------------------------------------------------
  "hint {done} of {total}": "힌트 {done}/{total}",
  "Got it": "알겠다",
  "Look up a git command": "git 명령 찾아보기",

  // ---- 사이드바 전환 스트립 -----------------------------------------------
  "FROM GIT": "GIT에서 넘어오기",
  "{done} of {total}": "{done}/{total}",
  "Moving from Git — seven habits and where each one went":
    "Git에서 넘어오기 — 습관 일곱 가지와 각각이 간 자리",

  // ---- 진행 패널 ----------------------------------------------------------
  "Moving from Git": "Git에서 넘어오기",
  "Seven habits Git gave you, and where each one went. A row ticks when you have actually done it once — not when you have read about it.":
    "Git이 들인 습관 일곱 가지, 그리고 각각이 간 자리다. 직접 한 번 해봐야 줄에 체크가 들어온다. 읽어본 것만으로는 안 된다.",
  "instead of {command}": "{command} 대신",
  next: "다음",
  "Coach hints": "코치 힌트",
  "Retire on their own once all seven are behind you.":
    "일곱 가지를 다 지나면 알아서 물러난다.",
  "{shortcut} stays either way.": "{shortcut}는 어느 쪽이든 그대로다.",

  // ---- 마일스톤: 라벨 -----------------------------------------------------
  "The working copy is a commit": "작업 사본이 곧 커밋이다",
  "A description stays editable": "설명은 계속 고칠 수 있다",
  "Undo is one operation back": "되돌리기는 오퍼레이션 하나 뒤다",
  "Bookmarks, not branches": "브랜치가 아니라 북마크다",
  "Split and squash by hunk": "헝크 단위로 분리하고 스쿼시한다",
  "A conflict does not stop you": "충돌이 발목을 잡지 않는다",
  "Workspaces run side by side": "워크스페이스는 나란히 돌아간다",

  // ---- 마일스톤: 힌트 -----------------------------------------------------
  "This is where git commit went.": "여기가 git commit이 간 자리다.",
  "⌘N closes the change you were in and opens a fresh one on top. There was nothing to stage first: every file you had saved was already in it.":
    "⌘N은 지금 있던 체인지를 닫고 그 위에 새 체인지를 연다. 먼저 스테이징할 것은 없었다. 저장해 둔 파일은 이미 그 안에 있었다.",

  "No --amend, because nothing was sealed.": "--amend가 없다. 봉인된 적이 없으니까.",
  "A description is a property of the change, editable for as long as the change is yours — including after you have pushed it. Rewriting is the normal case here, not the dangerous one.":
    "설명은 체인지의 속성이다. 그 체인지가 내 것인 동안은 언제든 고칠 수 있다. 푸시한 뒤에도 마찬가지다. 여기서 고쳐 쓰는 일은 위험한 축이 아니라 평범한 축이다.",

  "That was the reflog, and it is a timeline.": "그게 reflog였고, 여기서는 타임라인이다.",
  "Every command that touched the repository is one row down there — rebases and merges included. Drag the playhead to read any past state; nothing is written until you restore.":
    "저장소를 건드린 명령은 전부 아래에 한 줄씩 남는다. 리베이스도 머지도 마찬가지다. 플레이헤드를 끌면 과거의 어느 상태든 읽어볼 수 있다. 복원하기 전까지는 아무것도 쓰이지 않는다.",

  "The name arrived at push time.": "이름은 푸시할 때 붙었다.",
  "Nothing was checked out and no branch was created: a bookmark is a name left on a commit. Pushing a stack mints the names and moves them again after a rebase, so there is no force push to argue about.":
    "체크아웃한 것도, 브랜치를 만든 것도 아니다. 북마크는 커밋에 남겨 둔 이름일 뿐이다. 스택을 푸시하면 이름이 만들어지고, 리베이스 뒤에는 알아서 따라 움직인다. force push를 놓고 다툴 일이 없다.",

  "This is git add -p, after the fact.": "이게 git add -p다. 다만 일이 끝난 뒤에 한다.",
  "Because the change already exists, choosing what goes where is something you do afterwards rather than before. One change becomes two, or two become one, with the same sheet.":
    "체인지가 이미 있으니, 무엇을 어디에 넣을지는 미리가 아니라 나중에 고른다. 같은 시트에서 체인지 하나가 둘이 되고, 둘이 하나가 된다.",

  "Nothing is blocked. There is nothing to abort.": "막힌 것이 없다. abort할 것도 없다.",
  "The conflict is recorded in the commit, so the rebase finished and the rest of your stack moved with it. Resolve it now, or leave it and come back — either way the repository is not holding its breath.":
    "충돌은 커밋에 기록된다. 그래서 리베이스는 끝났고 스택의 나머지도 같이 옮겨졌다. 지금 풀어도 되고, 두었다가 나중에 와도 된다. 어느 쪽이든 저장소가 숨을 참고 기다리지는 않는다.",

  "Worktrees, without the bookkeeping.": "worktree인데, 장부 관리가 없다.",
  "Each workspace has its own working copy and its own @ over one shared history, so a second one — or an agent — can work while you do. The board is the same data by workspace.":
    "워크스페이스마다 자기 작업 사본과 자기 @를 갖고, 히스토리 하나를 함께 쓴다. 그래서 두 번째 워크스페이스가, 또는 에이전트가, 내가 일하는 동안 같이 일할 수 있다. 보드는 같은 데이터를 워크스페이스별로 늘어놓은 것이다.",

  // ---- 첫 실행 화면 -------------------------------------------------------
  "Three things differ. Then you are on your own.":
    "다른 것은 세 가지다. 그다음부터는 알아서 하면 된다.",
  "Everything else, {shortcut} answers when you ask it.":
    "나머지는 물어보면 {shortcut}가 답한다.",

  STAGING: "스테이징",
  "There is no index.": "인덱스가 없다.",
  "The working copy is already a commit. Saving a file changes it — so there is nothing to stage, and nothing to forget to stage.":
    "작업 사본이 이미 커밋이다. 파일을 저장하면 그 커밋이 바뀐다. 그러니 스테이징할 것도, 스테이징을 깜빡할 것도 없다.",
  "When one change should have been two, split it after the fact:":
    "체인지 하나가 둘이었어야 했다면, 나중에 나누면 된다:",
  "Split a change by hunk": "헝크 단위로 체인지 분리",

  BRANCHES: "브랜치",
  "Nothing is checked out.": "체크아웃된 것이 없다.",
  "@ is wherever you are working; a bookmark is a name you leave on a commit. It does not follow you, and a stack of changes needs none until you push.":
    "@는 지금 작업하는 자리고, 북마크는 커밋에 남겨 둔 이름이다. 북마크는 나를 따라다니지 않는다. 체인지 스택도 푸시하기 전까지는 이름이 필요 없다.",
  "Pushing a stack mints the names and moves them for you:":
    "스택을 푸시하면 이름이 만들어지고 알아서 옮겨진다:",
  "Push the stack": "스택 푸시",

  "GETTING OUT OF TROUBLE": "곤경에서 빠져나오기",
  "Undo is a verb here.": "여기서 되돌리기는 동사다.",
  "Every command that touched the repository is one row on the strip along the bottom of the window. Drag the playhead to read any past state; nothing is written until you restore.":
    "저장소를 건드린 명령은 전부 창 아래쪽 띠에 한 줄씩 남는다. 플레이헤드를 끌면 과거의 어느 상태든 읽어볼 수 있다. 복원하기 전까지는 아무것도 쓰이지 않는다.",
  "A rebase, a squash, a bad merge — all one key:":
    "리베이스도, 스쿼시도, 잘못된 머지도 전부 키 하나면 된다:",
  "Undo the last operation": "마지막 오퍼레이션 되돌리기",

  "Anything you do in this window is one {shortcut} away. That is deliberate — you are meant to be able to make a mess.":
    "이 창에서 한 일은 무엇이든 {shortcut} 한 번 거리에 있다. 일부러 그렇게 만들었다. 마음껏 어질러도 된다.",
  "Open {name}": "{name} 열기",
  "Or look any of it up again later with {shortcut}":
    "아니면 나중에 {shortcut}로 다시 찾아봐도 된다",
};
