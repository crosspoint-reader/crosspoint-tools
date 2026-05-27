use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use unlocker_core::helper::Helper;
use unlocker_core::orchestrator::{Orchestrator, State as OrchState};
use unlocker_core::runtime::{await_device_lease, ArmConfig, Runtime};
use unlocker_core::types::{Catalog, CrossPointRelease, Locale, Model, Selection};
use unlocker_core::{catalog, session::SessionLog, types::LogEntry};

struct AppState {
    orch: Arc<Orchestrator>,
    log: Arc<SessionLog>,
    http: reqwest::Client,
    helper: Arc<Helper>,
    runtime: Arc<Runtime>,
    #[cfg(target_os = "macos")]
    app_bundle_path: Option<std::path::PathBuf>,
}

#[derive(serde::Serialize)]
struct HelperLogTail {
    available: bool,
    path: Option<String>,
    content: String,
}

#[tauri::command]
fn get_platform() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        todo!("unknown platform")
    }
}

#[tauri::command]
async fn get_state(state: State<'_, AppState>) -> Result<OrchState, String> {
    Ok(state.orch.current_state().await)
}

#[derive(serde::Serialize)]
struct SessionInfo {
    model: Option<Model>,
    locale: Option<Locale>,
    release_id: Option<String>,
    firmware_path: Option<String>,
    bridge_ip: Option<String>,
    ssid: Option<String>,
    psk: Option<String>,
    device_ip: Option<String>,
}

#[tauri::command]
async fn get_session(state: State<'_, AppState>) -> Result<SessionInfo, String> {
    let d = state.orch.data().await;
    Ok(SessionInfo {
        model: d.model,
        locale: d.locale,
        release_id: d.selection.as_ref().map(|s| s.release_id.clone()),
        firmware_path: d.firmware_path,
        bridge_ip: d.bridge_ip,
        ssid: d.ssid,
        psk: d.psk,
        device_ip: d.device_ip,
    })
}

#[tauri::command]
async fn fetch_catalog(state: State<'_, AppState>) -> Result<Catalog, String> {
    state.log.push("info", "fetching catalog", None).await;
    match catalog::fetch_catalog(&state.http).await {
        Ok(c) => Ok(c),
        Err(e) => {
            state
                .log
                .push(
                    "warn",
                    format!("catalog fetch failed, using stub: {e}"),
                    None,
                )
                .await;
            Ok(catalog::stub_catalog())
        }
    }
}

#[tauri::command]
async fn check_helper(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.helper.ping().await.is_ok())
}

#[derive(serde::Serialize)]
struct HelperStatus {
    installed: bool,
    status_label: String,
    socket_reachable: bool,
}

#[tauri::command]
async fn helper_status(state: State<'_, AppState>) -> Result<HelperStatus, String> {
    let socket_reachable = state.helper.ping().await.is_ok();
    // Compare the running helper's reported version with this app's bundled
    // version. If they don't match (or the helper predates the version field)
    // the helper is stale — surface this as `not_running` so HelperGate runs
    // install_helper instead of trusting the live socket. Matters during
    // development and after any auto-update, when a long-running root helper
    // would otherwise keep serving old code.
    let app_version = env!("CARGO_PKG_VERSION");
    let helper_version = if socket_reachable {
        state.helper.version().await.ok().flatten()
    } else {
        None
    };
    let version_matches = helper_version.as_deref() == Some(app_version);
    let usable = socket_reachable && version_matches;
    let status_label = match (socket_reachable, version_matches) {
        (false, _) => "not_running",
        (true, false) => "needs_upgrade",
        (true, true) => "running",
    }
    .to_string();
    if socket_reachable && !version_matches {
        tracing::info!(
            app_version,
            helper_version = ?helper_version,
            "stale helper detected; HelperGate will reinstall"
        );
    }
    Ok(HelperStatus {
        installed: usable,
        status_label,
        socket_reachable: usable,
    })
}

/// Dev override. `npm run tauri dev` doesn't run from a packaged bundle, so
/// the platform-specific resolvers below resolve to a path that doesn't
/// exist. Setting `UNLOCKER_HELPER_PATH` to e.g.
/// `$PWD/target/debug/unlocker-helper` lets the dev app launch a freshly
/// rebuilt helper on every reload, without rebuilding the bundle.
fn helper_path_override() -> Option<std::path::PathBuf> {
    let p = std::env::var_os("UNLOCKER_HELPER_PATH")?;
    let p = std::path::PathBuf::from(p);
    if p.exists() {
        Some(p)
    } else {
        tracing::warn!(
            path = %p.display(),
            "UNLOCKER_HELPER_PATH is set but the file doesn't exist; falling back to bundle path"
        );
        None
    }
}

