/** 헝크 편집기, 인스펙터, 디프 시트, 충돌 패널의 문자열. */
export const editing: Record<string, string> = {
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
  "{count} FILES CHANGED": "변경된 파일 {count}개",
  "FILES CHANGED": "변경된 파일",
  "No file changes.": "바뀐 파일이 없습니다.",
  "Loading diff…": "디프 불러오는 중…",
  "click for the diff": "클릭하면 디프",

  // DiffSheet — 디프 시트
  "File diff": "파일 디프",
  "Binary file — no text diff to show.":
    "바이너리 파일 — 보여줄 텍스트 디프가 없습니다.",
  "No lines changed in this file.": "이 파일에서 바뀐 줄이 없습니다.",

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
