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
      const yes = await ask(
        `Version ${update.version} is available!\n\nRelease notes:\n${update.body ?? "No notes provided."}`,
        {
          title: "Update Available",
          okLabel: "Update Now",
          cancelLabel: "Later",
        },
      );
      if (yes) {
        await update.downloadAndInstall();
        await relaunch();
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
