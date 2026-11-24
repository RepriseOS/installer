use super::{
    package::{parse, valid_id},
    Installed, Mount, Result, WritePackage, MAX_PACKAGE,
};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, Metadata},
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub(super) const PRIMARY: &str = "/Reprise/Extensions/";
const LEGACY: &str = "/Revola/Extensions/";

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

pub(super) fn regular(path: &Path) -> Result<File> {
    let m = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !m.is_file() || link(&m) {
        return Err(format!("Expected an ordinary file: {}", path.display()));
    }
    File::open(path).map_err(|e| e.to_string())
}

pub(super) fn directory(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|m| m.is_dir() && !link(&m))
}

pub(super) fn folder(root: &Path, which: &str, create: bool) -> Result<Option<PathBuf>> {
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

pub(super) fn inventory(root: &Path) -> Result<Vec<Installed>> {
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

pub(super) fn write(mount: &Mount, request: WritePackage) -> Result<()> {
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

pub(super) fn remove(mount: &Mount, id: &str, which: &str) -> Result<()> {
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
