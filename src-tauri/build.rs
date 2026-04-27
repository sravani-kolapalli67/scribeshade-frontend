fn main() {
    // On macOS, screencapturekit-rs compiles Swift code that links against the
    // Swift runtime (libswift_Concurrency.dylib, libswiftCore.dylib, etc.).
    // At runtime the dynamic linker looks in the binary's rpath for these dylibs.
    // We embed the Xcode Swift stdlib path as an rpath so the linker can find them.
    #[cfg(target_os = "macos")]
    {
        // Resolve the active Xcode developer directory (respects xcode-select).
        let dev_dir = std::process::Command::new("xcode-select")
            .arg("-p")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .unwrap_or_default();
        let dev_dir = dev_dir.trim();

        if !dev_dir.is_empty() {
            // Toolchain Swift stdlib path (regular, non-back-deployment).
            let toolchain_swift = format!(
                "{}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/macosx",
                dev_dir
            );
            // swift-5.5/ back-deployment shims — this is where
            // libswift_Concurrency.dylib lives when it isn't yet in the OS cache.
            let toolchain_swift55 = format!(
                "{}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-5.5/macosx",
                dev_dir
            );
            // Platform SDK Swift libs (sometimes needed for Concurrency overlay).
            let sdk_swift = format!(
                "{}/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk/usr/lib/swift",
                dev_dir
            );

            println!("cargo:rustc-link-arg=-Wl,-rpath,{}", toolchain_swift);
            println!("cargo:rustc-link-arg=-Wl,-rpath,{}", toolchain_swift55);
            println!("cargo:rustc-link-arg=-Wl,-rpath,{}", sdk_swift);
            // /usr/lib/swift is the pre-installed system location (macOS 12.3+)
            println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
        }
    }

    tauri_build::build()
}
