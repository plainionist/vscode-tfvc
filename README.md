# VS Code TFS VC extension

Provide support for Team Foundation Version Control in VS Code

## Features

- Checkout files, Automatic (on save) or manually.
- See the changed files in the SCM sidebar.
- Check in or Undo the pending changes in an individual file or in all the files.

## Requirements

You should have `TF.EXE` (The CLI tool of the Team Foundation Server) in yours computer.

## Extension Settings

This extension contributes the following settings:

* `tfvc.tfExePath`: The full path to the 'TF.EXE' file.
* `tfvc.autoCheckout`: Defines whether the auto-load will work on saving or not at all.

## Credits

Based on https://marketplace.visualstudio.com/items?itemName=ShPelles.vscode-tfvc