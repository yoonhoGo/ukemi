// Prevent a second console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;
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
    let binary = jj_binary(&app);
    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new(&binary).args(&args).current_dir(&root).output()
    })
    .await
    .map_err(|error| format!("failed to run jj: {error}"))?
    .map_err(|error| format!("failed to run jj: {error}"))?;

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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![jj_exec, is_jj_repo, initial_repo])
        .run(tauri::generate_context!())
        .expect("error while running ukemi");
}
