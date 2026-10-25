
; Emoji Vault Windows installer
; Build first: npm run build:dir

#define MyAppName "Emoji Vault"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Violet Caulfield"
#define MyAppExeName "Emoji Vault.exe"

[Setup]
AppId={{E2A4B1C7-6D3F-4A90-9D62-7F5A1C8B3E40}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Emoji Vault
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
AllowNoIcons=yes
OutputDir=dist\installer
OutputBaseFilename=Emoji-Vault-Setup-{#MyAppVersion}
SetupIconFile=assets\app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
WizardStyle=modern
Compression=lzma2
SolidCompression=yes
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked
Name: "startup"; Description: "Launch Emoji Vault when I sign in to Windows"; GroupDescription: "Optional settings:"; Flags: unchecked

[Files]
Source: "dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Emoji Vault"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\Emoji Vault"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{userstartup}\Emoji Vault"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: startup

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /T /IM ""Emoji Vault.exe"""; Flags: runhidden waituntilterminated

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch Emoji Vault"; Flags: postinstall nowait skipifsilent

; User data in AppData is intentionally preserved during uninstall.