#[cfg(target_os = "macos")]
fn helper_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    if let Some(p) = helper_path_override() {
        return Ok(p);
    }
    Ok(app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("can't resolve bundle path")?
        .join("MacOS/unlocker-helper"))
}

#[cfg(target_os = "windows")]
fn helper_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    if let Some(p) = helper_path_override() {
        return Ok(p);
    }
    // Tauri's `bundle.resources` puts the helper under the resource_dir on
    // Windows. Fall back to the exe's directory in case a future config
    // change drops it next to the app exe.
    let resource = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("unlocker-helper.exe");
    if resource.exists() {
        return Ok(resource);
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("can't resolve install dir")?;
    Ok(dir.join("unlocker-helper.exe"))
}

#[cfg(target_os = "linux")]
fn helper_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    if let Some(p) = helper_path_override() {
        return Ok(p);
    }
    let resource_helper = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("unlocker-helper");
    if resource_helper.exists() {
        return Ok(resource_helper);
    }

    let mut candidates = vec![resource_helper];

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("unlocker-helper"));
        }
    }

    for dir in [
        "/usr/lib/Xteink Unlocker",
        "/usr/lib/xteink-unlocker",
        "/usr/lib/unlocker-app",
        "/usr/lib/com.sofriendly.crosspoint.unlocker",
        "/opt/Xteink Unlocker",
    ] {
        candidates.push(std::path::Path::new(dir).join("unlocker-helper"));
    }

    if let Some(found) = candidates.iter().find(|p| p.exists()) {
        return Ok(found.clone());
    }

    let checked = candidates
        .iter()
        .map(|p| format!("  - {}", p.display()))
        .collect::<Vec<_>>()
        .join("\n");
    Err(format!(
        "helper not found. Checked these locations:\n{checked}"
    ))
}

