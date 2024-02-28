import * as vscode from 'vscode'
import { DOMParser } from 'xmldom'

import { Decorator } from './decoration'
import { execTf } from './tfvc'

export class SCM implements vscode.Disposable {
  private changesGroup: vscode.SourceControlResourceGroup | null = null
  private decorator: Decorator | null = null
  private scm: vscode.SourceControl | null = null
  private outputChannel: vscode.OutputChannel | null = null
  private isTfsWorkspace = false

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('TFVC')
    this.outputChannel.show(true)
  }

  async init(context: vscode.ExtensionContext) {
    const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri

    this.isTfsWorkspace = await this.detectTfsWorkspace()

    if (this.isTfsWorkspace) {
      this.scm = vscode.scm.createSourceControl('tfvc', 'TF Version Control', rootUri)
      this.changesGroup = this.scm.createResourceGroup('changes', 'Changes')

      this.scm.inputBox.placeholder = 'Enter a check-in message'
      this.decorator = new Decorator(context)

      this.refresh()
    }
  }

  dispose() {
    this.outputChannel?.dispose()
    this.outputChannel = null
  }

  async detectTfsWorkspace(): Promise<boolean> {
    const rootUri = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? '.'
    const params = ['vc', 'workfold', rootUri]

    try {
      await execTf(params)
    } catch (error: any) {
      this.outputChannel?.appendLine(`NOT a TF VC workspace! ${error.message}`)
      return false
    }

    this.outputChannel?.appendLine(`TF VC workspace detected`)

    return true
  }

  refresh = (): Thenable<void> => {
    const progressOptions: vscode.ProgressOptions = {
      title: `Refreshing the source control...`,
      location: vscode.ProgressLocation.SourceControl
    }
    const params = ['vc', 'status', this.getRootUri(), '/recursive', '/format:xml']

    return vscode.window.withProgress(progressOptions, async (progress) => {
      try {
        const tfResult = await execTf(params)
        const xmlDoc = new DOMParser().parseFromString(tfResult, 'text/xml')
        const elements = Array.from(xmlDoc.getElementsByTagName('PendingChange'))

        if (this.changesGroup) {
          this.changesGroup.resourceStates = elements.map((el) => ({
            resourceUri: vscode.Uri.file(el.getAttribute('local') ?? ''),
            decorations: this.decorator?.getDecorations(el.getAttribute('chg') ?? '')
          }))
        }

        progress.report({ message: `The source control has been refreshed successfully.` })
      } catch (error: any) {
        vscode.window.showErrorMessage(`Error: Cannot check the source control! (Code: ${error.code}; Error: ${error.message})`)
      }
    })
  }

  checkout = (filePath: string, isManual = true) => {
    const isInsideWorkspace = filePath.toLowerCase().startsWith(this.getRootUri().toLowerCase())
    if (!isInsideWorkspace && !isManual) {
      this.outputChannel?.appendLine(`checkout aborted: ${isInsideWorkspace}/${isManual}`)
      return
    }

    if (this.isCheckedOut(filePath)) {
      if (isManual) {
        vscode.window.showWarningMessage('The file is already checked out.')
      }
      return
    }

    const params = ['vc', 'checkout', filePath]
    const progressOptions: vscode.ProgressOptions = {
      title: `Checking out "${filePath}"...`,
      location: vscode.ProgressLocation.Notification
    }

    return vscode.window.withProgress(progressOptions, async (progress) => {
      try {
        await execTf(params)
        progress.report({ message: `Refreshing the source control...` })
        await this.refresh()
        vscode.window.showInformationMessage(`The file has been checked out successfully.`)
      } catch (error: any) {
        vscode.window.showErrorMessage(`Error: The checkout failed! (Code: ${error.code}; Error: ${error.message})`)
      }
    })
  }

  checkIn = async (filePath?: string | string[]) => {
    const title = `checking in ${this.createTitleSuffix(filePath)}`
    if (!(await this.confirmAction(title))) {
      return
    }

    // TODO: get comment & ask if not exist
    const params = ['vc', 'checkin', '/recursive', ...this.createUrisArray(filePath)]
    const progressOptions: vscode.ProgressOptions = {
      title: `${title.slice(0, 1).toUpperCase()}${title.slice(1)}...`,
      location: vscode.ProgressLocation.Notification
    }

    return vscode.window.withProgress(progressOptions, async (progress) => {
      try {
        await execTf(params)
        progress.report({ message: `Refreshing the source control...` })
        await this.refresh()
        vscode.window.showInformationMessage(`The check-in completed successfully.`)
      } catch (error: any) {
        vscode.window.showErrorMessage(`Error: The check-in failed! (Code: ${error.code}; Error: ${error.message})`)
      }
    })
  }

  undo = async (filePath?: string | string[]) => {
    const title = `undoing ${this.createTitleSuffix(filePath)}`
    if (!(await this.confirmAction(title))) {
      return
    }

    const params = ['vc', 'undo', '/recursive', ...this.createUrisArray(filePath)]
    const progressOptions: vscode.ProgressOptions = {
      title: `${title.slice(0, 1).toUpperCase()}${title.slice(1)}...`,
      location: vscode.ProgressLocation.Notification
    }

    return vscode.window.withProgress(progressOptions, async (progress) => {
      try {
        await execTf(params)
        progress.report({ message: `Refreshing the source control...` })
        await this.refresh()
        vscode.window.showInformationMessage(`The undo completed successfully..`)
      } catch (error: any) {
        vscode.window.showErrorMessage(`Error: The undo failed! (Code: ${error.code}; Error: ${error.message})`)
      }
    })
  }

  private getRootUri = (): string => {
    const rootUri = this.scm?.rootUri?.fsPath
    if (rootUri === undefined) {
      throw new Error('The root path not configured!')
    }
    return rootUri
  }

  private createUrisArray = (filePath: string | string[] | undefined): string[] => {
    if (filePath === undefined) {
      return [this.getRootUri()]
    }
    if (Array.isArray(filePath)) {
      return filePath
    }
    return [filePath]
  }

  private createTitleSuffix = (filePath: string | string[] | undefined): string => {
    if (filePath === undefined) {
      return 'the entire workspace'
    }
    if (Array.isArray(filePath) && filePath.length > 1) {
      return `${filePath.length} files`
    }
    if (Array.isArray(filePath)) {
      return `"${filePath[0]}"`
    }
    return `"${filePath}"`
  }

  private isCheckedOut = (filePath: string) => {
    return this.changesGroup?.resourceStates.some((state) => state.resourceUri.fsPath.toLowerCase() === filePath.toLowerCase())
  }

  private async confirmAction(action: string) {
    const message = `You are going to ${action}. Are you sure?`
    const options: vscode.MessageOptions = { modal: true }
    const yesOption: vscode.MessageItem = { title: 'Yes', isCloseAffordance: false }
    const noOption: vscode.MessageItem = { title: 'No', isCloseAffordance: true }
    const selectedOption = await vscode.window.showInformationMessage(message, options, yesOption, noOption)
    const confirmed = selectedOption === yesOption
    return confirmed
  }
}
