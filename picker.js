// Code for the compact tray picker: database access, searching, category buttons,
// emoji tiles, and saved appearance settings.


"use strict";

const DB_NAME = "EmojiVaultDB";
const STORE_NAME = "emojis";
const DB_VERSION = 1;

const sections = document.getElementById("emojiSections");
const searchInput = document.getElementById("searchInput");
const categoryNav = document.getElementById("categoryNav");
const statusMessage = document.getElementById("statusMessage");

let db;
let emojis = [];
let selectedCategory = "__all";

// Appearance preferences are saved locally so they survive app restarts.
const appearanceDefaults = { theme: "violet", opacity: 92 };
const themeColours = {
  violet: { accent: "#8F00FF", hover: "#A020F0", background: "26, 17, 38", panel: "40, 27, 56", panelHover: "57, 36, 78", border: "76, 49, 100" },
  ocean:  { accent: "#3b82f6", hover: "#60a5fa", background: "15, 24, 42", panel: "24, 39, 62", panelHover: "35, 58, 89", border: "48, 69, 99" },
  mint:   { accent: "#10b981", hover: "#34d399", background: "15, 31, 30", panel: "25, 46, 43", panelHover: "35, 67, 60", border: "48, 78, 69" },
  rose:   { accent: "#ec4899", hover: "#f472b6", background: "35, 22, 32", panel: "49, 30, 44", panelHover: "73, 39, 61", border: "83, 49, 69" },
  amber:  { accent: "#f59e0b", hover: "#fbbf24", background: "34, 28, 18", panel: "49, 40, 25", panelHover: "72, 57, 32", border: "83, 68, 43" }
};

function loadAppearance() {
  try {
    return { ...appearanceDefaults, ...JSON.parse(localStorage.getItem("emojiVaultAppearance") || "{}") };
  } catch {
    return { ...appearanceDefaults };
  }
}

function applyAppearance(preferences) {
  const theme = themeColours[preferences.theme] ? preferences.theme : "violet";
  const opacity = Math.min(100, Math.max(65, Number(preferences.opacity) || 92));
  const colours = themeColours[theme];
  const root = document.documentElement;
  root.style.setProperty("--accent", colours.accent);
  root.style.setProperty("--accent-hover", colours.hover);
  root.style.setProperty("--background", `rgb(${colours.background})`);
  root.style.setProperty("--panel", `rgb(${colours.panel})`);
  root.style.setProperty("--panel-hover", `rgb(${colours.panelHover})`);
  root.style.setProperty("--border", `rgb(${colours.border})`);
  root.style.setProperty("--panel-opacity", String(opacity / 100));
  root.style.setProperty("--window-bg", `rgba(${colours.background}, ${opacity / 100})`);
  root.style.setProperty("--panel-bg", `rgba(${colours.panel}, ${opacity / 100})`);
  root.style.setProperty("--hover-bg", `rgba(${colours.panelHover}, ${opacity / 100})`);
  document.getElementById("themeSelect").value = theme;
  document.getElementById("opacityRange").value = String(opacity);
  document.getElementById("opacityValue").textContent = `${opacity}%`;
}

let appearance = loadAppearance();

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true
        });
      }
    };
  });
}

function loadEmojis() {
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function showStatus(message) {
  statusMessage.textContent = message;
}

function makeButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className;
  button.addEventListener("click", onClick);
  return button;
}

function renderCategories() {
  const currentQuery = searchInput.value.trim().toLowerCase();

  const filtered = emojis.filter(emoji => {
    const matchesSearch = [
      emoji.name,
      emoji.category,
      emoji.url
    ].some(value => String(value || "").toLowerCase().includes(currentQuery));

    const matchesCategory =
      selectedCategory === "__all" ||
      (selectedCategory === "__favourites" && emoji.favourite) ||
      (selectedCategory !== "__favourites" &&
        selectedCategory !== "__all" &&
        (emoji.category || "Uncategorised") === selectedCategory);

    return matchesSearch && matchesCategory;
  });

  const categoryNames = [
    "Frequently Used",
    ...new Set(emojis.map(emoji => emoji.category || "Uncategorised"))
  ];

  const groups = new Map();

  if (selectedCategory === "__all") {
    groups.set("Frequently Used", filtered
      .filter(emoji => emoji.usageCount > 0)
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, 18));

    for (const category of categoryNames.slice(1)) {
      groups.set(category, filtered.filter(
        emoji => (emoji.category || "Uncategorised") === category
      ));
    }
  } else {
    groups.set(
      selectedCategory === "__favourites"
        ? "Favourites"
        : selectedCategory,
      filtered
    );
  }

  sections.replaceChildren();

  let displayed = 0;

  for (const [category, items] of groups) {
    if (items.length === 0) continue;

    displayed += items.length;

    const section = document.createElement("section");
    section.className = "category-section";

    const heading = document.createElement("h2");
    heading.className = "category-title";
    heading.textContent = category;

    const grid = document.createElement("div");
    grid.className = "emoji-grid";

    for (const emoji of items) {
      const tile = makeButton(
        "",
        "emoji-tile",
        () => copyEmoji(emoji)
      );

      tile.title = `${emoji.name} — click to copy link`;
      tile.setAttribute("aria-label", `Copy link for ${emoji.name}`);

      const image = document.createElement("img");
      image.src = emoji.url;
      image.alt = emoji.name;
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";

      image.addEventListener("error", () => {
        tile.textContent = "⚠";
        tile.title = `${emoji.name}: image unavailable`;
      }, { once: true });

      tile.append(image);
      grid.append(tile);
    }

    section.append(heading, grid);
    sections.append(section);
  }

  if (displayed === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = searchInput.value
      ? "No emojis found."
      : "No emojis in this category yet.";
    sections.append(empty);
  }
}

