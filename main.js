"use strict";

// Emoji Vault's Electron main process.
// Think of this as the app's control room: it creates windows, the tray, global shortcuts,
// and the safe communication routes between the different windows.

// Electron's main process controls windows, the system tray, global
// keyboard shortcuts, and the small JSON file used to save assignments.

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  globalShortcut,
  ipcMain,
  screen,
  clipboard
} = require("electron");

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

// ---------- Windows-native automatic paste ----------

// Send Ctrl+V using the Windows SendInput API.
// Unlike PowerShell SendKeys, this injects keyboard events into the system's
// normal input stream. The hidden PowerShell process should not take focus.
function sendWindowsPasteKeystroke() {
  if (process.platform !== "win32") {
    console.warn("Automatic paste is only configured for Windows.");
    return;
  }

  // This script contains no user-provided text, so the command is fixed and safe.
  // SendInput flags: KEYEVENTF_KEYUP = 0x0002.
  const powershellScript = String.raw`$source = @'
using System;
using System.Runtime.InteropServices;
public static class EmojiVaultInput {
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT { public uint type; public InputUnion U; }
  [StructLayout(LayoutKind.Explicit)]
  public struct InputUnion {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
  }
  // Include MOUSEINPUT so the INPUT union has the correct Windows-native size
  // on both 32-bit and 64-bit Windows.
  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT {
    public int dx; public int dy; public uint mouseData; public uint dwFlags;
    public uint time; public IntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public ushort wVk; public ushort wScan; public uint dwFlags;
    public uint time; public IntPtr dwExtraInfo;
  }
  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  public static void Paste() {
    // Virtual-key codes: Ctrl = 0x11, V = 0x56. Release keys in reverse order.
    INPUT[] inputs = new INPUT[4];
    inputs[0].type = 1; inputs[0].U.ki.wVk = 0x11;
    inputs[1].type = 1; inputs[1].U.ki.wVk = 0x56;
    inputs[2].type = 1; inputs[2].U.ki.wVk = 0x56; inputs[2].U.ki.dwFlags = 0x0002;
    inputs[3].type = 1; inputs[3].U.ki.wVk = 0x11; inputs[3].U.ki.dwFlags = 0x0002;
    SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
  }
}
'@;
Add-Type -TypeDefinition $source -ErrorAction Stop;
[EmojiVaultInput]::Paste()`;

  // windowsHide prevents a console window flashing over the application the
  // user is typing in. The clipboard is written before this function is called.
  execFile(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-WindowStyle", "Hidden",
      "-Command", powershellScript
    ],
    { windowsHide: true },
    error => {
      if (error) {
        console.error("Could not send the automatic Ctrl+V keystroke:", error);
      }
    }
  );
}

// ---------- Discord CDN URL sizing ----------

// Discord's CDN supports a size query parameter for emoji image URLs.
// Force it to 48 while preserving other parameters such as animated=true.
// URLs from other hosts are deliberately left unchanged.
function getEmojiUrlForPaste(originalUrl) {
  if (typeof originalUrl !== "string" || !originalUrl.trim()) {
    return originalUrl;
  }

  try {
    const parsedUrl = new URL(originalUrl);

    // Only modify emoji image URLs hosted on Discord's official CDN.
    if (
      parsedUrl.protocol === "https:" &&
      parsedUrl.hostname === "cdn.discordapp.com" &&
      /^\/emojis\/[^/]+\.(?:png|webp|gif|jpg|jpeg)$/i.test(parsedUrl.pathname)
    ) {
      parsedUrl.searchParams.set("size", "48");
      return parsedUrl.toString();
    }
  } catch (error) {
    // If a saved URL is malformed, leave it untouched rather than crashing
    // the global-hotkey handler.
    console.warn("Could not adjust emoji URL size:", error);
  }

  return originalUrl;
}

// Copy first, then give Windows a brief moment before sending Ctrl+V.
// This does not force focus into Emoji Vault; the keystroke goes to whichever
// application is in the foreground when Windows processes the input.
function pasteEmojiIntoActiveApp(url) {
  if (typeof url !== "string" || !url.trim()) {
    return;
  }

  // Normalise Discord CDN emoji links to size=48 immediately before pasting.
  const urlToPaste = getEmojiUrlForPaste(url);
  clipboard.writeText(urlToPaste);
  setTimeout(sendWindowsPasteKeystroke, 60);
}

