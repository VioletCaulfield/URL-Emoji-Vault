// Code for the full-size manager: adding, searching, sorting, favouriting, deleting,
// importing and exporting the emoji collection.


"use strict";

const DB_NAME = "EmojiVaultDB";
const DB_VERSION = 1;
const STORE_NAME = "emojis";

const grid = document.getElementById("emojiGrid");
const form = document.getElementById("emojiForm");
const addPanel = document.getElementById("addPanel");
const bulkPanel = document.getElementById("bulkPanel");
const bulkForm = document.getElementById("bulkForm");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const statusMessage = document.getElementById("statusMessage");
const emojiCount = document.getElementById("emojiCount");
const collectionTitle = document.getElementById("collectionTitle");
const importFile = document.getElementById("importFile");
const categoryManagerPanel = document.getElementById("categoryManagerPanel");
const categoryManagerList = document.getElementById("categoryManagerList");

let db;
let emojis = [];
let favouritesOnly = false;
let messageTimer;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function storeRequest(mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = action(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);

    transaction.onabort = () => reject(
      transaction.error || new Error("Database transaction aborted.")
    );
  });
}

function getAllEmojis() {
  return storeRequest("readonly", store => store.getAll());
}

function saveEmoji(emoji) {
  return storeRequest("readwrite", store => store.add(emoji));
}

function updateEmoji(emoji) {
  return storeRequest("readwrite", store => store.put(emoji));
}

function deleteEmoji(id) {
  return storeRequest("readwrite", store => store.delete(id));
}

function showStatus(message, isError = false) {
  clearTimeout(messageTimer);
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);

  messageTimer = setTimeout(() => {
    statusMessage.textContent = "";
    statusMessage.classList.remove("error");
  }, 4000);
}

