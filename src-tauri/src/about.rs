use serde::Serialize;

#[derive(Serialize)]
pub struct AboutInfo {
    version: &'static str,
    license: &'static str,
    third_party: &'static str,
}

#[tauri::command]
pub fn about() -> AboutInfo {
    AboutInfo {
        version: env!("CARGO_PKG_VERSION"),
        license: include_str!("../../COPYING"),
        third_party: include_str!("../THIRD-PARTY-LICENSES"),
    }
}