#[tauri::command]
async fn install_helper(app: AppHandle) -> Result<(), String> {
    let helper_path = helper_path(&app)?;
    if !helper_path.exists() {
        return Err(format!("helper not found at {}", helper_path.display()));
    }

    #[cfg(target_os = "macos")]
    {
        let path_str = helper_path
            .to_str()
            .ok_or("non-utf8 helper path")?
            .replace('\'', "'\\''");

        // Kill any stale helper from a previous run, then start fresh.
        //
        // Notes:
        //   * No nohup. macOS nohup, when run from the osascript admin trampoline
        //     (no real tty on stdout), prints "can't detach from console:
        //     Inappropriate ioctl for device" and exits *without* exec'ing the
        //     target — so the helper never started. Plain `&` works because
        //     non-interactive sh has no job control and doesn't SIGHUP children.
        //   * </dev/null detaches stdin so the helper can't be SIGPIPE'd if the
        //     auth trampoline closes its end.
        //   * We echo our own breadcrumbs into the stdout log so that if the
        //     helper itself never runs, we still see how far the script got.
        let script = format!(
            "do shell script \"\
                echo \\\"[$(date +%H:%M:%S)] install_helper as $(whoami), launching '{path_str}'\\\" >>/tmp/unlocker-helper.stdout; \
                pkill -TERM -x unlocker-helper 2>/dev/null || true; \
                sleep 1; \
                pkill -KILL -x unlocker-helper 2>/dev/null || true; \
                rm -f /var/run/com.sofriendly.crosspoint.unlocker.helper.sock; \
                '{path_str}' </dev/null >>/tmp/unlocker-helper.stdout 2>&1 & \
                echo \\\"[$(date +%H:%M:%S)] backgrounded pid=$!\\\" >>/tmp/unlocker-helper.stdout\" \
                with prompt \"Xteink Unlocker needs to start a privileged helper to manage your network.\" \
                with administrator privileges"
        );

        let status = tokio::process::Command::new("osascript")
            .args(["-e", &script])
            .status()
            .await
            .map_err(|e| format!("failed to run osascript: {e}"))?;

        if !status.success() {
            return Err("user cancelled or authorization failed".into());
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Kill any stale helper, then re-launch elevated. UAC will prompt.
        // The helper itself carries a requireAdministrator manifest so even a
        // direct `Start-Process -Verb RunAs` would prompt; we go through
        // PowerShell here so the same one-liner does the kill (also elevated).
        let path_str = helper_path
            .to_str()
            .ok_or("non-utf8 helper path")?
            .to_string();
        let escaped = path_str.replace('\'', "''");
        let inner = format!(
            "Stop-Process -Name unlocker-helper -Force -ErrorAction SilentlyContinue; \
             Start-Sleep -Milliseconds 500; \
             Start-Process -FilePath '{escaped}' -WindowStyle Hidden"
        );
        // The outer Start-Process -Verb RunAs is what triggers the UAC prompt.
        let outer = format!(
            "Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden \
             -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',\"{inner}\""
        );
        let status = tokio::process::Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &outer,
            ])
            .status()
            .await
            .map_err(|e| format!("failed to run powershell: {e}"))?;
        if !status.success() {
            return Err("user cancelled or UAC denied".into());
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Don't fail if we can't chmod: on a deb install the helper lives in
        // root-owned /usr/lib/... (EPERM for the unprivileged GUI), and inside
        // an AppImage it lives on a read-only squashfs mount (EROFS). In both
        // cases the bundle already ships the helper as 0755, so a chmod failure
        // here is fine — but propagating the error would skip the pkexec call
        // below and the user would never see an auth prompt.
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        let _ = std::fs::set_permissions(&helper_path, perms);

        // AppImages mount their payload via FUSE under /tmp/.mount_XXXX/, owned
        // by the invoking user with no allow_other — root can't traverse the
        // mount, so `pkexec /bin/sh -c '<mount>/unlocker-helper'` dies with
        // "Permission denied". Stage the binary to a path root can read.
        let launch_path = if std::env::var_os("APPIMAGE").is_some()
            || helper_path
                .to_string_lossy()
                .starts_with("/tmp/.mount_")
        {
            let staged = std::path::PathBuf::from("/tmp/unlocker-helper.bin");
            std::fs::copy(&helper_path, &staged)
                .map_err(|e| format!("failed to stage helper to {}: {e}", staged.display()))?;
            let _ = std::fs::set_permissions(&staged, std::fs::Permissions::from_mode(0o755));
            staged
        } else {
            helper_path.clone()
        };

        let path_str = shell_quote(&launch_path.to_string_lossy());

        // Use pkexec for the GUI Linux admin prompt. The helper is a
        // long-running RPC server, so pkexec starts a short root shell that
        // launches the helper in the background and then exits.
        let script = format!(
            "pkill -TERM -x unlocker-helper 2>/dev/null || true; \
             sleep 0.2; \
             pkill -KILL -x unlocker-helper 2>/dev/null || true; \
             echo \"[$(date +%H:%M:%S)] install_helper as $(whoami), launching {path_str}\" >>/tmp/unlocker-helper.stdout; \
             {path_str} </dev/null >>/tmp/unlocker-helper.stdout 2>&1 & \
             echo \"[$(date +%H:%M:%S)] backgrounded pid=$!\" >>/tmp/unlocker-helper.stdout"
        );
        let status = tokio::process::Command::new("/usr/bin/pkexec")
            .args(["/bin/sh", "-c", &script])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("failed to spawn /usr/bin/pkexec: {e}"))?
            .wait()
            .await
            .map_err(|e| format!("failed to wait for /usr/bin/pkexec: {e}"))?;

        if !status.success() {
            return Err("user cancelled or authorization failed".into());
        }
    }

    // Wait for the helper to start listening. 10s gives slow machines and
    // first-launch SmartScreen / Gatekeeper checks time to settle.
    let helper = Helper::new();
    for _ in 0..20 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if helper.ping().await.is_ok() {
            return Ok(());
        }
    }

    Err(helper_launch_failure_message(&helper_path))
}