function isValidImageUrl(value) {
  try {
    const url = new URL(value);

    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

async function refreshEmojis() {
  emojis = await getAllEmojis();
  renderEmojis();
}

function renderEmojis() {
  const query = searchInput.value.trim().toLowerCase();

  let visible = emojis.filter(emoji => {
    const matchesSearch = [
      emoji.name,
      emoji.category,
      emoji.url
    ].some(value => String(value || "").toLowerCase().includes(query));

    return matchesSearch && (!favouritesOnly || emoji.favourite);
  });

  if (sortSelect.value === "name") {
    visible.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortSelect.value === "oldest") {
    visible.sort((a, b) => a.createdAt - b.createdAt);
  } else {
    visible.sort((a, b) => b.createdAt - a.createdAt);
  }

  collectionTitle.textContent = favouritesOnly
    ? "Favourite Emojis"
    : "All Emojis";

  emojiCount.textContent =
    `${visible.length} ${visible.length === 1 ? "emoji" : "emojis"}`;

  grid.replaceChildren();

  if (visible.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = query
      ? "No emojis match your search."
      : favouritesOnly
        ? "No favourites yet. Star an emoji to save it here."
        : "Your vault is empty. Add your first emoji above!";
    grid.append(empty);
    return;
  }

  for (const emoji of visible) {
    grid.append(createEmojiCard(emoji));
  }
}

function getCategoryNames() {
  return [...new Set(
    emojis.map(emoji => (emoji.category || "").trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function renderCategoryManager() {
  categoryManagerList.replaceChildren();
  const categories = getCategoryNames();

  if (categories.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No named categories yet. Create one from an emoji card.";
    categoryManagerList.append(empty);
    return;
  }

  for (const categoryName of categories) {
    const row = document.createElement("div");
    row.className = "category-manager-row";

    const details = document.createElement("div");
    details.className = "category-manager-details";
    const title = document.createElement("strong");
    title.textContent = categoryName;
    const count = emojis.filter(emoji => (emoji.category || "").trim() === categoryName).length;
    const countText = document.createElement("span");
    countText.className = "muted small";
    countText.textContent = `${count} ${count === 1 ? "emoji" : "emojis"}`;
    details.append(title, countText);

    const actions = document.createElement("div");
    actions.className = "category-manager-actions";
    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.className = "secondary-button";
    renameButton.textContent = "Rename";
    renameButton.addEventListener("click", () => showRenameEditor(row, categoryName));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "secondary-button delete-button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteCategory(categoryName));

    actions.append(renameButton, deleteButton);
    row.append(details, actions);
    categoryManagerList.append(row);
  }
}

function showRenameEditor(row, oldName) {
  const editor = document.createElement("form");
  editor.className = "category-rename-editor";
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 40;
  input.value = oldName;
  input.setAttribute("aria-label", `New name for ${oldName}`);
  input.required = true;
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "primary-button";
  save.textContent = "Save";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary-button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", renderCategoryManager);
  editor.append(input, save, cancel);
  row.replaceChildren(editor);
  input.focus();
  input.select();

  editor.addEventListener("submit", async event => {
    event.preventDefault();
    const newName = input.value.trim().slice(0, 40);
    if (!newName) {
      showStatus("Category names cannot be empty.", true);
      input.focus();
      return;
    }
    if (newName.toLowerCase() === "uncategorised") {
      showStatus("That name is reserved for emojis without a category.", true);
      input.focus();
      return;
    }
    const duplicate = getCategoryNames().some(name => name.toLowerCase() === newName.toLowerCase() && name !== oldName);
    if (duplicate) {
      showStatus("A category with that name already exists.", true);
      input.focus();
      return;
    }
    save.disabled = true;
    try {
      await updateAllCategoryRecords(oldName, newName);
      await refreshEmojis();
      renderCategoryManager();
      showStatus(`Renamed “${oldName}” to “${newName}”.`);
    } catch (error) {
      save.disabled = false;
      showStatus("Couldn't rename category: " + error.message, true);
    }
  });
}

function updateAllCategoryRecords(oldName, newName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      for (const record of request.result) {
        if ((record.category || "").trim() === oldName) {
          record.category = newName;
          store.put(record);
        }
      }
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Category update was cancelled."));
  });
}

async function deleteCategory(categoryName) {
  const count = emojis.filter(emoji => (emoji.category || "").trim() === categoryName).length;
  const confirmed = window.confirm(
    `Delete the category “${categoryName}”?\n\n${count} ${count === 1 ? "emoji will" : "emojis will"} be kept and moved to Uncategorised. This cannot be undone.`
  );
  if (!confirmed) return;

  try {
    await updateAllCategoryRecords(categoryName, "");
    await refreshEmojis();
    renderCategoryManager();
    showStatus(`Deleted “${categoryName}”. Its emojis were kept as Uncategorised.`);
  } catch (error) {
    showStatus("Couldn't delete category: " + error.message, true);
  }
}

function createEmojiCard(emoji) {
  const card = document.createElement("article");
  card.className = "emoji-card";

  const preview = document.createElement("div");
  preview.className = "emoji-preview";

  const image = document.createElement("img");
  image.src = emoji.url;
  image.alt = emoji.name;
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";

  image.addEventListener("error", () => {
    image.remove();
    preview.textContent = "⚠️";
    preview.title = "Image unavailable. Check the saved URL.";
  }, { once: true });

  preview.append(image);

  const info = document.createElement("div");
  info.className = "emoji-info";

  const name = document.createElement("p");
  name.className = "emoji-name";
  name.textContent = emoji.name;

  const category = document.createElement("p");
  category.className = "emoji-category";
  category.textContent = `Category: ${emoji.category || "Uncategorised"}`;

  const categorySelect = document.createElement("select");
  categorySelect.className = "category-select";
  categorySelect.setAttribute("aria-label", `Change category for ${emoji.name}`);

  const categoryNames = [...new Set(
    emojis.map(item => (item.category || "").trim() || "Uncategorised")
  )].sort((a, b) => a.localeCompare(b));

  if (!categoryNames.includes("Uncategorised")) {
    categoryNames.push("Uncategorised");
  }

  for (const categoryName of categoryNames) {
    const option = document.createElement("option");
    option.value = categoryName === "Uncategorised" ? "" : categoryName;
    option.textContent = categoryName;
    categorySelect.append(option);
  }

  const newCategoryOption = document.createElement("option");
  newCategoryOption.value = "__new_category";
  newCategoryOption.textContent = "+ New category…";
  categorySelect.append(newCategoryOption);
  categorySelect.value = (emoji.category || "").trim();

  const newCategoryPanel = document.createElement("div");
  newCategoryPanel.className = "new-category-panel";
  newCategoryPanel.hidden = true;

  const newCategoryInput = document.createElement("input");
  newCategoryInput.type = "text";
  newCategoryInput.maxLength = 40;
  newCategoryInput.placeholder = "New category name";
  newCategoryInput.setAttribute("aria-label", `New category for ${emoji.name}`);

  const saveCategoryButton = document.createElement("button");
  saveCategoryButton.type = "button";
  saveCategoryButton.className = "primary-button";
  saveCategoryButton.textContent = "Save category";

  const cancelCategoryButton = document.createElement("button");
  cancelCategoryButton.type = "button";
  cancelCategoryButton.className = "secondary-button";
  cancelCategoryButton.textContent = "Cancel";

  newCategoryPanel.append(
    newCategoryInput,
    saveCategoryButton,
    cancelCategoryButton
  );

  function closeNewCategoryPanel() {
    newCategoryPanel.hidden = true;
    newCategoryInput.value = "";
    categorySelect.value = previousSavedCategory();
  }

  function previousSavedCategory() {
    return (emoji.category || "").trim();
  }

  categorySelect.addEventListener("change", () => {
    if (categorySelect.value === "__new_category") {
      newCategoryPanel.hidden = false;
      newCategoryInput.focus();
      return;
    }

    newCategoryPanel.hidden = true;
    saveCategory(categorySelect.value);
  });

  async function saveCategory(nextCategory) {
    const previousCategory = (emoji.category || "").trim();

    try {
      emoji.category = nextCategory;
      await updateEmoji(emoji);
      await refreshEmojis();
      if (!categoryManagerPanel.hidden) renderCategoryManager();
      showStatus(
        nextCategory
          ? `Moved ${emoji.name} to “${nextCategory}”.`
          : `Moved ${emoji.name} to Uncategorised.`
      );
    } catch (error) {
      emoji.category = previousCategory;
      categorySelect.value = previousCategory;
      showStatus("Couldn't update category: " + error.message, true);
    }
  }

  saveCategoryButton.addEventListener("click", async () => {
    const nextCategory = newCategoryInput.value.trim().slice(0, 40);

    if (!nextCategory) {
      showStatus("Enter a category name first.", true);
      newCategoryInput.focus();
      return;
    }

    saveCategoryButton.disabled = true;
    try {
      await saveCategory(nextCategory);
    } finally {
      saveCategoryButton.disabled = false;
      newCategoryPanel.hidden = true;
      newCategoryInput.value = "";
    }
  });

  newCategoryInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveCategoryButton.click();
    } else if (event.key === "Escape") {
      newCategoryPanel.hidden = true;
      newCategoryInput.value = "";
      categorySelect.value = previousSavedCategory();
    }
  });

  cancelCategoryButton.addEventListener("click", () => {
    newCategoryPanel.hidden = true;
    newCategoryInput.value = "";
    categorySelect.value = previousSavedCategory();
  });

  info.append(name, category, categorySelect, newCategoryPanel);

  const favouriteButton = document.createElement("button");
  favouriteButton.className = "icon-button favourite-button";
  favouriteButton.classList.toggle("is-favourite", !!emoji.favourite);
  favouriteButton.textContent = emoji.favourite ? "♥" : "♡";
  favouriteButton.title = emoji.favourite
    ? "Remove from favourites"
    : "Add to favourites";
  favouriteButton.setAttribute(
    "aria-label",
    favouriteButton.title
  );

  favouriteButton.addEventListener("click", async () => {
    try {
      emoji.favourite = !emoji.favourite;
      await updateEmoji(emoji);
      await refreshEmojis();
      showStatus(emoji.favourite
        ? "Added to favourites."
        : "Removed from favourites.");
    } catch (error) {
      showStatus("Couldn't update favourite: " + error.message, true);
    }
  });

  const actions = document.createElement("div");
  actions.className = "emoji-actions";

  const copyButton = document.createElement("button");
  copyButton.className = "primary-button";
  copyButton.textContent = "Copy Link";

  copyButton.addEventListener("click", async () => {
    try {
await navigator.clipboard.writeText(
  window.emojiVault.normaliseEmojiUrl(emoji.url)
);
      showStatus(`Copied the link for ${emoji.name}!`);
    } catch {
      showStatus(
        "Clipboard access failed. Open Emoji Vault through localhost or HTTPS.",
        true
      );
    }
  });

  const openButton = document.createElement("button");
  openButton.className = "secondary-button";
  openButton.textContent = "Open Image";

  openButton.addEventListener("click", () => {
    window.open(emoji.url, "_blank", "noopener,noreferrer");
  });

  const deleteButton = document.createElement("button");
  deleteButton.className = "secondary-button delete-button";
  deleteButton.textContent = "Delete";

  deleteButton.addEventListener("click", async () => {
    if (!window.confirm(`Delete "${emoji.name}" from your vault?`)) {
      return;
    }

    try {
      await deleteEmoji(emoji.id);
      await refreshEmojis();
      showStatus(`Deleted ${emoji.name}.`);
    } catch (error) {
      showStatus("Couldn't delete emoji: " + error.message, true);
    }
  });

  actions.append(copyButton, openButton, deleteButton);
  card.append(preview, info, favouriteButton, actions);

  return card;
}

document.getElementById("showAddButton").addEventListener("click", () => {
  addPanel.hidden = !addPanel.hidden;

  if (!addPanel.hidden) {
    document.getElementById("emojiName").focus();
  }
});

document.getElementById("cancelButton").addEventListener("click", () => {
  addPanel.hidden = true;
  form.reset();
});

form.addEventListener("submit", async event => {
  event.preventDefault();

  const name = document.getElementById("emojiName").value.trim();
  const url = document.getElementById("emojiUrl").value.trim();
  const category = document.getElementById("emojiCategory").value.trim();

  if (!name || !isValidImageUrl(url)) {
    showStatus("Enter a name and a valid HTTP or HTTPS image URL.", true);
    return;
  }

  const emoji = {
    name,
    url,
    category,
    favourite: false,
    createdAt: Date.now()
  };

  try {
    await saveEmoji(emoji);
    await refreshEmojis();
    form.reset();
    addPanel.hidden = true;
    showStatus(`Saved ${name} to Emoji Vault.`);
  } catch (error) {
    showStatus("Couldn't save emoji: " + error.message, true);
  }
});

searchInput.addEventListener("input", renderEmojis);
sortSelect.addEventListener("change", renderEmojis);

document.getElementById("allButton").addEventListener("click", () => {
  favouritesOnly = false;
  document.getElementById("allButton").classList.add("active");
  document.getElementById("favouritesButton").classList.remove("active");
  renderEmojis();
});

document.getElementById("favouritesButton").addEventListener("click", () => {
  favouritesOnly = true;
  document.getElementById("favouritesButton").classList.add("active");
  document.getElementById("allButton").classList.remove("active");
  renderEmojis();
});

document.getElementById("exportButton").addEventListener("click", () => {
  const backup = {
    format: "EmojiVault",
    version: 1,
    emojis: emojis.map(({ name, url, category, favourite, createdAt }) => ({
      name, url, category, favourite, createdAt
    }))
  };

  const blob = new Blob(
    [JSON.stringify(backup, null, 2)],
    { type: "application/json" }
  );

  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = "emoji-vault-backup.json";
  link.click();
  URL.revokeObjectURL(downloadUrl);

  showStatus("Backup exported.");
});

document.getElementById("importButton").addEventListener("click", () => {
  importFile.click();
});

importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  if (!file) return;

  try {
    const backup = JSON.parse(await file.text());

    if (
      backup.format !== "EmojiVault" ||
      backup.version !== 1 ||
      !Array.isArray(backup.emojis)
    ) {
      throw new Error("This isn't a recognised Emoji Vault backup.");
    }

    const validRecords = backup.emojis.filter(emoji =>
      emoji &&
      typeof emoji.name === "string" &&
      typeof emoji.url === "string" &&
      isValidImageUrl(emoji.url)
    );

    if (validRecords.length !== backup.emojis.length) {
      throw new Error("Backup contains invalid emoji records. Nothing imported.");
    }

    let imported = 0;

    for (const item of validRecords) {
      await saveEmoji({
        name: item.name.slice(0, 60),
        url: item.url,
        category: typeof item.category === "string"
          ? item.category.slice(0, 40)
          : "",
        favourite: Boolean(item.favourite),
        createdAt: Number.isFinite(item.createdAt)
          ? item.createdAt
          : Date.now()
      });
      imported++;
    }

    await refreshEmojis();
    showStatus(`Imported ${imported} emojis. Existing records were kept.`);
  } catch (error) {
    showStatus("Import failed: " + error.message, true);
  } finally {
    importFile.value = "";
  }
});

