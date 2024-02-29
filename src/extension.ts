import * as vscode from 'vscode'

import { SCM } from './scm'
import { execTf } from './tfvc'

let registeredAutoCheckout: vscode.Disposable
let outputChannel: vscode.OutputChannel

async function detectTfsWorkspace(outputChannel: vscode.OutputChannel): Promise<boolean> {
  const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? '.'
  const params = ['vc', 'workfold', rootUri]

  try {
    await execTf(params)
  } catch (error: any) {
    outputChannel.appendLine(`No TF VC workspace detected! ${error.message}`)
    return false
  }

  outputChannel.appendLine(`TF VC workspace detected`)

  return true
}

export async function activate(context: vscode.ExtensionContext) {
  vscode.commands.executeCommand('setContext', 'tfvc.isTfsWorkspace', false);

  if (vscode.workspace.workspaceFolders === undefined) {
    return
  }
  if (vscode.workspace.workspaceFolders.length > 1) {
    vscode.window.showWarningMessage(`TFS VC extension don't works with multi-root workspace!`)
    return
  }

  outputChannel = vscode.window.createOutputChannel('TFVC')

  const isTfsWorkspace = await detectTfsWorkspace(outputChannel)
  if (!isTfsWorkspace) {
    return
  }

  vscode.commands.executeCommand('setContext', 'tfvc.isTfsWorkspace', true);

  const scm = new SCM(context, outputChannel)

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('vscode-tfvc.checkoutCurrentFile', (editor) => {
      const fileName = editor.document.fileName
      if (fileName === undefined) {
        vscode.window.showWarningMessage(`No file found for checking out!`)
        return
      }
      scm.checkout(fileName)
    }),
    vscode.commands.registerCommand('vscode-tfvc.checkoutFile', (uri: vscode.Uri) => {
      scm.checkout(uri.fsPath)
    }),
    vscode.commands.registerTextEditorCommand('vscode-tfvc.checkInCurrentFile', (editor) => {
      const fileName = editor.document.fileName
      if (fileName === undefined) {
        vscode.window.showWarningMessage(`No file found for checking in!`)
        return
      }
      scm.checkIn(fileName)
    }),
    vscode.commands.registerTextEditorCommand('vscode-tfvc.undoCurrentFile', (editor) => {
      const fileName = editor.document.fileName
      if (fileName === undefined) {
        vscode.window.showWarningMessage(`No file found for undo!`)
        return
      }
      scm.undo(fileName)
    }),

    vscode.commands.registerCommand('vscode-tfvc.refreshSCM', scm.refresh),
    vscode.commands.registerCommand('vscode-tfvc.undoAll', scm.undo),
    vscode.commands.registerCommand('vscode-tfvc.checkInAll', scm.checkIn),

    vscode.commands.registerCommand('vscode-tfvc.undoFile', (...states: vscode.SourceControlResourceState[]) => {
      const paths = states.map((state) => state.resourceUri.fsPath)
      scm.undo(paths)
    }),
    vscode.commands.registerCommand('vscode-tfvc.checkInFile', (...states: vscode.SourceControlResourceState[]) => {
      const paths = states.map((state) => state.resourceUri.fsPath)
      scm.checkIn(paths)
    }),
    vscode.commands.registerCommand('vscode-tfvc.openFile', (state: vscode.SourceControlResourceState) => {
      vscode.commands.executeCommand('vscode.open', state.resourceUri)
    }),

    registerAutoCheckout(scm),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('tfvc.autoCheckout')) {
        return
      }
      registeredAutoCheckout?.dispose()
      registerAutoCheckout(scm)
    }),

    vscode.workspace.onDidCreateFiles(scm.refresh),
    vscode.workspace.onDidDeleteFiles(scm.refresh),
    vscode.workspace.onDidRenameFiles(scm.refresh),
    vscode.workspace.onDidSaveTextDocument(scm.refresh)
  )
}

function registerAutoCheckout(scm: SCM): vscode.Disposable {
  const autoCheckout = vscode.workspace.getConfiguration('tfvc').get<string>('autoCheckout')
  switch (autoCheckout) {
    case 'on save':
      registeredAutoCheckout = vscode.workspace.onWillSaveTextDocument((event) => scm.checkout(event.document.fileName, false))
      break

    default:
      registeredAutoCheckout = new vscode.Disposable(() => {})
      break
  }
  return registeredAutoCheckout
}

export function deactivate() {
  registeredAutoCheckout.dispose()
  outputChannel.dispose()
}
