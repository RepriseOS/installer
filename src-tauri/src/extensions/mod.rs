mod firmware;
mod mounts;
mod package;

use package::{parse, valid_id, Package};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, Metadata},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

type Result<T> = std::result::Result<T, String>;
const MAX_PACKAGE: usize = 16 * 1024 * 1024;
const PRIMARY: &str = "/Reprise/Extensions/";
const LEGACY: &str = "/Revola/Extensions/";
static EDIT: Mutex<()> = Mutex::new(());

fn word(data: &[u8], i: usize) -> Option<u32> {
    Some(u32::from_le_bytes(data.get(i..i + 4)?.try_into().ok()?))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    model: String,
    repriseos: String,
    revision: Option<String>,
    api: Option<String>,
    firmware_id: Option<String>,
}

impl DeviceInfo {
    fn allows(&self, pkg: &Package) -> bool {
        let dev = self.repriseos == "Development";
        if !dev
            && !semver::Version::parse(&self.repriseos)
                .is_ok_and(|v| v.cmp_precedence(&semver::Version::new(0, 3, 2)).is_gt())
        {
            return false;
        }
        match (&self.api, &self.firmware_id) {
            (Some(api), Some(target)) => {
                let Some((major, minor)) = api.split_once('.') else {
                    return false;
                };
                major.parse::<u32>() == Ok(pkg.minimum >> 16)
                    && minor
                        .parse::<u32>()
                        .is_ok_and(|v| v >= (pkg.minimum & 0xffff))
                    && u32::from_str_radix(target, 16) == Ok(pkg.target)
            }
            _ => dev,
        }
    }
}

#[derive(Serialize, Debug)]
pub struct Installed {
    id: String,
    name: String,
    version: String,
    folder: String,
    requires: Vec<String>,
    #[serde(skip)]
    path: PathBuf,
    library: bool,
}

#[derive(Serialize)]
pub struct Snapshot {
    token: String,
    device: DeviceInfo,
    installed: Vec<Installed>,
}

struct Mount {
    root: PathBuf,
    token: String,
    device: DeviceInfo,
}

fn link(m: &Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if m.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    m.file_type().is_symlink()
}

fn regular(path: &Path) -> Result<File> {
    let m = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !m.is_file() || link(&m) {
        return Err(format!("Expected an ordinary file: {}", path.display()));
    }
    File::open(path).map_err(|e| e.to_string())
}

fn directory(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|m| m.is_dir() && !link(&m))
}

fn inspect(root: &Path) -> Result<Option<Mount>> {
    if !directory(root)
        || !directory(&root.join("iPod_Control"))
        || !directory(&root.join("iPod_Control/Device"))
        || !root.join("osos-cfw.bin").is_file()
        || !root.join("cfw-loader.bin").is_file()
    {
        return Ok(None);
    }
    let mut image = regular(&root.join("osos-cfw.bin"))?;
    let len = image.metadata().map_err(|e| e.to_string())?.len();
    // The CFW resources and the relocatable RVX runtime follow the Apple image.
    let start = len.saturating_sub(2 * 1024 * 1024);
    image
        .seek(SeekFrom::Start(start))
        .map_err(|e| e.to_string())?;
    let mut payload = Vec::new();
    image
        .take(2 * 1024 * 1024)
        .read_to_end(&mut payload)
        .map_err(|e| e.to_string())?;
    let mut loader = regular(&root.join("cfw-loader.bin"))?;
    let mut sysinfo = [0; 0x120];
    loader
        .seek(SeekFrom::Start(0x25100))
        .map_err(|e| e.to_string())?;
    loader.read_exact(&mut sysinfo).map_err(|e| e.to_string())?;
    let model = if sysinfo.starts_with(b"IsyS") {
        let raw = std::str::from_utf8(&sysinfo[0x98..0xa8])
            .unwrap_or("")
            .trim_end_matches('\0');
        match raw.get(1..) {
            Some("C293" | "C297") => "iPod classic 7G",
            Some("B562" | "B565") => "iPod classic 6.5G",
            Some("B029" | "B147" | "B145" | "B150") => "iPod classic 6G",
            _ => "iPod classic",
        }
    } else {
        "iPod classic"
    };
    let Some(device) = firmware::identify(&payload, model.into()) else {
        return Ok(None);
    };
    let mut hash = Sha256::new();
    hash.update(root.as_os_str().as_encoded_bytes());
    hash.update(sysinfo);
    hash.update(len.to_le_bytes());
    hash.update(device.repriseos.as_bytes());
    hash.update(device.revision.as_deref().unwrap_or("").as_bytes());
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        hash.update(
            loader
                .metadata()
                .map_err(|e| e.to_string())?
                .dev()
                .to_le_bytes(),
        );
    }
    Ok(Some(Mount {
        root: root.into(),
        token: format!("{:x}", hash.finalize()),
        device,
    }))
}

fn discover() -> Result<Option<Mount>> {
    let mut found = None;
    for path in mounts::roots()? {
        if let Some(mount) = inspect(&path)? {
            if found.is_some() {
                return Err(
                    "More than one RepriseOS iPod is mounted. Connect one at a time.".into(),
                );
            }
            found = Some(mount);
        }
    }
    Ok(found)
}