document.getElementById("manageCategoriesButton").addEventListener("click", () => {
  categoryManagerPanel.hidden = !categoryManagerPanel.hidden;
  if (!categoryManagerPanel.hidden) renderCategoryManager();
});

document.getElementById("closeCategoryManagerButton").addEventListener("click", () => {
  categoryManagerPanel.hidden = true;
});

async function startApp() {
  try {
    if (!("indexedDB" in window)) {
      throw new Error("This browser does not support IndexedDB.");
    }

    db = await openDatabase();
    await refreshEmojis();
  } catch (error) {
    grid.replaceChildren();

    const errorMessage = document.createElement("p");
    errorMessage.className = "empty-state";
    errorMessage.textContent =
      "Emoji Vault couldn't start. Try opening it through localhost. " +
      error.message;

    grid.append(errorMessage);
  }
}

startApp();


document.getElementById("showBulkButton").addEventListener("click", () => {
  bulkPanel.hidden = !bulkPanel.hidden;

  if (!bulkPanel.hidden) {
    addPanel.hidden = true;
    document.getElementById("bulkUrls").focus();
  }
});

document.getElementById("cancelBulkButton").addEventListener("click", () => {
  bulkPanel.hidden = true;
  bulkForm.reset();
});

bulkForm.addEventListener("submit", async event => {
  event.preventDefault();

  const urls = document.getElementById("bulkUrls").value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const names = document.getElementById("bulkNames").value
    .split(/\r?\n/)
    .map(line => line.trim());

  const category = document.getElementById("bulkCategory").value.trim();

  if (urls.length === 0) {
    showStatus("Please enter at least one image URL.", true);
    return;
  }

  const invalidUrls = urls.filter(url => !isValidImageUrl(url));

  if (invalidUrls.length > 0) {
    showStatus(
      `${invalidUrls.length} invalid URL(s) found. Nothing imported. Check your list.`,
      true
    );
    return;
  }

  const records = urls.map((url, index) => ({
    name: (names[index] || `emoji-${Date.now()}-${index + 1}`).slice(0, 60),
    url,
    category: category.slice(0, 40),
    favourite: false,
    createdAt: Date.now() + index
  }));

  const submitButton = bulkForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  try {
    // Save all records in one transaction.
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      for (const record of records) {
        store.add(record);
      }

      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(
        transaction.error || new Error("Import cancelled.")
      );
    });

    await refreshEmojis();
    bulkForm.reset();
    bulkPanel.hidden = true;
    showStatus(`Successfully imported ${records.length} emojis!`);
  } catch (error) {
    showStatus("Bulk import failed: " + error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