/// Build a diagnostic error message when the helper launches but never reaches
/// the socket. Includes whether the process is alive and the tail of its logs
/// so the user can paste something useful into a bug report.
fn helper_launch_failure_message(helper_path: &std::path::Path) -> String {
    let mut msg = String::from("helper started but RPC channel not reachable after 10s");
    msg.push_str(&format!("\n• helper path: {}", helper_path.display()));
    msg.push_str(&format!("\n• helper exists: {}", helper_path.exists()));

    #[cfg(target_os = "macos")]
    {
        let running = std::process::Command::new("pgrep")
            .args(["-x", "unlocker-helper"])
            .output()
            .ok()
            .map(|o| !o.stdout.is_empty())
            .unwrap_or(false);
        msg.push_str(&format!("\n• process running: {running}"));

        let socket =
            std::path::Path::new("/var/run/com.sofriendly.crosspoint.unlocker.helper.sock");
        msg.push_str(&format!("\n• socket exists: {}", socket.exists()));

        for log in ["/tmp/unlocker-helper.log", "/tmp/unlocker-helper.stdout"] {
            if let Ok(content) = std::fs::read_to_string(log) {
                let tail = tail_lines(&content, 20);
                if !tail.is_empty() {
                    msg.push_str(&format!("\n--- {log} (last 20 lines) ---\n{tail}"));
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let running = std::process::Command::new("pgrep")
            .args(["-x", "unlocker-helper"])
            .output()
            .ok()
            .map(|o| !o.stdout.is_empty())
            .unwrap_or(false);
        msg.push_str(&format!("\n• process running: {running}"));

        let socket =
            std::path::Path::new("/var/run/com.sofriendly.crosspoint.unlocker.helper.sock");
        msg.push_str(&format!("\n• socket exists: {}", socket.exists()));

        for log in ["/tmp/unlocker-helper.log", "/tmp/unlocker-helper.stdout"] {
            if let Ok(content) = std::fs::read_to_string(log) {
                let tail = tail_lines(&content, 20);
                if !tail.is_empty() {
                    msg.push_str(&format!("\n--- {log} (last 20 lines) ---\n{tail}"));
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let running = std::process::Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq unlocker-helper.exe", "/NH"])
            .output()
            .ok()
            .map(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .to_lowercase()
                    .contains("unlocker-helper.exe")
            })
            .unwrap_or(false);
        msg.push_str(&format!("\n• process running: {running}"));

        let log = std::env::var_os("ProgramData")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| std::path::PathBuf::from(r"C:\ProgramData"))
            .join("CrossPoint")
            .join("unlocker-helper")
            .join("unlocker-helper.log");
        if let Ok(content) = std::fs::read_to_string(&log) {
            let tail = tail_lines(&content, 20);
            if !tail.is_empty() {
                msg.push_str(&format!(
                    "\n--- {} (last 20 lines) ---\n{}",
                    log.display(),
                    tail
                ));
            }
        }
    }

    msg
}

fn tail_lines(s: &str, n: usize) -> String {
    let lines: Vec<&str> = s.lines().collect();
    let start = lines.len().saturating_sub(n);
    lines[start..].join("\n")
}

#[cfg(target_os = "linux")]
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn helper_log_paths() -> Vec<std::path::PathBuf> {
    vec![
        std::path::PathBuf::from("/tmp/unlocker-helper.log"),
        std::path::PathBuf::from("/tmp/unlocker-helper.stdout"),
    ]
}

#[cfg(target_os = "windows")]
fn helper_log_paths() -> Vec<std::path::PathBuf> {
    let base = std::env::var_os("ProgramData")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from(r"C:\ProgramData"));
    vec![base
        .join("CrossPoint")
        .join("unlocker-helper")
        .join("unlocker-helper.log")]
}

#[tauri::command]
async fn get_helper_log_tail(lines: Option<usize>) -> Result<HelperLogTail, String> {
    let limit = lines.unwrap_or(200).clamp(20, 1000);
    let paths = helper_log_paths();

    for path in &paths {
        if !path.exists() {
            continue;
        }

        let content = tokio::fs::read_to_string(path)
            .await
            .map_err(|e| format!("failed to read {}: {e}", path.display()))?;

        return Ok(HelperLogTail {
            available: true,
            path: Some(path.display().to_string()),
            content: tail_lines(&content, limit),
        });
    }

    Ok(HelperLogTail {
        available: false,
        path: paths.first().map(|p| p.display().to_string()),
        content: String::new(),
    })
}

#[tauri::command]
async fn uninstall_helper() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let script = "do shell script \"\
            if pgrep -x unlocker-helper >/dev/null 2>&1; then \
                pkill -TERM -x unlocker-helper 2>/dev/null || true; \
                for i in 1 2 3 4 5; do \
                    pgrep -x unlocker-helper >/dev/null 2>&1 || { rm -f /var/run/com.sofriendly.crosspoint.unlocker.helper.sock; exit 0; }; \
                    sleep 1; \
                done; \
                pkill -KILL -x unlocker-helper 2>/dev/null || true; \
                for i in 1 2 3 4 5; do \
                    pgrep -x unlocker-helper >/dev/null 2>&1 || { rm -f /var/run/com.sofriendly.crosspoint.unlocker.helper.sock; exit 0; }; \
                    sleep 1; \
                done; \
                exit 1; \
            fi; \
            rm -f /var/run/com.sofriendly.crosspoint.unlocker.helper.sock; \
            exit 0\" \
            with prompt \"Xteink Unlocker needs to stop its privileged helper.\" \
            with administrator privileges";
        let status = tokio::process::Command::new("osascript")
            .args(["-e", script])
            .status()
            .await
            .map_err(|e| format!("failed to run osascript: {e}"))?;
        if !status.success() {
            return Err("user cancelled, authorization failed, or helper did not stop".into());
        }
    }
    #[cfg(target_os = "linux")]
    {
        let status = tokio::process::Command::new("/usr/bin/pkexec")
            .args(["/usr/bin/pkill", "-15", "unlocker-helper"])
            .status()
            .await
            .map_err(|e| format!("failed to run /usr/bin/pkexec /usr/bin/pkill: {e}"))?;
        if !status.success() {
            return Err("user cancelled or authorization failed".into());
        }
    }
    #[cfg(target_os = "windows")]
    {
        // Killing an elevated process requires elevation. We re-prompt UAC.
        let outer = "Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden \
            -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',\
            \"taskkill /F /IM unlocker-helper.exe\"";
        let status = tokio::process::Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                outer,
            ])
            .status()
            .await
            .map_err(|e| format!("failed to run powershell: {e}"))?;
        if !status.success() {
            return Err("user cancelled or UAC denied".into());
        }
    }
    Ok(())
}