// Keep references to windows and the tray so JavaScript's garbage collector
// doesn't accidentally remove them while the app is running.
let mainWindow = null;
let pickerWindow = null;
let hotkeysWindow = null;
let tray = null;
let quitting = false;

// Hotkey assignments are stored outside the project folder, in the user's
// application-data directory. That means they survive app updates.
let hotkeyAssignments = [];
const hotkeysFile = path.join(app.getPath("userData"), "hotkeys.json");

// ---------- Main emoji manager window ----------

function createManager() {
  // Reuse the existing manager if it is already open.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 760,
    minHeight: 560,
    title: "Emoji Vault",
    icon: path.join(__dirname, "assets", "app.ico"),
    // The full manager remains an ordinary opaque window. Only the compact
    // tray picker uses native window transparency and adjustable panel opacity.
    backgroundColor: "#171923",
    transparent: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  // Keep the manager's visual theme in sync with the preferences saved by the picker.
  // The page reads the same localStorage origin because both windows load local files.
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.executeJavaScript(`
      (() => {
        const palettes = {
          // Keep these palettes aligned with the compact picker's appearance settings.
          violet: { accent: "#8F00FF", hover: "#A020F0", bg: "26,17,38", panel: "40,27,56", light: "57,36,78", border: "76,49,100" },
          ocean: { accent: "#3b82f6", hover: "#60a5fa", bg: "15,24,42", panel: "24,39,62", light: "35,58,89", border: "48,69,99" },
          mint: { accent: "#10b981", hover: "#34d399", bg: "15,31,30", panel: "25,46,43", light: "35,67,60", border: "48,78,69" },
          rose: { accent: "#ec4899", hover: "#f472b6", bg: "35,22,32", panel: "49,30,44", light: "73,39,61", border: "83,49,69" },
          amber: { accent: "#f59e0b", hover: "#fbbf24", bg: "34,28,18", panel: "49,40,25", light: "72,57,32", border: "83,68,43" }
        };
        let last = "";
        const apply = () => {
          let prefs = {};
          try { prefs = JSON.parse(localStorage.getItem("emojiVaultAppearance") || "{}"); } catch {}
          const p = palettes[prefs.theme] || palettes.violet;
          const signature = JSON.stringify([prefs.theme, prefs.opacity]);
          if (signature === last) return;
          last = signature;
          const root = document.documentElement;
          // The manager follows the selected colour theme, but deliberately
          // stays fully opaque. The picker's opacity slider affects only the
          // compact popup, not this full-size collection window.
          root.style.setProperty("--panel-opacity", "1");
          root.style.setProperty("--background", "rgb(" + p.bg + ")");
          root.style.setProperty("--panel", "rgb(" + p.panel + ")");
          root.style.setProperty("--panel-light", "rgb(" + p.light + ")");
          root.style.setProperty("--border", "rgb(" + p.border + ")");
          root.style.setProperty("--accent", p.accent);
          root.style.setProperty("--accent-hover", p.hover);
          document.body.style.backgroundColor = "var(--background)";
          document.querySelectorAll(".sidebar").forEach(el => el.style.backgroundColor = "var(--background)");
          document.querySelectorAll(".nav-button.active").forEach(el => el.style.backgroundColor = p.accent);
        };
        apply();
        window.setInterval(apply, 500);
      })();
    `).catch(error => console.warn("Could not sync manager appearance:", error));
  });

  // Closing the manager hides it rather than quitting the tray app.
  mainWindow.on("close", event => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------- Compact tray picker window ----------

function createPicker() {
  // Don't create a second picker if one already exists.
  if (pickerWindow && !pickerWindow.isDestroyed()) {
    return;
  }

  pickerWindow = new BrowserWindow({
    width: 340,
    height: 560,
    minWidth: 280,
    minHeight: 350,
    title: "Emoji Vault Picker",
    // Transparent native window lets the picker's CSS draw the translucent panel.
    backgroundColor: "#00000000",
    transparent: true,
    show: false,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  pickerWindow.loadFile(path.join(__dirname, "picker.html"));

  // Hide the popup when it loses focus, like a normal tray popup.
  pickerWindow.on("blur", () => {
    if (pickerWindow && pickerWindow.isVisible()) {
      pickerWindow.hide();
    }
  });

  pickerWindow.on("closed", () => {
    pickerWindow = null;
  });
}

// Position the picker at the bottom-right of the primary display and show it.
function showPicker() {
  if (!pickerWindow || pickerWindow.isDestroyed()) {
    createPicker();
  }

  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const bounds = pickerWindow.getBounds();

  pickerWindow.setPosition(
    area.x + area.width - bounds.width - 12,
    area.y + area.height - bounds.height - 12
  );

  pickerWindow.show();
  pickerWindow.focus();
}

// Clicking the tray icon or pressing the app's picker shortcut toggles it.
function togglePicker() {
  if (pickerWindow && pickerWindow.isVisible()) {
    pickerWindow.hide();
  } else {
    showPicker();
  }
}

// ---------- Hotkey settings window ----------

function createHotkeysWindow() {
  // Reuse the settings window if it is already open.
  if (hotkeysWindow && !hotkeysWindow.isDestroyed()) {
    hotkeysWindow.show();
    hotkeysWindow.focus();
    return;
  }

  hotkeysWindow = new BrowserWindow({
    width: 700,
    height: 650,
    minWidth: 400,
    minHeight: 450,
    title: "Emoji Vault - Hotkeys",
    icon: path.join(__dirname, "assets", "app.ico"),
    backgroundColor: "#171923",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  hotkeysWindow.loadFile(path.join(__dirname, "hotkeys.html"));

  hotkeysWindow.on("closed", () => {
    hotkeysWindow = null;
  });
}


 // ---------- System tray ----------

function createTray() {
  // Load the real Emoji Vault icon from the assets folder.
  const trayIconPath = path.join(__dirname, "assets", "app.ico");
  const trayIcon = nativeImage.createFromPath(trayIconPath);

  // Create the system tray icon.
  tray = new Tray(trayIcon);
  tray.setToolTip("Emoji Vault");

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "Open Emoji Picker",
      click: togglePicker
    },
    {
      label: "Manage Emojis",
      click: createManager
    },
    {
      label: "Hotkey Settings",
      click: createHotkeysWindow
    },
    { type: "separator" },
    {
      label: "Quit Emoji Vault",
      click: () => {
        quitting = true;
        app.quit();
      }
    }
  ]));

  // A normal left-click opens or hides the compact picker.
  tray.on("click", togglePicker);
}

// ---------- Persistent hotkey assignments ----------

function loadHotkeys() {
  try {
    const contents = fs.readFileSync(hotkeysFile, "utf8");
    const parsed = JSON.parse(contents);

    // Ignore a malformed backup/file instead of crashing the whole app.
    hotkeyAssignments = Array.isArray(parsed) ? parsed : [];
  } catch {
    // The file doesn't exist on first launch, which is completely normal.
    hotkeyAssignments = [];
  }
}

function persistHotkeys() {
  // Ensure the parent directory exists before writing the JSON file.
  fs.mkdirSync(path.dirname(hotkeysFile), { recursive: true });
  fs.writeFileSync(
    hotkeysFile,
    JSON.stringify(hotkeyAssignments, null, 2),
    "utf8"
  );
}

// Register each saved shortcut. The callback copies its assigned URL.
function registerAssignedHotkeys() {
  for (const item of hotkeyAssignments) {
    if (!item || typeof item.accelerator !== "string" ||
        typeof item.url !== "string") {
      continue;
    }

    const registered = globalShortcut.register(item.accelerator, () => {
      pasteEmojiIntoActiveApp(item.url);
    });

    if (!registered) {
      console.warn(`Could not register shortcut: ${item.accelerator}`);
    }
  }
}

// ---------- Read the emoji records from the picker's IndexedDB ----------

// IndexedDB belongs to a renderer page, not directly to the main process.
// We ask the picker page to read its existing database so we don't create a
// second database or accidentally lose the user's saved emoji collection.
async function getEmojiRecords() {
  if (!pickerWindow || pickerWindow.isDestroyed()) {
    createPicker();
  }

  // Wait for picker.html to finish loading before running JavaScript in it.
  if (pickerWindow.webContents.isLoading()) {
    await new Promise(resolve => {
      pickerWindow.webContents.once("did-finish-load", resolve);
    });
  }

  return pickerWindow.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const request = indexedDB.open("EmojiVaultDB", 1);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        const database = request.result;

        if (!database.objectStoreNames.contains("emojis")) {
          resolve([]);
          return;
        }

        const read = database
          .transaction("emojis", "readonly")
          .objectStore("emojis")
          .getAll();

        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      };
    })
  `);
}

// ---------- IPC: messages from the safe preload bridge ----------

// These handlers let the settings page request data and save assignments
// without granting the page direct access to Node.js or the operating system.
function registerIpcHandlers() {
  ipcMain.on("open-manager", () => createManager());
  ipcMain.on("open-hotkeys", () => createHotkeysWindow());

  ipcMain.handle("get-emojis", async () => {
    try {
      return await getEmojiRecords();
    } catch (error) {
      console.error("Could not read emoji database:", error);
      return [];
    }
  });

  ipcMain.handle("get-hotkeys", () => hotkeyAssignments);

  ipcMain.handle("save-hotkey", (_event, assignment) => {
    // Check the values coming from the settings page before using them.
    if (
      !assignment ||
      typeof assignment.name !== "string" ||
      typeof assignment.url !== "string" ||
      !Number.isInteger(assignment.emojiId) ||
      typeof assignment.accelerator !== "string" ||
      !assignment.accelerator.trim()
    ) {
      return { ok: false, error: "Invalid shortcut details." };
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(assignment.url);
    } catch {
      return { ok: false, error: "The emoji URL is invalid." };
    }

    // Only allow normal web image URLs, not javascript: or other schemes.
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return { ok: false, error: "Emoji URLs must start with HTTP or HTTPS." };
    }

    const accelerator = assignment.accelerator;

    // Prevent two emojis from using the same shortcut.
    const conflict = hotkeyAssignments.find(item =>
      item.accelerator === accelerator &&
      item.emojiId !== assignment.emojiId
    );

    if (conflict) {
      return {
        ok: false,
        error: "That shortcut is already assigned to another emoji."
      };
    }

    const previous = hotkeyAssignments.find(
      item => item.emojiId === assignment.emojiId
    );

    // If this emoji already had a shortcut, temporarily release it.
    if (previous) {
      globalShortcut.unregister(previous.accelerator);
    }

    // Register the new global shortcut with Electron.
    const registered = globalShortcut.register(accelerator, () => {
      pasteEmojiIntoActiveApp(assignment.url);
    });

    if (!registered) {
      // If the new shortcut fails, restore the previous assignment.
      if (previous) {
        globalShortcut.register(previous.accelerator, () => {
          pasteEmojiIntoActiveApp(previous.url);
        });
      }

      return {
        ok: false,
        error: "Windows could not register that shortcut. It may already be in use."
      };
    }

    // Replace the old record for this emoji and save the new one.
    const cleanAssignment = {
      emojiId: assignment.emojiId,
      name: assignment.name.slice(0, 60),
      url: assignment.url,
      accelerator
    };

    hotkeyAssignments = hotkeyAssignments.filter(
      item => item.emojiId !== cleanAssignment.emojiId
    );

    hotkeyAssignments.push(cleanAssignment);
    persistHotkeys();

    return { ok: true };
  });

  ipcMain.handle("remove-hotkey", (_event, accelerator) => {
    if (typeof accelerator !== "string") {
      return { ok: false, error: "Invalid shortcut." };
    }

    const existing = hotkeyAssignments.find(
      item => item.accelerator === accelerator
    );

    if (!existing) {
      return { ok: false, error: "Shortcut not found." };
    }

    globalShortcut.unregister(existing.accelerator);

    hotkeyAssignments = hotkeyAssignments.filter(
      item => item.accelerator !== accelerator
    );

    persistHotkeys();
    return { ok: true };
  });
}

// ---------- App startup and shutdown ----------

// Start the app after Electron is ready. Set up communication and restore shortcuts before opening windows.
app.whenReady().then(() => {
  // Register IPC before opening windows so their pages can call it safely.
  registerIpcHandlers();

  // Restore the user's saved shortcuts before displaying the app.
  loadHotkeys();
  registerAssignedHotkeys();

  createPicker();
  createTray();

  // Global shortcut to show/hide the compact picker.
  const registered = globalShortcut.register(
    "CommandOrControl+Shift+E",
    togglePicker
  );

  if (!registered) {
    console.warn("The picker shortcut Ctrl+Shift+E could not be registered.");
  }
});

app.on("before-quit", () => {
  // Allow all windows to close when Windows or the installer
  // asks Emoji Vault to quit.
  quitting = true;
});

app.on("will-quit", () => {
  // Always release registered shortcuts when the app quits.
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  // Deliberately do not quit: Emoji Vault is designed to live in the tray.
});
