/** 헝크 편집기, 인스펙터, 디프 시트, 충돌 패널의 문자열. */
export const editing: Record<string, string> = {
  // Inspector — 체크한 파일에 대한 세 번째 동사
  "Discard changes to {count} files": "파일 {count}개의 변경 버리기",
  "Put the checked files back the way the parent has them (jj restore). One ⌘Z takes it back.":
    "체크한 파일을 부모가 가진 모습으로 되돌립니다 (jj restore). ⌘Z 한 번이면 되돌아옵니다.",

  // Inspector — 체인지 진화 이력 (jj evolog)
  "HOW THIS CHANGE EVOLVED": "이 체인지가 걸어온 길",
  "Reading the change's history…": "체인지 이력을 읽는 중…",
  "This change has only ever been itself.": "이 체인지는 늘 지금 모습이었습니다.",

  // HunkSheet — 헝크 편집 시트
  "Split {change} into two changes": "{change}를 두 체인지로 분리",
  "Squash part of {change} into its parent": "{change}의 일부를 부모에 스쿼시",
  "Checked hunks stay in the first change. Everything else moves to a new change on top. Nothing is staged; both are real commits when you finish.":
    "체크한 헝크는 첫 체인지에 남습니다. 나머지는 위의 새 체인지로 옮겨갑니다. 스테이징은 없습니다. 끝내고 나면 둘 다 진짜 커밋입니다.",
  "Checked hunks move into the parent commit. Everything else stays where it is. The parent keeps its own description.":
    "체크한 헝크는 부모 커밋으로 들어갑니다. 나머지는 그 자리에 남습니다. 부모는 자기 설명을 그대로 씁니다.",
  "First change": "첫 체인지",
  "New change on top": "위의 새 체인지",
  Split: "분리",
  "Moves into parent": "부모로 들어감",
  "Stays here": "여기 남음",
  Squash: "스쿼시",
  binary: "바이너리",
  "new file": "새 파일",
  deleted: "삭제됨",
  "Describe the first change… (optional)": "첫 체인지 설명… (선택)",
  HUNKS: "헝크",
  toggle: "토글",
  all: "전체",
  "Reading the diff…": "디프 읽는 중…",
  "This revision changes nothing.": "이 리비전은 아무것도 바꾸지 않습니다.",
  "Select a hunk.": "헝크를 고르세요.",
  "Cannot edit by hunk — {problem}": "헝크 단위로 편집할 수 없습니다 — {problem}",
  "Runs {command} · undo with": "{command} 실행 · 되돌리기는",
  Cancel: "취소",
  "Check at least one hunk": "헝크를 최소 하나는 체크해야 합니다",
  "Leave at least one hunk behind": "헝크를 최소 하나는 남겨야 합니다",
  "Working…": "처리 중…",
  "1 hunk": "헝크 1개",
  "{count} hunks": "헝크 {count}개",
  checked: "체크됨",
  unchecked: "체크 안 됨",
  "Binary file — it can only be taken or left whole.":
    "바이너리 파일 — 통째로 가져가거나 통째로 남기거나 둘 중 하나입니다.",

  // Inspector — 인스펙터
  "Describe this change…": "이 체인지 설명…",
  "Saving…": "저장 중…",
  Unsaved: "저장 안 됨",
  "Select a revision.": "리비전을 고르세요.",
  "The window is parked on a past operation. Return to now to make changes.":
    "창이 지난 오퍼레이션에 멈춰 있습니다. 바꾸려면 현재로 돌아와야 합니다.",
  "This revision is immutable.": "이 리비전은 바꿀 수 없습니다.",
  "@ working copy": "@ 작업 사본",
  conflict: "충돌",
  "(no description set)": "(설명 없음)",
  "Parent ": "부모 ",
  "Parents ": "부모 ",
  "NEXT STEPS": "다음 단계",
  "Start new change on top": "위에 새 체인지 시작",
  "Merge with {count} marked": "표시한 {count}개와 머지",
  "⌘-click another revision to merge with it.": "다른 리비전을 ⌘-클릭하면 머지할 수 있습니다.",
  "Split into two changes": "두 체인지로 분리",
  "Nothing to split": "분리할 게 없습니다",
  "Squash hunks into parent": "헝크를 부모에 스쿼시",
  "A merge has no single parent to squash into":
    "머지는 스쿼시해 넣을 부모가 하나로 정해지지 않습니다",
  "Nothing to squash": "스쿼시할 게 없습니다",
  "Absorb into ancestors": "조상으로 absorb",
  "Nothing to absorb": "absorb할 게 없습니다",
  "Move each edit into the mutable ancestor that last touched those lines (jj absorb). One ⌘Z takes it back.":
    "각 수정을 그 줄을 마지막으로 건드린 변경 가능한 조상으로 옮깁니다 (jj absorb). ⌘Z 한 번이면 되돌아옵니다.",
  "Edit this change": "이 체인지 편집",
  "Abandon this change": "이 체인지 버리기",
  "Show every revision that touched {path}": "{path}을(를) 건드린 리비전 전부 보기",
  "{count} FILES CHANGED": "변경된 파일 {count}개",
  "FILES CHANGED": "변경된 파일",
  "No file changes.": "바뀐 파일이 없습니다.",
  "Check files to squash or split them whole": "파일을 통째로 스쿼시하거나 분리하려면 체크하세요",
  "Squash {count} files into the parent": "파일 {count}개를 부모에 스쿼시",
  "The parent is immutable.": "부모는 바꿀 수 없습니다.",
  "Move the checked files whole into the parent change (jj squash). One ⌘Z takes it back.":
    "체크한 파일을 통째로 부모 체인지로 옮깁니다 (jj squash). ⌘Z 한 번이면 되돌아옵니다.",
  "Split {count} files into a new change": "파일 {count}개를 새 체인지로 분리",
  "Leave at least one file behind": "파일을 최소 하나는 남겨야 합니다",
  "Move the checked files whole into a new change below this one (jj split). This change keeps its description.":
    "체크한 파일을 통째로 이 아래의 새 체인지로 옮깁니다 (jj split). 이 체인지는 자기 설명을 그대로 씁니다.",
  "Loading diff…": "디프 불러오는 중…",
  "click for the diff": "클릭하면 디프",

  // DiffSheet — 디프 시트
  "File diff": "파일 디프",
  "Binary file — no text diff to show.":
    "바이너리 파일 — 보여줄 텍스트 디프가 없습니다.",
  "No lines changed in this file.": "이 파일에서 바뀐 줄이 없습니다.",
  "Side by side": "좌우 비교",
  Unified: "한 열로",
  "Show the old and new versions in two columns": "옛 버전과 새 버전을 두 열로 봅니다",
  "Show jj's own one-column diff": "jj가 낸 그대로 한 열로 봅니다",
  Blame: "블레임",
  "Show which change last touched each line (jj file annotate)":
    "각 줄을 마지막으로 건드린 체인지를 봅니다 (jj file annotate)",
  "A removed file has no lines to annotate": "지워진 파일에는 주석을 달 줄이 없습니다",
  "Loading blame…": "블레임 불러오는 중…",
  "Expand hidden lines": "숨은 줄 펼치기",
  "Read the diff again with 25 lines of context": "앞뒤 25줄까지 붙여 디프를 다시 읽습니다",
  "Show whole file": "파일 전체 보기",
  "Read the diff again with the whole file as context":
    "파일 전체를 붙여 디프를 다시 읽습니다",
  "Collapse context": "다시 접기",
  "Back to jj's three lines of context": "jj 기본값인 앞뒤 3줄로 돌아갑니다",

  // Conflicts — 충돌 패널
  "1 CONFLICTED FILE": "충돌 파일 1개",
  "{count} CONFLICTED FILES": "충돌 파일 {count}개",
  CONFLICTS: "충돌",
  "Nothing is blocked. Resolve now or later — descendants pick it up automatically.":
    "막힌 건 없습니다. 지금 풀어도 되고 나중에 풀어도 됩니다 — 자손은 알아서 따라옵니다.",
  "Reading conflicts…": "충돌 읽는 중…",
  "Keep the first side (jj's :ours)": "첫 번째 쪽을 남깁니다 (jj의 :ours)",
  "Take ours": "ours 선택",
  "Keep the second side (jj's :theirs)": "두 번째 쪽을 남깁니다 (jj의 :theirs)",
  "Take theirs": "theirs 선택",
  "Edit the conflict markers by hunk instead": "대신 충돌 표시를 헝크 단위로 편집합니다",
  "Edit by hunk": "헝크 단위로 편집",
  "1 conflict": "충돌 1개",
  "{count} conflicts": "충돌 {count}개",
};