function renderCategoryButtons() {
  categoryNav.replaceChildren();

  const categories = [
    { label: "All", value: "__all" },
    { label: "♥ Favourites", value: "__favourites" },
    ...[...new Set(emojis.map(
      emoji => emoji.category || "Uncategorised"
    ))].map(category => ({
      label: category,
      value: category
    }))
  ];

  for (const category of categories) {
    const button = makeButton(
      category.label,
      "category-button" +
        (selectedCategory === category.value ? " active" : ""),
      () => {
        selectedCategory = category.value;
        renderCategoryButtons();
        renderCategories();
      }
    );

    button.dataset.category = category.value;
    categoryNav.append(button);
  }
}

async function copyEmoji(emoji) {
  try {
    await navigator.clipboard.writeText(emoji.url);

    showStatus(`Copied ${emoji.name}! Paste with Ctrl+V.`);

    // Update usage statistics for the Frequently Used section.
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(emoji.id);

    request.onsuccess = () => {
      if (!request.result) return;

      const record = request.result;
      record.usageCount = (record.usageCount || 0) + 1;
      record.lastUsedAt = Date.now();
      store.put(record);
    };

    transaction.oncomplete = async () => {
      await refresh();
    };
  } catch (error) {
    showStatus("Couldn't copy link. " + error.message);
  }
}

async function refresh() {
  emojis = await loadEmojis();
  renderCategoryButtons();
  renderCategories();
}

document.getElementById("refreshButton").addEventListener("click", async () => {
  const button = document.getElementById("refreshButton");
  button.classList.add("is-refreshing");
  try {
    await refresh();
    showStatus("Emojis refreshed");
  } catch (error) {
    showStatus("Refresh failed: " + error.message);
  } finally {
    window.setTimeout(() => button.classList.remove("is-refreshing"), 250);
  }
});

// Open and close the appearance controls from the small sun/palette button.
const appearancePanel = document.getElementById("appearancePanel");
document.getElementById("appearanceButton").addEventListener("click", () => {
  appearancePanel.hidden = !appearancePanel.hidden;
});
document.getElementById("closeAppearanceButton").addEventListener("click", () => {
  appearancePanel.hidden = true;
});

function saveAppearance() {
  appearance = {
    theme: document.getElementById("themeSelect").value,
    opacity: Number(document.getElementById("opacityRange").value)
  };
  applyAppearance(appearance);
  localStorage.setItem("emojiVaultAppearance", JSON.stringify(appearance));
}

document.getElementById("themeSelect").addEventListener("change", saveAppearance);
document.getElementById("opacityRange").addEventListener("input", saveAppearance);

// Apply saved colours and opacity before loading the emoji collection.
applyAppearance(appearance);

searchInput.addEventListener("input", renderCategories);

document.getElementById("manageButton").addEventListener("click", () => {
  if (window.emojiVault && window.emojiVault.openManager) {
    window.emojiVault.openManager();
  } else {
    showStatus("Manager integration is not configured yet.");
  }
});

document.getElementById("hotkeysButton").addEventListener("click", () => {
  if (window.emojiVault && window.emojiVault.openHotkeys) {
    window.emojiVault.openHotkeys();
  } else {
    showStatus("Hotkey settings will be added next.");
  }
});

async function start() {
  try {
    db = await openDatabase();
    await refresh();
    showStatus("Ready");
  } catch (error) {
    sections.textContent = "Couldn't load your emoji database.";
    showStatus(error.message);
  }
}

start();