fn folder(root: &Path, which: &str, create: bool) -> Result<Option<PathBuf>> {
    if ![PRIMARY, LEGACY].contains(&which) {
        return Err("Unknown extension folder".into());
    }
    let mut dir = root.to_path_buf();
    for part in which.trim_matches('/').split('/') {
        dir.push(part);
        match fs::symlink_metadata(&dir) {
            Ok(m) if m.is_dir() && !link(&m) => (),
            Ok(_) => return Err("Unsafe extension folder".into()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                if !create {
                    return Ok(None);
                }
                fs::create_dir(&dir).map_err(|e| e.to_string())?;
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(Some(dir))
}

fn inventory(root: &Path) -> Result<Vec<Installed>> {
    let mut files = Vec::new();
    for which in [PRIMARY, LEGACY] {
        let Some(dir) = folder(root, which, false)? else {
            continue;
        };
        for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            if !path
                .extension()
                .is_some_and(|s| s.eq_ignore_ascii_case("rvx"))
                || path
                    .file_name()
                    .is_some_and(|s| s.to_string_lossy().starts_with("._"))
            {
                continue;
            }
            let m = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
            if !m.is_file() || link(&m) || m.len() > MAX_PACKAGE as u64 {
                continue;
            }
            let mut bytes = Vec::new();
            regular(&path)?
                .take(MAX_PACKAGE as u64 + 1)
                .read_to_end(&mut bytes)
                .map_err(|e| e.to_string())?;
            if let Ok(pkg) = parse(&bytes) {
                files.push(Installed {
                    id: pkg.id,
                    name: pkg.name,
                    version: pkg.version,
                    requires: pkg.requires,
                    library: pkg.library,
                    folder: which.into(),
                    path,
                });
            }
        }
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

#[derive(Deserialize)]
pub struct WritePackage {
    id: String,
    version: String,
    sha256: String,
    data: Vec<u8>,
}

fn write(mount: &Mount, request: WritePackage) -> Result<()> {
    if request.data.len() > MAX_PACKAGE
        || !valid_id(&request.id)
        || format!("{:x}", Sha256::digest(&request.data)) != request.sha256
    {
        return Err("Invalid extension download".into());
    }
    let pkg = parse(&request.data)?;
    if pkg.id != request.id || pkg.version != request.version || !mount.device.allows(&pkg) {
        return Err("Package identity or RVX compatibility does not match the device".into());
    }
    let installed = inventory(&mount.root)?;
    for dep in &pkg.requires {
        if !installed.iter().any(|e| e.id == *dep && e.library) {
            return Err(format!("Missing required library {dep}"));
        }
    }
    let mut copies = installed
        .iter()
        .filter(|e| e.folder == PRIMARY && e.id == pkg.id);
    let dir = folder(&mount.root, PRIMARY, true)?.unwrap();
    let existing = copies.next();
    if copies.next().is_some() {
        return Err(format!("Multiple copies of {} in {PRIMARY}", pkg.id));
    }
    let path = existing
        .map(|e| e.path.clone())
        .unwrap_or_else(|| dir.join(format!("{}.rvx", pkg.id)));
    let mut tmp = tempfile::NamedTempFile::new_in(dir).map_err(|e| e.to_string())?;
    tmp.write_all(&request.data).map_err(|e| e.to_string())?;
    tmp.as_file().sync_all().map_err(|e| e.to_string())?;
    if existing.is_some() {
        tmp.persist(path)
    } else {
        tmp.persist_noclobber(path)
    }
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn remove(mount: &Mount, id: &str, which: &str) -> Result<()> {
    if !valid_id(id) || ![PRIMARY, LEGACY].contains(&which) {
        return Err("Invalid extension".into());
    }
    let installed = inventory(&mount.root)?;
    if !installed.iter().any(|e| e.id == id && e.folder != which) {
        if let Some(user) = installed
            .iter()
            .find(|e| e.requires.iter().any(|dep| dep == id))
        {
            return Err(format!("Required by {}", user.name));
        }
    }
    for entry in installed.iter().filter(|e| e.folder == which && e.id == id) {
        fs::remove_file(&entry.path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn selected(token: &str) -> Result<Mount> {
    discover()?
        .filter(|m| m.token == token)
        .ok_or_else(|| "The iPod changed or was disconnected. Refresh the device.".into())
}

#[tauri::command]
pub async fn read_extension_device() -> Result<Option<Snapshot>> {
    tauri::async_runtime::spawn_blocking(|| {
        let _guard = EDIT.lock().map_err(|e| e.to_string())?;
        discover()?
            .map(|m| {
                Ok(Snapshot {
                    installed: inventory(&m.root)?,
                    token: m.token,
                    device: m.device,
                })
            })
            .transpose()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn write_extension(token: String, package: WritePackage) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = EDIT.lock().map_err(|e| e.to_string())?;
        write(&selected(&token)?, package)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn remove_extension(token: String, id: String, folder: String) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = EDIT.lock().map_err(|e| e.to_string())?;
        remove(&selected(&token)?, &id, &folder)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests;