#[tauri::command]
async fn accept_consent(
    state: State<'_, AppState>,
    general: bool,
    recovery: bool,
) -> Result<(), String> {
    state.orch.set_consent(general, recovery).await;
    state
        .orch
        .transition(OrchState::SelectingDeviceAndRegion, None)
        .await;
    Ok(())
}

#[tauri::command]
async fn select_device(
    state: State<'_, AppState>,
    model: Model,
    locale: Locale,
) -> Result<(), String> {
    state.orch.set_device(model, locale).await;
    state
        .orch
        .transition(OrchState::SelectingFirmware, None)
        .await;
    Ok(())
}

#[tauri::command]
async fn select_firmware(state: State<'_, AppState>, selection: Selection) -> Result<(), String> {
    state.orch.set_selection(selection.clone()).await;
    state
        .orch
        .transition(OrchState::DownloadingFirmware, None)
        .await;

    let orch = state.orch.clone();
    let log = state.log.clone();
    let http = state.http.clone();
    let runtime = state.runtime.clone();
    let helper = state.helper.clone();

    tokio::spawn(async move {
        if let Err(e) = run_install(orch.clone(), log, http, runtime, helper, selection).await {
            orch.fail(format!("{e:#}")).await;
        }
    });

    Ok(())
}

#[tauri::command]
async fn select_local_firmware(
    state: State<'_, AppState>,
    model: Model,
    locale: Locale,
    path: String,
) -> Result<(), String> {
    let path = std::path::PathBuf::from(path);
    if !path.is_file() {
        return Err(format!("firmware file not found: {}", path.display()));
    }
    let is_bin = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("bin"))
        .unwrap_or(false);
    if !is_bin {
        return Err("local firmware must be a .bin file".into());
    }

    state
        .orch
        .set_selection(Selection {
            model,
            locale,
            release_id: "local".into(),
        })
        .await;
    state
        .orch
        .transition(OrchState::DownloadingFirmware, None)
        .await;

    let orch = state.orch.clone();
    let log = state.log.clone();
    let runtime = state.runtime.clone();
    let helper = state.helper.clone();

    tokio::spawn(async move {
        if let Err(e) = run_local_install(orch.clone(), log, runtime, helper, path).await {
            orch.fail(format!("{e:#}")).await;
        }
    });

    Ok(())
}

struct PreparedFirmware {
    path: std::path::PathBuf,
    sha: String,
    size: u64,
    version: String,
    change_log: String,
}

