"""Write the licences of everything the desktop app links or bundles.

Rust crates come from cargo-about, npm packages from the production dependency
tree, libusb from the copy rusb compiles in, and the WebView2 loader licence,
which Windows builds need, from scripts/third-party/webview2-sdk.txt. npm
licences must be on the allow list in src-tauri/deny.toml, which cargo-deny
applies to the crates; cargo-about's list in scripts/third-party/about.toml must
match it. The RepriseOS crates are part of this project and are left out. The
About screen shows the file.
"""

import argparse
import json
import re
import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "src-tauri/Cargo.toml"
CONFIG = ROOT / "scripts/third-party"
OUTPUT = ROOT / "src-tauri/THIRD-PARTY-LICENSES"
OWN_SOURCE = "git+https://github.com/RepriseOS/repriseos.git"
RULE = "=" * 80
LICENSE_NAMES = ("LICENSE", "LICENCE", "COPYING", "UNLICENSE")


def run(*command, cwd=ROOT):
    return subprocess.run(
        command, cwd=cwd, check=True, capture_output=True, encoding="utf-8"
    ).stdout


def cargo_metadata():
    return json.loads(
        run(
            "cargo",
            "metadata",
            "--format-version",
            "1",
            "--locked",
            "--manifest-path",
            str(MANIFEST),
        )
    )


def package(metadata, name):
    return next(p for p in metadata["packages"] if p["name"] == name)


def tidy(text):
    """A licence text without trailing spaces or repeated blank lines. Crates
    such as miniz_oxide ship one licence in two files that differ only in
    blank lines, and cargo-about reads whichever the directory lists first,
    which differs between filesystems."""
    lines = [line.rstrip(" \t\r") for line in text.split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines).strip("\n"))


def rust_sections(own):
    rendered = run(
        "cargo",
        "about",
        "generate",
        "--workspace",
        "--locked",
        "--manifest-path",
        str(MANIFEST),
        "-c",
        str(CONFIG / "about.toml"),
        str(CONFIG / "about.hbs"),
    )
    sections = []
    for block in rendered.split(RULE)[1:]:
        name, used_by, text = block.strip("\n").split("\n", 2)
        crates = used_by.removeprefix("Used by: ").split(" ")
        users = [f"{n} {v}" for n, v in zip(crates[::2], crates[1::2]) if n not in own]
        if users:
            sections.append((name, users, text.strip("\n")))
    return sections


def libusb_section(package):
    source = Path(package["manifest_path"]).parent / "libusb"
    text = (source / "COPYING").read_text(encoding="utf-8")
    notice = (source / "AUTHORS").read_text(encoding="utf-8")
    header = (source / "libusb/version.h").read_text(encoding="utf-8")
    version = ".".join(
        re.search(rf"#define LIBUSB_{part} (\d+)", header)[1]
        for part in ("MAJOR", "MINOR", "MICRO")
    )
    users = [f"libusb {version} (libusb1-sys {package['version']}, statically linked)"]
    return (
        "GNU Lesser General Public License v2.1 or later",
        users,
        f"{notice}\n{text}",
    )


def webview2_section(package):
    """Windows MSVC builds link Microsoft's WebView2LoaderStatic.lib, shipped
    as a binary in webview2-com-sys; the crate does not carry its licence."""
    changelog = (Path(package["manifest_path"]).parent / "CHANGELOG.md").read_text(
        encoding="utf-8"
    )
    sdk = re.search(r"WebView2 SDK to (\S+)", changelog)[1]
    crate = f"webview2-com-sys {package['version']}"
    users = [f"WebView2 SDK {sdk} loader (Windows builds, {crate})"]
    text = (CONFIG / "webview2-sdk.txt").read_text(encoding="utf-8").strip()
    return ("BSD 3-Clause License", users, text)


def allowed(expression, permitted):
    """An expression joined only by OR passes when one licence is permitted; any
    other expression needs every licence it names to be permitted."""
    expression = re.sub(r"\s+WITH\s+", "_WITH_", expression)
    names = [
        n.replace("_WITH_", " WITH ")
        for n in re.findall(r"[\w.+-]+", expression)
        if n not in ("OR", "AND")
    ]
    if " OR " in expression and " AND " not in expression:
        return any(n in permitted for n in names)
    return all(n in permitted for n in names)


def permitted_licences():
    """src-tauri/deny.toml's allow list, which about.toml must repeat for cargo-about."""
    deny = tomllib.loads((ROOT / "src-tauri/deny.toml").read_text(encoding="utf-8"))
    about = tomllib.loads((CONFIG / "about.toml").read_text(encoding="utf-8"))
    permitted = set(deny["licenses"]["allow"])
    if set(about["accepted"]) != permitted:
        sys.exit(
            "scripts/third-party/about.toml and src-tauri/deny.toml "
            "allow different licences"
        )
    return permitted


def npm_sections():
    permitted = permitted_licences()
    listing = json.loads(run("pnpm", "licenses", "list", "--prod", "--json"))
    texts = {}
    for license_name, packages in listing.items():
        if not allowed(license_name, permitted):
            names = ", ".join(p["name"] for p in packages)
            sys.exit(f"{names}: {license_name} is not allowed by deny.toml")
        for package in packages:
            for version, path in zip(package["versions"], package["paths"]):
                folder = Path(path)
                files = sorted(
                    f
                    for f in folder.iterdir()
                    if f.is_file() and f.name.upper().startswith(LICENSE_NAMES)
                )
                if not files:
                    sys.exit(f"{package['name']} {version} ships no licence file")
                text = "\n\n".join(f.read_text(encoding="utf-8").strip() for f in files)
                key = (license_name, text)
                texts.setdefault(key, []).append(f"{package['name']} {version}")
    return sorted((name, sorted(users), text) for (name, text), users in texts.items())


def render():
    metadata = cargo_metadata()
    members = set(metadata["workspace_members"])
    own = {
        p["name"]
        for p in metadata["packages"]
        if p["id"] in members or (p["source"] or "").startswith(OWN_SOURCE)
    }
    sections = [
        libusb_section(package(metadata, "libusb1-sys")),
        webview2_section(package(metadata, "webview2-com-sys")),
        *rust_sections(own),
        *npm_sections(),
    ]
    parts = [
        (
            "Third-party software in the RepriseOS Installer desktop app.\n"
            "Generated by scripts/third_party.py; do not edit by hand.\n"
        )
    ]
    for name, users, text in sections:
        parts.append(f"{RULE}\n{name}\nUsed by: {', '.join(users)}\n\n{tidy(text)}\n")
    return "\n".join(parts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true", help="fail if the file is out of date"
    )
    args = parser.parse_args()
    text = render()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != text:
            sys.exit(
                f"{OUTPUT.relative_to(ROOT)} is out of date; "
                "run python3 scripts/third_party.py"
            )
        return
    OUTPUT.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
