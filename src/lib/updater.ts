import { isTauri } from "@/lib/utils";

/**
 * Check for app updates via the Tauri updater plugin.
 *
 * @param onUserClick  Pass `true` when triggered by a manual "Check for
 *                     updates" button — shows a "you're up to date" message
 *                     when no update is found.  Pass `false` (default) for
 *                     the silent background check on app launch.
 */
export async function checkForUpdates(onUserClick = false) {
  if (!isTauri()) return;

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const { ask, message } = await import("@tauri-apps/plugin-dialog");
    const { relaunch } = await import("@tauri-apps/plugin-process");

    const update = await check();

    if (update === null) {
      if (onUserClick) {
        await message("Failed to check for updates. Try again later.", {
          title: "Error",
          kind: "error",
        });
      }
      return;
    }

    if (update.available) {
      if (onUserClick) {
        // Manual user flow: Prompt before download
        const yes = await ask(
          `Version ${update.version} is available!\n\nRelease notes:\n${update.body ?? "No notes provided."}\n\nWould you like to download, install, and restart ScribeShade now?`,
          {
            title: "Update Available",
            okLabel: "Update & Restart",
            cancelLabel: "Later",
          },
        );
        if (yes) {
          await update.downloadAndInstall();
          await relaunch();
        }
      } else {
        // Silent background flow: Download and install first, then prompt to relaunch
        console.log(`[updater] Silent update available: v${update.version}. Downloading in background...`);
        
        await update.downloadAndInstall();
        
        console.log(`[updater] Silent update installed. Prompting for relaunch.`);
        
        const restartNow = await ask(
          `A new update (v${update.version}) has been downloaded and installed successfully.\n\nWould you like to restart ScribeShade now to apply the changes?`,
          {
            title: "Update Installed",
            okLabel: "Restart Now",
            cancelLabel: "Later",
          }
        );
        
        if (restartNow) {
          await relaunch();
        }
      }
    } else if (onUserClick) {
      await message("You are on the latest version!", {
        title: "Up to Date",
        kind: "info",
      });
    }
  } catch (err) {
    // Non-fatal — silently log; don't disrupt the user on launch
    console.warn("[updater] check failed:", err);
  }
}