async fn run_install(
    orch: Arc<Orchestrator>,
    log: Arc<SessionLog>,
    http: reqwest::Client,
    runtime: Arc<Runtime>,
    helper: Arc<Helper>,
    selection: Selection,
) -> anyhow::Result<()> {
    // ── Locate + cache + download firmware ──
    let cat = catalog::fetch_catalog(&http)
        .await
        .unwrap_or_else(|_| catalog::stub_catalog());
    let release = cat
        .releases
        .into_iter()
        .find(|r| r.id == selection.release_id)
        .ok_or_else(|| anyhow::anyhow!("selected release not found"))?;

    let (path, sha) = if let Some(sha) = release.firmware_sha256.as_deref() {
        if let Some(p) = catalog::cached_path(sha)? {
            if catalog::verify_file(&p, sha).unwrap_or(false) {
                log.push("info", "firmware cache hit", None).await;
                (p, sha.to_string())
            } else {
                catalog::download_firmware(&http, &release, |_, _| {}).await?
            }
        } else {
            catalog::download_firmware(&http, &release, |_, _| {}).await?
        }
    } else {
        catalog::download_firmware(&http, &release, |_, _| {}).await?
    };
    let size = std::fs::metadata(&path)
        .map(|m| m.len())
        .unwrap_or(release.size);
    let firmware = PreparedFirmware {
        path,
        sha,
        size,
        version: release.version.clone(),
        change_log: render_changelog(&release),
    };

    run_prepared_install(orch, log, runtime, helper, firmware).await
}

async fn run_local_install(
    orch: Arc<Orchestrator>,
    log: Arc<SessionLog>,
    runtime: Arc<Runtime>,
    helper: Arc<Helper>,
    path: std::path::PathBuf,
) -> anyhow::Result<()> {
    let sha = catalog::hash_file(&path)?;
    let size = std::fs::metadata(&path)?.len();
    let display_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("local firmware")
        .to_string();

    // Copy the user-picked .bin into the app's cache directory before we hand
    // the path to the privileged helper. The app process has TCC consent for
    // the file (the user just picked it via the open dialog), but the helper
    // runs as root via osascript admin and on macOS TCC blocks even root from
    // reading ~/Downloads / ~/Desktop / iCloud Drive without explicit consent.
    // Without this copy the helper's tokio::fs::read silently fails with
    // EPERM, gets mapped to 404, and the device's OTA dies with no log trail.
    let cached_path = match catalog::cached_path(&sha)? {
        Some(p) if catalog::verify_file(&p, &sha).unwrap_or(false) => {
            log.push("info", "local firmware already in cache", None)
                .await;
            p
        }
        _ => {
            let dest = catalog::cache_dir()?.join(format!("{sha}.bin"));
            tokio::fs::copy(&path, &dest).await.map_err(|e| {
                anyhow::anyhow!(
                    "failed to copy {} -> {}: {e}",
                    path.display(),
                    dest.display()
                )
            })?;
            log.push(
                "info",
                format!("copied local firmware into cache: {}", dest.display()),
                None,
            )
            .await;
            dest
        }
    };

    log.push(
        "info",
        format!("using local firmware: {display_name} ({size} bytes)"),
        None,
    )
    .await;

    let firmware = PreparedFirmware {
        path: cached_path,
        sha,
        size,
        version: "local".into(),
        change_log: format!("Installing local firmware file: {display_name}"),
    };

    run_prepared_install(orch, log, runtime, helper, firmware).await
}

