# URL Emoji Vault 💜

A little app I made to save and organise emoji URLs locally, so you can easily use them in apps like Discord.

I wanted an easier way to keep track of emoji links instead of having to hunt for them every time. So I made Emoji Vault!

## 💜 Features

- Save and organise emoji URLs in your own local library
- Search your collection and mark favourites
- Organise emojis into categories
- Use the compact picker from the system tray
- Set global hotkeys to paste emoji URLs into the app you're using
- Customise the look with different colour themes and picker opacity
- Import and export your emoji collection
- Manage your hotkey assignments
- Keep your library and settings locally on your PC

Emoji Vault is designed to work with URL-based emojis and isn't limited to one chat application.

## 💻 Download

Go to the [Releases page](../../releases/latest) to find the latest Windows download.

- **Installer:** the normal way to install Emoji Vault.
- **Portable version:** an alternative that doesn't use a conventional installation wizard.

Check the release notes for the version and any known issues.

## 🛠️ Building from source

You'll need [Node.js](https://nodejs.org/) and npm installed.

1. Clone or download this repository.
2. Open a terminal in the project folder.
3. Install the dependencies:

   ```bash
   npm install
   ```

4. Start the app:

   ```bash
   npm start
   ```

### Building the Windows versions

Build the portable executable:

```bash
npm run build:portable
```

Build the unpacked Windows application:

```bash
npm run build:dir
```

The build output is created in the `dist` folder. The Inno Setup script can then be used to create the Windows installer.

## 🔒 Your data

Emoji Vault is designed as a local library. Your saved collection and hotkey assignments are stored on your computer rather than in an Emoji Vault online account.

Back up your data before making major changes or uninstalling if you want to keep a separate copy.

## 💡 Feedback and bugs

Found a bug or have an idea for a feature? Please open an issue in this repository and explain what happened or what you'd like to see.

Contributions and suggestions are welcome!

## 📄 Licence

Emoji Vault is released under the MIT Licence. See [LICENSE](LICENSE) for the full licence text.

Made with all my love 💜
