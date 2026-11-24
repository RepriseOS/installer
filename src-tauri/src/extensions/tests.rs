use super::*;

fn image(version: &str) -> Vec<u8> {
    let mut bytes =
        format!("\0Build: abc12345-dirty\0RepriseOS {version}\0RepriseRVX1\0").into_bytes();
    bytes.extend(0x10051u32.to_le_bytes());
    bytes.extend(0x660eb6ffu32.to_le_bytes());
    bytes
}

fn request(id: &str, version: &str, minor: u32, dependency: Option<&str>) -> WritePackage {
    let mut manifest = vec![0; 64];
    let mut strings = Vec::new();
    for (index, value) in [id, id, "extension", version, "author", "MIT", ""]
        .into_iter()
        .enumerate()
    {
        manifest[28 + index * 2..30 + index * 2]
            .copy_from_slice(&(strings.len() as u16).to_le_bytes());
        strings.extend(value.bytes().chain([0]));
    }
    if let Some(dep) = dependency {
        manifest[52] = 1;
        manifest[44..46].copy_from_slice(&(strings.len() as u16).to_le_bytes());
        strings.extend(dep.bytes().chain([0]));
    }
    manifest[46] = if id == "dsp" { 5 } else { 1 };
    for (at, value) in [
        (0, 0x464d5652u32),
        (4, 4),
        (8, 0x10000 + minor),
        (16, 1),
        (24, strings.len() as u32),
    ] {
        manifest[at..at + 4].copy_from_slice(&value.to_le_bytes());
    }
    manifest.extend(strings);
    let len = manifest.len() as u32;
    manifest.resize(manifest.len().next_multiple_of(4) + 20, 0);
    let hash = manifest.iter().fold(2166136261u32, |h, b| {
        (h ^ u32::from(*b)).wrapping_mul(16777619)
    });
    let mut data: Vec<_> = [0x30585652u32, 1, 0x10060, 0x660eb6ff, len, 1, hash]
        .into_iter()
        .flat_map(u32::to_le_bytes)
        .collect();
    data.extend(manifest);
    WritePackage {
        id: id.into(),
        version: version.into(),
        sha256: format!("{:x}", Sha256::digest(&data)),
        data,
    }
}

#[test]
fn mounted_install_update_and_remove() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    fs::create_dir_all(root.join("iPod_Control/Device")).unwrap();
    fs::write(root.join("osos-cfw.bin"), image("Development")).unwrap();
    fs::write(root.join("cfw-loader.bin"), vec![0; 0x25220]).unwrap();
    let mount = inspect(root).unwrap().unwrap();
    assert_eq!(mount.device.api.as_deref(), Some("1.81"));
    let ext = || request("crossfeed", "1.0.0", 78, Some("dsp"));
    assert!(write(&mount, ext())
        .unwrap_err()
        .contains("required library"));
    write(&mount, request("dsp", "1.0.0", 74, None)).unwrap();
    write(&mount, ext()).unwrap();
    assert!(remove(&mount, "dsp", PRIMARY)
        .unwrap_err()
        .contains("Required by"));
    let dir = folder(root, PRIMARY, false).unwrap().unwrap();
    fs::rename(dir.join("crossfeed.rvx"), dir.join("custom-name.rvx")).unwrap();
    write(&mount, request("crossfeed", "1.1.0", 81, Some("dsp"))).unwrap();
    assert_eq!(
        inventory(root)
            .unwrap()
            .iter()
            .find(|i| i.id == "crossfeed")
            .unwrap()
            .version,
        "1.1.0"
    );
    assert!(write(&mount, request("crossfeed", "1.2.0", 82, Some("dsp"))).is_err());
    remove(&mount, "crossfeed", PRIMARY).unwrap();
    remove(&mount, "dsp", PRIMARY).unwrap();
    assert!(inventory(root).unwrap().is_empty());

    let pkg = request("sample", "1.0.0", 74, None);
    fs::write(dir.join("sample.rvx"), b"unrelated data").unwrap();
    assert!(write(&mount, pkg).is_err());
    assert_eq!(fs::read(dir.join("sample.rvx")).unwrap(), b"unrelated data");
}

#[test]
fn unknown_development_can_install_and_old_release_cannot() {
    let dev = firmware::identify(b"RepriseOS Development\0", "iPod".into()).unwrap();
    let ext = parse(&request("sample", "1.0.0", 81, None).data).unwrap();
    assert!(dev.allows(&ext));
    for version in ["0.3.1", "0.3.2"] {
        assert!(!firmware::identify(&image(version), "iPod".into())
            .unwrap()
            .allows(&ext));
    }
    assert!(firmware::identify(&image("0.3.3"), "iPod".into())
        .unwrap()
        .allows(&ext));
}

#[test]
#[ignore = "requires a mounted RepriseOS iPod; reads only"]
fn read_connected_ipod() {
    let m = discover().unwrap().expect("mount a RepriseOS iPod");
    println!("{:?}", m.device);
    for item in inventory(&m.root).unwrap() {
        println!("{} {} {}", item.folder, item.id, item.version);
    }
}

#[test]
#[ignore = "requires a local CFW image and built RVX packages"]
fn local_artifacts() {
    let firmware = fs::read(std::env::var_os("TEST_CFW_IMAGE").unwrap()).unwrap();
    let info = firmware::identify(&firmware, "test".into()).unwrap();
    let pkgs = PathBuf::from(std::env::var_os("TEST_RVX_PACKAGES").unwrap());
    let root = tempfile::tempdir().unwrap();
    let m = Mount {
        root: root.path().into(),
        device: info,
        token: "test".into(),
    };
    for id in ["dsp", "crossfeed", "night-shift", "balance", "playback-log"] {
        let data = fs::read(pkgs.join(format!("{id}.rvx"))).unwrap();
        let version = parse(&data).unwrap().version;
        write(
            &m,
            WritePackage {
                id: id.into(),
                version,
                sha256: format!("{:x}", Sha256::digest(&data)),
                data,
            },
        )
        .unwrap();
    }
    assert_eq!(inventory(root.path()).unwrap().len(), 5);
    assert!(remove(&m, "dsp", PRIMARY).is_err());
    remove(&m, "crossfeed", PRIMARY).unwrap();
    remove(&m, "dsp", PRIMARY).unwrap();
}