async fn run_prepared_install(
    orch: Arc<Orchestrator>,
    log: Arc<SessionLog>,
    runtime: Arc<Runtime>,
    helper: Arc<Helper>,
    firmware: PreparedFirmware,
) -> anyhow::Result<()> {
    orch.set_firmware(firmware.path.to_string_lossy().into(), firmware.sha.clone())
        .await;

    // ── Hotspot ──
    orch.transition(OrchState::SettingUpHotspot, None).await;
    // Fixed creds: the user has to type the PSK on the Xteink keyboard, so a
    // Keep this stable for UX, but avoid "xteink": CH stock firmware appears
    // to reserve that namespace for its own app-connect/provisioning paths and
    // may refuse to associate with a normal station network using that SSID.
    let ssid = "crosspoint".to_string();
    let psk = "11111111".to_string();
    let hotspot_label = if cfg!(target_os = "windows") {
        "Mobile Hotspot"
    } else {
        "Internet Sharing"
    };
    log.push("info", format!("configuring {hotspot_label}"), None)
        .await;
    if let Err(e) = runtime.prepare_hotspot(&helper, &ssid, &psk).await {
        log.push(
            "error",
            format!("{hotspot_label} setup failed: {e:#}"),
            None,
        )
        .await;
        return Err(e.into());
    }
    if cfg!(target_os = "windows") {
        log.push("info", "Mobile Hotspot up", None).await;
    } else {
        log.push(
            "info",
            "ready — enable Internet Sharing in System Settings",
            None,
        )
        .await;
    }

    // Wait for the user to enable Internet Sharing in System Settings.
    orch.transition(OrchState::WaitingForInternetSharing, None)
        .await;
    let info = match runtime.await_hotspot(&helper, &ssid, &psk).await {
        Ok(info) => info,
        Err(e) => {
            log.push("error", format!("await_hotspot failed: {e:#}"), None)
                .await;
            return Err(e);
        }
    };
    log.push(
        "info",
        format!("hotspot up — bridge at {}", info.bridge_ip),
        None,
    )
    .await;
    orch.set_hotspot(info.ssid, info.psk, info.bridge_ip.to_string())
        .await;

    // ── Arm DNS + HTTP + HTTPS immediately so they're ready before any
    //    device connects. The device may check for updates the moment it
    //    joins the network. ──
    let bridge_ip: std::net::Ipv4Addr = info.bridge_ip;
    let arm_cfg = ArmConfig {
        bridge_ip,
        model: orch.data().await.model.unwrap(),
        locale: orch.data().await.locale.unwrap(),
        firmware_path: firmware.path,
        firmware_size: firmware.size,
        firmware_sha256: firmware.sha,
        crosspoint_version: firmware.version,
        change_log: firmware.change_log,
    };
    runtime.arm(&helper, arm_cfg).await?;
    log.push("info", "DNS + HTTP + HTTPS servers armed", None)
        .await;

    orch.transition(OrchState::AwaitingClient, None).await;
    log.push("info", "waiting for device to join hotspot", None)
        .await;

    // ── Wait for device to join ──
    // Best-effort: DHCP lease detection is cosmetic (gives us MAC/IP to show).
    // The real "device is connected" signal is the manifest HTTP hit below.
    // Don't fail the session if the lease scan misses — it's known flaky on
    // Windows (ARP table) and Linux (lease file timing).
    match await_device_lease(&helper, bridge_ip, Duration::from_secs(1800)).await {
        Ok((mac, ip)) => {
            log.push("info", format!("device joined: {mac} -> {ip}"), None)
                .await;
            orch.set_device_ip(ip).await;
        }
        Err(e) => {
            log.push(
                "warn",
                format!("could not detect DHCP lease ({e}); waiting for device check-update anyway"),
                None,
            )
            .await;
        }
    }

    // Servers are already armed. We block here until the helper reports
    // the manifest request.
    orch.transition(OrchState::AwaitingDeviceRequest, None)
        .await;
    log.push("info", "armed; waiting for device check-update", None)
        .await;
    helper.wait_manifest().await?;
    log.push("info", "device fetched manifest", None).await;
    orch.transition(OrchState::Serving, Some("Manifest served".into()))
        .await;

    helper.wait_firmware().await?;
    log.push(
        "info",
        "device started firmware download; handoff to on-device updater",
        None,
    )
    .await;
    let done_msg = if cfg!(target_os = "windows") {
        "Check your device, then clean up the network on this PC."
    } else {
        "Check your device, then clean up the network on this Mac."
    };
    orch.transition(OrchState::Done, Some(done_msg.into()))
        .await;

    Ok(())
}

fn render_changelog(release: &CrossPointRelease) -> String {
    format!(
        "Installing CrossPoint Reader {ver}\n\n\
         This update replaces the stock Xteink firmware with CrossPoint, an open-source firmware with more features and full local control.\n\n\
         Learn more: https://crosspointreader.com",
        ver = release.version,
    )
}

