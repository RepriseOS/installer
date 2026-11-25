use super::{word, Result};

pub(super) struct Package {
    pub id: String,
    pub name: String,
    pub version: String,
    pub requires: Vec<String>,
    pub minimum: u32,
    pub library: bool,
    pub target: u32,
}

pub(super) fn valid_id(id: &str) -> bool {
    id.len() <= 32
        && id.as_bytes().first().is_some_and(u8::is_ascii_lowercase)
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'-' | b'_'))
}

pub(super) fn parse(bytes: &[u8]) -> Result<Package> {
    let bad = "Invalid RVX package";
    let w = |offset| word(bytes, offset).ok_or(bad);
    let len = w(16)? as usize;
    let entries = w(20)? as usize;
    if w(0)? != 0x30585652
        || w(4)? != 1
        || !(56..=1024).contains(&len)
        || !(1..=4096).contains(&entries)
        || bytes.len() < 28 + len.next_multiple_of(4) + entries * 20
    {
        return Err(bad.into());
    }
    let m = &bytes[28..28 + len];
    let short = |i| u16::from_le_bytes([m[i], m[i + 1]]) as usize;
    let minimum = word(m, 8).unwrap();
    let modules = word(m, 16).unwrap() as usize;
    let sites = word(m, 20).unwrap() as usize;
    // Listed libraries, then how many of them are optional; those come last.
    let (listed, optional) = (short(52), short(54));
    if word(m, 0) != Some(0x464d5652)
        || word(m, 4) != Some(4)
        || !(1..=15).contains(&modules)
        || modules > entries
        || sites > 8
        || listed > 4
        || optional > listed
        || minimum >> 16 != w(8)? >> 16
        || minimum > w(8)?
    {
        return Err(bad.into());
    }
    let strings = m.get(56 + sites * 12 + modules * 8..).ok_or(bad)?;
    if Some(strings.len() as u32) != word(m, 24) || strings.last() != Some(&0) {
        return Err(bad.into());
    }
    let string = |offset| -> Result<&str> {
        let rest: &[u8] = strings.get(offset..).ok_or(bad)?;
        let end = rest.iter().position(|b| *b == 0).ok_or(bad)?;
        std::str::from_utf8(&rest[..end]).map_err(|_| bad.into())
    };
    let id = string(short(28))?;
    if !valid_id(id) {
        return Err(bad.into());
    }
    let mut requires = Vec::new();
    let mut offset = short(44);
    for _ in 0..listed {
        let dep = string(offset)?;
        if !valid_id(dep) {
            return Err(bad.into());
        }
        offset += dep.len() + 1;
        requires.push(dep.to_owned());
    }
    // The firmware starts a package without its optional libraries.
    requires.truncate(listed - optional);
    let hash = bytes[28..].iter().fold(2166136261u32, |h, b| {
        (h ^ u32::from(*b)).wrapping_mul(16777619)
    });
    if hash != w(24)? {
        return Err("RVX checksum mismatch".into());
    }
    Ok(Package {
        id: id.to_owned(),
        name: string(short(30))?.to_owned(),
        version: string(short(34))?.to_owned(),
        requires,
        minimum,
        library: short(46) == 5,
        target: w(12)?,
    })
}
