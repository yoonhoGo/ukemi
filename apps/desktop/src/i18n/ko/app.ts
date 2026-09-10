/** The window frame: repository picker, graph chrome, status bar, pickers. */
export const app: Record<string, string> = {
  // App.tsx — the window
  "Viewing a past operation — the repository is untouched.":
    "지난 오퍼레이션을 보는 중입니다 — 저장소는 그대로입니다.",
  "Back to now": "지금으로",
  Dismiss: "닫기",
  Change: "체인지",
  Description: "설명",
  Bookmarks: "북마크",
  When: "시각",
  "Reading the repository…": "저장소를 읽는 중…",
  "No revisions match {revset}.": "{revset}에 해당하는 리비전이 없습니다.",
  "1 revision": "리비전 1개",
  "{count} revisions": "리비전 {count}개",
  "newest only; narrow the revset for more": "최신 것만; 더 보려면 리브셋을 좁히세요",
  "1 conflict": "충돌 1개",
  "{count} conflicts": "충돌 {count}개",
  "drag = rebase": "드래그 = 리베이스",
  "Copy this command (⌘⌥C). Double-click for every command (⌘J).":
    "이 명령 복사 (⌘⌥C). 더블클릭하면 전체 명령 (⌘J).",
  copied: "복사함",

  // main.tsx — opening a repository
  "A desktop window on Jujutsu": "Jujutsu를 여는 데스크톱 창",
  "Open a jj repository — or a Git one, and jj can go alongside it.":
    "jj 저장소를 여세요. Git 저장소라면 그 옆에 jj를 놓을 수 있습니다.",
  "git only": "git뿐",
  // The branch name lands at the end so no Korean particle has to agree with it.
  "A Git repository with no jj in it — {branch} is checked out.":
    "jj가 없는 Git 저장소입니다. 체크아웃된 브랜치는 {branch}.",
  "A Git repository with no jj in it — on a detached HEAD.":
    "jj가 없는 Git 저장소입니다. HEAD는 분리된 상태.",
  "Anything you have not committed becomes the working-copy change; nothing is lost.":
    "커밋하지 않은 것은 전부 작업 사본 체인지가 됩니다. 잃는 건 없습니다.",
  "Adding jj…": "jj 얹는 중…",
  "Add jj alongside Git": "Git 옆에 jj 얹기",
  "Choose another folder…": "다른 폴더 고르기…",
  "WHAT CHANGES, AND WHAT DOES NOT": "무엇이 바뀌고, 무엇이 그대로인가",
  new: "새로 생김",
  untouched: "그대로",
  reversible: "되돌릴 수 있음",
  "The operation log and this window’s working copy live here.":
    "오퍼레이션 로그와 이 창의 작업 사본이 여기 들어갑니다.",
  "No commit is rewritten. Branches, tags and remotes stay as they are.":
    "커밋을 다시 쓰지 않습니다. 브랜치도 태그도 리모트도 그대로입니다.",
  "git, your IDE": "git, 그리고 IDE",
  "Both tools read the same commits. Keep a terminal open beside this window.":
    "두 도구가 같은 커밋을 읽습니다. 이 창 옆에 터미널을 열어둔 채로 써도 됩니다.",
  "Deletes the jj side and leaves the Git repository you started with.":
    "jj 쪽만 지웁니다. 처음의 Git 저장소가 그대로 남습니다.",
  RUNS: "실행",
  "Choose folder…": "폴더 고르기…",
  "{path} is not inside a jj or Git repository.":
    "jj 저장소도 Git 저장소도 아닙니다: {path}",

  // repo.tsx, jj.ts
  "No GitHub remote, or gh is not available.": "GitHub 리모트가 없거나, gh를 쓸 수 없습니다.",
  "Open repository": "저장소 열기",

  // time.ts — deliberately terse; these sit in a narrow right-aligned column
  now: "지금",
  "{count}m": "{count}분",
  "{count}h": "{count}시간",
  yesterday: "어제",
  "{count}d": "{count}일",

  // Settings sheet — theme and language pickers
  Settings: "설정",
  Theme: "테마",
  System: "시스템",
  "Ink & Paper": "잉크와 종이",
  "macOS standard. The contract's own defaults, with no overrides.":
    "macOS 표준. 계약이 정한 기본값 그대로, 덮어쓴 데가 없습니다.",
  "Acid Terminal": "애시드 터미널",
  "Near-black, acid lime, hard rules, mono throughout. The dark one.":
    "근검정과 애시드 라임, 딱딱한 선, 전부 고정폭. 다크 테마입니다.",
  "Aurora Glass": "오로라 글래스",
  "Indigo to plum, frosted chrome, glowing lanes. Dark, and flat where you read.":
    "인디고에서 자두색으로, 서리 낀 크롬과 빛나는 레인. 다크지만 읽는 곳은 평평합니다.",
  "Candy Bento": "캔디 벤토",
  "White cards on lilac grey, fat lanes, one purple.":
    "라일락 회색 위 흰 카드, 두툼한 레인, 보라 하나.",
  "Warm paper, ink rules, one vermilion. Serif descriptions.":
    "따뜻한 종이, 잉크 괘선, 주홍 하나. 설명은 세리프체.",
  Language: "언어",
  Fonts: "글꼴",
  Interface: "인터페이스",
  Code: "코드",
  "Theme default": "테마 기본값",
};
