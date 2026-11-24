use super::{word, DeviceInfo};
use semver::Version;

const CAPABILITIES: &[u8] = b"RepriseRVX1\0";

fn locate(bytes: &[u8], needle: &[u8]) -> Option<usize> {
    bytes.windows(needle.len()).position(|s| s == needle)
}

fn capabilities(payload: &[u8]) -> Option<(u32, u32)> {
    if let Some(pos) = locate(payload, CAPABILITIES) {
        let record = payload.get(pos + CAPABILITIES.len()..)?;
        return Some((word(record, 0)?, word(record, 4)?));
    }
    // Before the capability record these two runtime builds stored a sized
    // service table with Thumb function offsets in the relocatable trailer.
    let start = locate(payload, b"/Reprise/Extensions\0/Revola/Extensions\0")?;
    let tail = &payload[start..];
    for (size, minor) in [(192u32, 81u32), (204, 82)] {
        let signature = [size.to_le_bytes(), (0x10000 | minor).to_le_bytes()].concat();
        if let Some(at) = locate(tail, &signature) {
            let table = tail.get(at..at + size as usize)?;
            if (8..32)
                .step_by(4)
                .all(|i| word(table, i).is_some_and(|p| p % 2 == 1 && p < 0x10000))
                && (minor != 82 || word(table, 192) == Some(0x52505253))
            {
                return Some((0x10000 | minor, 0x660eb6ff));
            }
        }
    }
    None
}

pub(super) fn identify(payload: &[u8], model: String) -> Option<DeviceInfo> {
    let fields = payload.split(|b| *b == 0);
    let version = fields
        .clone()
        .filter_map(|s| s.strip_prefix(b"RepriseOS "))
        .filter_map(|s| std::str::from_utf8(s).ok())
        .find(|s| *s == "Development" || Version::parse(s).is_ok())?;
    let revision = fields
        .filter_map(|s| s.strip_prefix(b"Build: "))
        .filter_map(|s| std::str::from_utf8(s).ok())
        .find(|s| {
            !s.is_empty()
                && s.len() <= 48
                && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
        });
    let capabilities = capabilities(payload);
    Some(DeviceInfo {
        model,
        eject_reboot: locate(payload, super::eject::FIRMWARE_PATH).is_some(),
        repriseos: version.into(),
        revision: revision.map(str::to_owned),
        api: capabilities.map(|(api, _)| format!("{}.{}", api >> 16, api & 0xffff)),
        firmware_id: capabilities.map(|(_, id)| format!("{id:08x}")),
    })
}
