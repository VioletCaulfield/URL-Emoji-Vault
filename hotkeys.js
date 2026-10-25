
"use strict";

// Emoji Vault Hotkey Settings.
// This page lets you choose an emoji, record a keyboard shortcut,
// save it, and remove shortcuts you no longer want.


const emojiSelect = document.getElementById("emojiSelect");
const shortcutInput = document.getElementById("shortcutInput");
const shortcutList = document.getElementById("shortcutList");
const status = document.getElementById("status");

let emojis = [];
let hotkeys = [];
let recordedAccelerator = "";

// Show a short message so the user knows whether an action worked.
function showStatus(message, error = false) {
  status.textContent = message;
  status.style.color = error ? "#ff7777" : "#8ce4b7";
}

// Turn the key the user pressed (plus any Ctrl/Alt/Shift keys) into
// the shortcut format Electron expects, such as Control+Alt+1.
function acceleratorFromEvent(event) {
  const parts = [];

  if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Super");

  const key = event.key;

  if (
    ["Control", "Alt", "Shift", "Meta"].includes(key) ||
    key === "Dead" ||
    key === "Process"
  ) {
    return "";
  }

  let keyName;

  if (/^[a-z]$/i.test(key)) {
    keyName = key.toUpperCase();
  } else if (/^[0-9]$/.test(key)) {
    keyName = key;
  } else {
    const keys = {
      " ": "Space",
      ArrowUp: "Up",
      ArrowDown: "Down",
      ArrowLeft: "Left",
      ArrowRight: "Right",
      Escape: "Esc",
      Delete: "Delete",
      Backspace: "Backspace",
      Enter: "Enter",
      Tab: "Tab",
      ",": "Comma",
      ".": "Period",
      "/": "Slash",
      "\\": "Backslash",
      "-": "Minus",
      "=": "Plus"
    };

    keyName = keys[key];

    if (/^F([1-9]|1[0-2])$/.test(key)) {
      keyName = key;
    }
  }

  if (!keyName) return "";

  // Global shortcuts should include a modifier to reduce conflicts.
  if (parts.length === 0) return "";

  parts.push(keyName);
  return parts.join("+");
}

// Clicking the field puts it into recording mode so the next key combo is captured.
shortcutInput.addEventListener("click", () => {
  recordedAccelerator = "";
  shortcutInput.value = "Press your shortcut...";
  shortcutInput.classList.add("recording");
  shortcutInput.focus();
});

shortcutInput.addEventListener("keydown", event => {
  event.preventDefault();
  event.stopPropagation();

  if (event.key === "Escape") {
    recordedAccelerator = "";
    shortcutInput.value = "";
    shortcutInput.classList.remove("recording");
    return;
  }

  const accelerator = acceleratorFromEvent(event);

  if (!accelerator) {
    showStatus("Use a key with Ctrl, Alt or Shift.", true);
    return;
  }

  recordedAccelerator = accelerator;
  shortcutInput.value = accelerator.replaceAll("+", " + ");
  shortcutInput.classList.remove("recording");
});

document.getElementById("clearInputButton").addEventListener("click", () => {
  recordedAccelerator = "";
  shortcutInput.value = "";
  shortcutInput.classList.remove("recording");
  showStatus("");
});

// Save the selected emoji and recorded shortcut through the secure preload bridge.
document.getElementById("saveButton").addEventListener("click", async () => {
  const emojiId = Number(emojiSelect.value);

  if (!emojiId || !recordedAccelerator) {
    showStatus("Choose an emoji and record a shortcut first.", true);
    return;
  }

  const emoji = emojis.find(item => item.id === emojiId);

  if (!emoji) {
    showStatus("That emoji could not be found. Refresh and try again.", true);
    return;
  }

  try {
    const result = await window.emojiVault.saveHotkey({
      emojiId: emoji.id,
      name: emoji.name,
      url: emoji.url,
      accelerator: recordedAccelerator
    });

    if (!result.ok) {
      showStatus(result.error || "Could not register shortcut.", true);
      return;
    }

    hotkeys = await window.emojiVault.getHotkeys();
    renderHotkeys();
    showStatus(`Saved ${recordedAccelerator} for ${emoji.name}.`);
    recordedAccelerator = "";
    shortcutInput.value = "";
  } catch (error) {
    showStatus(error.message, true);
  }
});

// Ask the main process to remove this shortcut, then refresh the displayed list.
async function removeHotkey(accelerator) {
  const result = await window.emojiVault.removeHotkey(accelerator);

  if (!result.ok) {
    showStatus(result.error || "Couldn't remove shortcut.", true);
    return;
  }

  hotkeys = await window.emojiVault.getHotkeys();
  renderHotkeys();
  showStatus("Shortcut removed.");
}

// Rebuild the list of saved shortcuts from the latest hotkeys array.
function renderHotkeys() {
  shortcutList.replaceChildren();

  if (hotkeys.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No shortcuts assigned yet.";
    shortcutList.append(empty);
    return;
  }

  for (const item of hotkeys) {
    const row = document.createElement("div");
    row.className = "shortcut-row";

    const info = document.createElement("div");
    info.className = "shortcut-info";

    const name = document.createElement("div");
    name.className = "shortcut-name";
    name.textContent = item.name;

    const keys = document.createElement("div");
    keys.className = "shortcut-keys";
    keys.textContent = item.accelerator.replaceAll("+", " + ");

    info.append(name, keys);

    const removeButton = document.createElement("button");
    removeButton.className = "delete";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      removeHotkey(item.accelerator);
    });

    row.append(info, removeButton);
    shortcutList.append(row);
  }
}

// Load the emoji list directly from IndexedDB, then load saved shortcuts.
// (There used to be a second start() above this one. The later version was
// the one JavaScript used, so the duplicate has been removed without changing
// the working startup behaviour.)
// Initialise the page: open the emoji database, fill the dropdown,
// load saved shortcuts, and display them.
async function start() {
  try {
    const request = indexedDB.open("EmojiVaultDB", 1);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains("emojis")) {
        database.createObjectStore("emojis", {
          keyPath: "id",
          autoIncrement: true
        });
      }
    };

    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    emojis = await new Promise((resolve, reject) => {
      const readRequest = database
        .transaction("emojis", "readonly")
        .objectStore("emojis")
        .getAll();

      readRequest.onsuccess = () => resolve(readRequest.result);
      readRequest.onerror = () => reject(readRequest.error);
    });

    emojiSelect.replaceChildren();

    for (const emoji of emojis) {
      const option = document.createElement("option");
      option.value = String(emoji.id);
      option.textContent = emoji.name;
      emojiSelect.append(option);
    }

    hotkeys = await window.emojiVault.getHotkeys();
    renderHotkeys();
  } catch (error) {
    showStatus("Couldn't load settings: " + error.message, true);
  }
}

start();

