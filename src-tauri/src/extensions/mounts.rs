use super::Result;
use std::path::PathBuf;

#[cfg(target_os = "macos")]
pub(super) fn roots() -> Result<Vec<PathBuf>> {
    Ok(std::fs::read_dir("/Volumes")
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .collect())
}

#[cfg(target_os = "linux")]
pub(super) fn roots() -> Result<Vec<PathBuf>> {
    use std::{ffi::OsString, os::unix::ffi::OsStringExt};
    let mounts = std::fs::read("/proc/self/mountinfo").map_err(|e| e.to_string())?;
    Ok(mounts
        .split(|b| *b == b'\n')
        .filter_map(|line| {
            let field = line.split(|b| *b == b' ').nth(4)?;
            let mut path = Vec::new();
            let mut i = 0;
            while i < field.len() {
                if field[i] == b'\\' {
                    let digits = field.get(i + 1..i + 4)?;
                    if !digits.iter().all(|c| (b'0'..=b'7').contains(c)) {
                        return None;
                    }
                    path.push(
                        ((digits[0] - b'0') << 6) | ((digits[1] - b'0') << 3) | (digits[2] - b'0'),
                    );
                    i += 4;
                } else {
                    path.push(field[i]);
                    i += 1;
                }
            }
            Some(PathBuf::from(OsString::from_vec(path)))
        })
        .collect())
}

#[cfg(windows)]
pub(super) fn roots() -> Result<Vec<PathBuf>> {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetLogicalDrives() -> u32;
        fn GetDriveTypeW(root: *const u16) -> u32;
    }
    let drives = unsafe { GetLogicalDrives() };
    if drives == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok((0..26)
        .filter(|i| drives & (1 << i) != 0)
        .filter_map(|i| {
            let path = format!("{}:\\", char::from(b'A' + i));
            let wide: Vec<_> = path.encode_utf16().chain([0]).collect();
            matches!(unsafe { GetDriveTypeW(wide.as_ptr()) }, 2 | 3).then(|| PathBuf::from(path))
        })
        .collect())
}
