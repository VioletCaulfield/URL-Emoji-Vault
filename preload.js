// A small security bridge. The visible pages can use only the approved functions listed here,
// instead of getting direct access to Node.js or the operating system.


"use strict";

// Electron tools used to create a safe bridge from the page to the main process.
const { contextBridge, ipcRenderer } = require("electron");

// Only the approved functions below are exposed to page JavaScript.
contextBridge.exposeInMainWorld("emojiVault", {
  openManager: () => ipcRenderer.send("open-manager"),
  openHotkeys: () => ipcRenderer.send("open-hotkeys"),

  getEmojis: () => ipcRenderer.invoke("get-emojis"),
  getHotkeys: () => ipcRenderer.invoke("get-hotkeys"),
  saveHotkey: assignment => ipcRenderer.invoke("save-hotkey", assignment),
  removeHotkey: accelerator => ipcRenderer.invoke(
    "remove-hotkey",
    accelerator
  )
});
