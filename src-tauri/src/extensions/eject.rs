use super::{
    mounts::{inspect, selected},
    storage::regular,
    Mount, Result, EDIT,
};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
    process::Command,
};

pub(super) const FIRMWARE_PATH: &[u8] = b"iPod_Control\\Device\\RepriseReboot1.req\0";
const REQUEST: &[u8; 4] = b"RBR1";

fn is_request(path: &Path) -> Result<bool> {
    let mut file = regular(path)?;
    let mut bytes = [0; 4];
    Ok(file.metadata().map_err(|e| e.to_string())?.len() == 4
        && file.read_exact(&mut bytes).is_ok()
        && &bytes == REQUEST)
}

pub(super) fn request_reboot(mount: &Mount, eject: impl FnOnce(&Path) -> Result<()>) -> Result<()> {
    if !mount.device.eject_reboot {
        return Err("This RepriseOS build requires a manual restart.".into());
    }
    let dir = mount.root.join("iPod_Control/Device");
    let path = dir.join("RepriseReboot1.req");
    // Publish the complete request without replacing an unrelated file.
    let mut tmp = tempfile::NamedTempFile::new_in(&dir).map_err(|e| e.to_string())?;
    tmp.write_all(REQUEST)
        .and_then(|()| tmp.as_file().sync_all())
        .map_err(|e| e.to_string())?;
    match tmp.persist_noclobber(&path) {
        Ok(file) => drop(file),
        Err(e) if e.error.kind() == std::io::ErrorKind::AlreadyExists => {
            drop(e);
            if !is_request(&path)? {
                return Err("Another file occupies the reboot request path.".into());
            }
        }
        Err(e) => return Err(e.error.to_string()),
    }
    if let Err(error) = eject(&mount.root) {
        if inspect(&mount.root)?.is_some_and(|current| current.token == mount.token)
            && is_request(&path)?
        {
            fs::remove_file(&path)
                .map_err(|e| format!("{error}. Could not cancel the reboot request: {e}"))?;
        }
        return Err(error);
    }
    Ok(())
}

#[cfg(unix)]
fn check_mount(root: &Path) -> Result<()> {
    use std::os::unix::fs::MetadataExt;
    let device = fs::metadata(root).map_err(|e| e.to_string())?.dev();
    let parent = root.parent().ok_or("Expected a mounted iPod volume")?;
    for path in [parent, Path::new("/")] {
        if fs::metadata(path).map_err(|e| e.to_string())?.dev() == device {
            return Err("Expected a separate mounted iPod volume.".into());
        }
    }
    Ok(())
}

#[cfg(windows)]
fn check_mount(root: &Path) -> Result<()> {
    let system = std::env::var("SystemDrive").map_err(|e| e.to_string())?;
    if root
        .to_string_lossy()
        .trim_end_matches('\\')
        .eq_ignore_ascii_case(&system)
    {
        return Err("Cannot eject the system drive.".into());
    }
    Ok(())
}

fn system_eject(root: &Path) -> Result<()> {
    #[cfg(target_os = "macos")]
    let output = Command::new("/usr/sbin/diskutil")
        .arg("eject")
        .arg(root)
        .output();
    #[cfg(target_os = "linux")]
    let output = Command::new("eject").arg("--").arg(root).output();
    #[cfg(windows)]
    let output = {
        use std::os::windows::process::CommandExt;
        const SCRIPT: &str = r"
            $ErrorActionPreference = 'Stop'
            $drive = $env:REPRISE_EJECT_DRIVE
            $item = (New-Object -ComObject Shell.Application).Namespace(17).ParseName($drive)
            $item.InvokeVerb('Eject')
            for ($i = 0; $i -lt 100; $i++) {
                if (-not [IO.Directory]::Exists($drive + '\')) { exit 0 }
                Start-Sleep -Milliseconds 100
            }
            throw 'Windows did not eject the iPod.'
        ";
        Command::new("powershell.exe")
            .creation_flags(0x08000000)
            .args(["-NoProfile", "-NonInteractive", "-Command", SCRIPT])
            .env(
                "REPRISE_EJECT_DRIVE",
                root.to_string_lossy().trim_end_matches('\\'),
            )
            .output()
    };
    let output = output.map_err(|e| format!("Could not start safe eject: {e}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Could not eject the iPod. Close files using it and try again. {}",
            detail.trim()
        )
        .trim_end()
        .to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn eject_and_reboot(token: String) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = EDIT.lock().map_err(|e| e.to_string())?;
        let mount = selected(&token)?;
        check_mount(&mount.root)?;
        request_reboot(&mount, |root| {
            if !inspect(root)?.is_some_and(|current| current.token == token) {
                return Err("The iPod changed before eject. Refresh the device.".into());
            }
            system_eject(root)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