#[tauri::command]
async fn confirm_running(state: State<'_, AppState>) -> Result<(), String> {
    state.orch.transition(OrchState::Done, None).await;
    state
        .runtime
        .teardown(&state.helper)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn cleanup_after_install(state: State<'_, AppState>) -> Result<(), String> {
    let label = if cfg!(target_os = "windows") {
        "Mobile Hotspot"
    } else {
        "Internet Sharing"
    };
    state
        .log
        .push(
            "info",
            format!("cleaning up {label} and local network changes"),
            None,
        )
        .await;
    let _ = state.runtime.teardown(&state.helper).await;
    state.helper.full_cleanup().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn cancel(state: State<'_, AppState>) -> Result<(), String> {
    // Show feedback immediately so the UI doesn't look frozen while the
    // helper teardown is in flight. Previously this ran teardown synchronously
    // before any state transition — if the helper was blocked (e.g. stuck in
    // WaitFirmware or a slow `launchctl bootout`) the user saw the prior
    // screen until they force-quit.
    state
        .orch
        .transition(OrchState::CleaningUp, Some("Reverting changes…".into()))
        .await;

    // Hard cap teardown. If the helper is genuinely stuck we still transition
    // back to Idle below; the user can run Repair from settings.
    let _ = tokio::time::timeout(
        Duration::from_secs(15),
        state.runtime.teardown(&state.helper),
    )
    .await;

    state.orch.cleanup().await;
    Ok(())
}

#[tauri::command]
async fn repair_system(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state
        .log
        .push("warn", "running network repair and loopback restore", None)
        .await;

    // Repair is most useful right after a force-quit when the helper isn't
    // running yet — that's also when the loopback bug is biting. If we can't
    // reach the helper, install/start it first so cleanup actually runs.
    if state.helper.ping().await.is_err() {
        install_helper(app).await?;
    }

    state.helper.full_cleanup().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_logs(state: State<'_, AppState>) -> Result<Vec<LogEntry>, String> {
    Ok(state.log.snapshot().await)
}

#[cfg(target_os = "macos")]
fn app_bundle_from_exe(exe: std::path::PathBuf) -> Result<std::path::PathBuf, String> {
    let macos_dir = exe
        .parent()
        .ok_or_else(|| "can't resolve executable directory".to_string())?;
    let contents_dir = macos_dir
        .parent()
        .ok_or_else(|| "can't resolve app Contents directory".to_string())?;
    let app_bundle = contents_dir
        .parent()
        .ok_or_else(|| "can't resolve app bundle".to_string())?;

    if app_bundle.extension().and_then(|s| s.to_str()) != Some("app") {
        return Err(format!(
            "resolved path is not an app bundle: {}",
            app_bundle.display()
        ));
    }

    Ok(app_bundle.to_path_buf())
}

#[cfg(target_os = "macos")]
fn current_app_bundle() -> Result<std::path::PathBuf, String> {
    app_bundle_from_exe(std::env::current_exe().map_err(|e| e.to_string())?)
}

#[tauri::command]
fn restart_after_update(_app: AppHandle, _state: State<'_, AppState>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if let Some(app_bundle) = _state.app_bundle_path.clone() {
            std::process::Command::new("/bin/sh")
                .arg("-c")
                .arg("sleep 0.5; /usr/bin/open -n \"$1\"")
                .arg("restart-after-update")
                .arg(&app_bundle)
                .spawn()
                .map_err(|e| format!("failed to schedule app restart: {e}"))?;
            std::process::exit(0);
        } else {
            // Dev / unbundled: nothing to relaunch via `open`. Caller can
            // start the dev server again manually.
            tracing::warn!("restart_after_update called but no app bundle path is known; exiting");
            std::process::exit(0);
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        tauri::process::restart(&_app.env());
    }
}

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let orch = Orchestrator::new();
    let log = SessionLog::new(500);
    let http = reqwest::Client::builder()
        .user_agent("XteinkUnlocker/0.1")
        .build()
        .expect("reqwest");
    let helper = Helper::new();
    let runtime = Runtime::new();
    #[cfg(target_os = "macos")]
    let app_bundle_path = match current_app_bundle() {
        Ok(p) => Some(p),
        Err(e) => {
            // Expected in dev (`npm run tauri dev` runs the bare exe outside
            // a .app bundle). restart_after_update will degrade gracefully.
            tracing::warn!(error = %e, "no app bundle path; restart-after-update will just exit");
            None
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            orch: orch.clone(),
            log: log.clone(),
            http,
            helper: helper.clone(),
            runtime: runtime.clone(),
            #[cfg(target_os = "macos")]
            app_bundle_path,
        })
        .setup(move |app| {
            let handle: AppHandle = app.handle().clone();

            let mut rx = orch.subscribe();
            let h2 = handle.clone();
            tauri::async_runtime::spawn(async move {
                while let Ok(ev) = rx.recv().await {
                    let _ = h2.emit("state-changed", &ev);
                }
            });

            let mut lr = log.subscribe();
            let h3 = handle.clone();
            tauri::async_runtime::spawn(async move {
                while let Ok(entry) = lr.recv().await {
                    let _ = h3.emit("log", &entry);
                }
            });

            let o = orch.clone();
            tauri::async_runtime::spawn(async move {
                o.transition(OrchState::Consenting, None).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_platform,
            get_state,
            get_session,
            fetch_catalog,
            check_helper,
            helper_status,
            install_helper,
            uninstall_helper,
            accept_consent,
            select_device,
            select_firmware,
            select_local_firmware,
            confirm_running,
            cleanup_after_install,
            cancel,
            repair_system,
            get_logs,
            get_helper_log_tail,
            restart_after_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
