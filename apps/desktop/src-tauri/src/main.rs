// Prevent a second console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use tauri::Manager;

/// Captured output of one `jj` invocation.
///
/// Mirrors `ExecResult` in `packages/jj-cli-adapter/src/exec.ts`; the TS
/// adapter is the only consumer and it treats a non-zero `code` as a `JjError`.
#[derive(Serialize)]
struct ExecResult {
    stdout: String,
    stderr: String,
    code: i32,
}

/// Locate the `jj` binary to run.
///
/// Prefers the copy bundled beside the app, which is the point of shipping a
/// sidecar: the version the templates were written against, not whatever is on
/// the user's PATH. Falls back to `jj` on PATH so a dev checkout works before
/// any bundling is set up.
fn jj_binary(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .resolve("jj", tauri::path::BaseDirectory::Resource)
        .ok()
        .filter(|path| path.is_file())
        .unwrap_or_else(|| PathBuf::from("jj"))
}

/// Run `jj` in `root` and hand the raw output back to the TS adapter.
///
/// Deliberately dumb: no parsing, no argument building, no knowledge of jj's
/// verbs. All of that lives in `packages/jj-cli-adapter` so it stays testable
/// without a window, which is why this is the whole of the Rust surface.
#[tauri::command]
async fn jj_exec(
    app: tauri::AppHandle,
    root: String,
    args: Vec<String>,
) -> Result<ExecResult, String> {
    run_captured(jj_binary(&app), root, args).await
}

/// Run the user's own `gh` (GitHub CLI) in `root`.
///
/// Not bundled, on purpose: `gh` holds the user's GitHub login, and the app
/// should borrow it rather than own a second one. Same dumb seam as `jj_exec`;
/// the TS forge adapter decides every argument. A missing `gh` surfaces as an
/// error string, which the UI turns into "no forge", not a crash.
#[tauri::command]
async fn gh_exec(root: String, args: Vec<String>) -> Result<ExecResult, String> {
    run_captured(PathBuf::from("gh"), root, args).await
}

async fn run_captured(
    binary: PathBuf,
    root: String,
    args: Vec<String>,
) -> Result<ExecResult, String> {
    let name = binary.display().to_string();
    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new(&binary).args(&args).current_dir(&root).output()
    })
    .await
    .map_err(|error| format!("failed to run {name}: {error}"))?
    .map_err(|error| format!("failed to run {name}: {error}"))?;

    Ok(ExecResult {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        // A signal-killed process has no code; report it as a failure, not a success.
        code: output.status.code().unwrap_or(-1),
    })
}

/// The repository named on the command line, if any.
///
/// `ukemi ~/work/repo` opens that repo instead of the remembered one, which is
/// what makes the app scriptable and what "Open With" on a folder needs.
#[tauri::command]
fn initial_repo() -> Option<String> {
    // argv[0] is the binary; `cargo run -- <path>` and a bundled launch agree
    // on the rest. A leading `-` is a flag, not a path.
    std::env::args()
        .skip(1)
        .find(|argument| !argument.starts_with('-'))
}

/// True when `path` is inside a jj workspace, so the UI can reject a bad pick
/// before it tries to render an empty graph.
#[tauri::command]
async fn is_jj_repo(app: tauri::AppHandle, root: String) -> bool {
    let binary = jj_binary(&app);
    tauri::async_runtime::spawn_blocking(move || {
        Command::new(&binary)
            .args(["--color=never", "--no-pager", "root"])
            .current_dir(&root)
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    })
    .await
    .unwrap_or(false)
}

/// One file's desired content on the kept side of a hunk-level operation.
///
/// Mirrors `PlanFile` in `packages/domain/src/port.ts`.
#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "lowercase")]
enum PlanFile {
    Write { path: String, content: String },
    Delete { path: String },
    Revert { path: String },
}

/// Reject a path that could escape the plan directory.
///
/// The plan comes from the webview, so the paths in it are untrusted input at a
/// trust boundary: without this, a `../` entry would let a plan write anywhere
/// the app can reach. Repository paths are always relative and never traverse
/// upward, so anything else is refused rather than sanitised.
fn safe_relative(path: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(path);
    if candidate.is_absolute() {
        return Err(format!("plan path must be relative: {path}"));
    }
    for component in candidate.components() {
        match component {
            Component::Normal(_) => {}
            _ => return Err(format!("unsafe plan path: {path}")),
        }
    }
    Ok(candidate.to_path_buf())
}

/// Materialise a hunk-selection plan for jj's diff-editor protocol.
///
/// The webview cannot write files, and deliberately is not given a general
/// file-write command: this creates its *own* temp directory and returns the
/// path, so the caller never names a location on disk. The layout and the
/// script are defined by `packages/jj-cli-adapter/src/hunk-plan.ts`, which is
/// the single source for both this and the Node implementation used in tests.
#[tauri::command]
async fn prepare_hunk_plan(script: String, files: Vec<PlanFile>) -> Result<PreparedPlan, String> {
    let dir = tempdir().map_err(|error| format!("could not create plan directory: {error}"))?;
    let script_path = dir.join("apply.sh");
    fs::write(&script_path, script).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .map_err(|error| error.to_string())?;
    }

    let mut deletions: Vec<String> = Vec::new();
    let mut reverts: Vec<String> = Vec::new();
    for file in files {
        match file {
            PlanFile::Delete { path } => {
                safe_relative(&path)?;
                deletions.push(path);
            }
            PlanFile::Revert { path } => {
                safe_relative(&path)?;
                reverts.push(path);
            }
            PlanFile::Write { path, content } => {
                let relative = safe_relative(&path)?;
                let target = dir.join("write").join(relative);
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
                }
                fs::write(&target, content).map_err(|error| error.to_string())?;
            }
        }
    }
    if !deletions.is_empty() {
        fs::write(dir.join("DELETE"), format!("{}\n", deletions.join("\n")))
            .map_err(|error| error.to_string())?;
    }
    if !reverts.is_empty() {
        fs::write(dir.join("REVERT"), format!("{}\n", reverts.join("\n")))
            .map_err(|error| error.to_string())?;
    }

    Ok(PreparedPlan {
        plan_dir: dir.to_string_lossy().into_owned(),
        script_path: script_path.to_string_lossy().into_owned(),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PreparedPlan {
    plan_dir: String,
    script_path: String,
}

/// Remove a plan directory once its jj command has finished.
///
/// A plan holds copies of the user's file contents, so it is not left behind
/// after a split — successful or not. Only a directory this process created
/// under the temp root is accepted, so a stray call cannot delete elsewhere.
#[tauri::command]
async fn discard_hunk_plan(plan_dir: String) -> Result<(), String> {
    let dir = PathBuf::from(&plan_dir);
    let root = std::env::temp_dir();
    let inside = dir.starts_with(&root)
        && dir
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("ukemi-plan-"));
    if !inside {
        return Err(format!("refusing to remove {plan_dir}"));
    }
    fs::remove_dir_all(&dir).map_err(|error| error.to_string())
}

/// A fresh directory under the system temp root, named so `discard_hunk_plan`
/// can recognise it as ours.
fn tempdir() -> std::io::Result<PathBuf> {
    let base = std::env::temp_dir();
    for attempt in 0..64 {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let candidate = base.join(format!("ukemi-plan-{nanos:x}-{attempt}"));
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::AlreadyExists,
        "could not find a free plan directory name",
    ))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            jj_exec,
            gh_exec,
            is_jj_repo,
            initial_repo,
            prepare_hunk_plan,
            discard_hunk_plan
        ])
        .run(tauri::generate_context!())
        .expect("error while running ukemi");
}
