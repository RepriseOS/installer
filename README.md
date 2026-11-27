# RepriseOS Installer

Desktop app for installing RepriseOS and managing extensions on an iPod classic.
It verifies the firmware, backs up NOR/SysCfg and installs RepriseOS and its bootloader.
All supported models use Apple firmware **2.0.5** as the base.

## Compatibility

- iPod Classic 6G, 6.5G and 7G.
- FAT32 or clean, case-insensitive HFS+ on a supported iPod disk layout.

## Install

Download RepriseOS Installer from [the website](https://repriseos.com/download/)
or [GitHub releases](https://github.com/RepriseOS/installer/releases).
Choose **Install/Update RepriseOS** and select **`iPod_38.2.0.5.ipsw`** for any
supported model, even if the iPod runs older Apple firmware.
Follow the DFU instructions in the app. The installer downloads and verifies the
latest RepriseOS package.

## Manage extensions

Connect your iPod running RepriseOS 0.4.0 and let the volume mount.
In Installer 0.3.0, choose **Manage extensions** to browse the [catalog](https://repriseos.com/extensions/),
install a local `.rvx`, update or remove an extension. Choose **Restart iPod** to load your changes.

## Development

Built with Tauri and React. Requires Node.js, pnpm, Rust, the Tauri platform
prerequisites, libusb, and pkg-config. Cargo fetches the shared Rust crates from
[RepriseOS](https://github.com/RepriseOS/repriseos), pinned in `Cargo.toml` and `Cargo.lock`.

```sh
pnpm install
pnpm tauri dev
```

## Build and check

```sh
pnpm tauri build
pnpm check
cargo test --manifest-path src-tauri/Cargo.toml -j 8
```

The About screen shows `COPYING` and `src-tauri/THIRD-PARTY-LICENSES`, which lists the licence of every third-party Rust crate and npm package the app ships, plus libusb and the Windows WebView2 loader. Regenerate it after changing dependencies. CI fails when it is stale or when `src-tauri/deny.toml` rejects a licence:

```sh
python3 scripts/third_party.py   # needs cargo-about 0.8.4 and pnpm install
cargo deny --manifest-path src-tauri/Cargo.toml --locked check licenses
```

## Support

♥ [Support on Ko-fi](https://ko-fi.com/lgreitis). Help fund my questionable iPod purchases.
