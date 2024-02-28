import * as vscode from 'vscode';

import { SCM } from './scm';

let registeredAutoCheckout: vscode.Disposable;
let scm: SCM;

export function activate(context: vscode.ExtensionContext) {

	if (vscode.workspace.workspaceFolders === undefined) { return; }
	if (vscode.workspace.workspaceFolders.length > 1) {
		vscode.window.showWarningMessage(`TFVC Extension don't works with multi-root workspace!`);
		return;
	}

	scm = new SCM();
	scm.init(context);

	context.subscriptions.push(
		// TODO: write a shared wrapper for this three commands 
		vscode.commands.registerTextEditorCommand('vscode-tfvc.checkoutCurrentFile', editor => {
			const fileName = editor.document.fileName;
			if (fileName === undefined) {
				vscode.window.showWarningMessage(`No file found for checking out!`);
				return;
			}
			scm.checkout(fileName);
		}),
		vscode.commands.registerTextEditorCommand('vscode-tfvc.checkInCurrentFile', editor => {
			const fileName = editor.document.fileName;
			if (fileName === undefined) {
				vscode.window.showWarningMessage(`No file found for checking in!`);
				return;
			}
			scm.checkIn(fileName);
		}),
		vscode.commands.registerTextEditorCommand('vscode-tfvc.undoCurrentFile', editor => {
			const fileName = editor.document.fileName;
			if (fileName === undefined) {
				vscode.window.showWarningMessage(`No file found for undo!`);
				return;
			}
			scm.undo(fileName);
		}),

		vscode.commands.registerCommand('vscode-tfvc.refreshSCM', scm.refresh),
		vscode.commands.registerCommand('vscode-tfvc.undoAll', scm.undo),
		vscode.commands.registerCommand('vscode-tfvc.checkInAll', scm.checkIn),

		vscode.commands.registerCommand('vscode-tfvc.undoFile', (...states: vscode.SourceControlResourceState[]) => {
			const paths = states.map(state => state.resourceUri.fsPath);
			scm.undo(paths);
		}),
		vscode.commands.registerCommand('vscode-tfvc.checkInFile', (...states: vscode.SourceControlResourceState[]) => {
			const paths = states.map(state => state.resourceUri.fsPath);
			scm.checkIn(paths);
		}),
		vscode.commands.registerCommand('vscode-tfvc.openFile', (state: vscode.SourceControlResourceState) => {
			vscode.commands.executeCommand('vscode.open', state.resourceUri);
		}),

		registerAutoCheckout(scm),
		vscode.workspace.onDidChangeConfiguration(event => {
			if (!event.affectsConfiguration('tfvc.autoCheckout')) { return; }
			registeredAutoCheckout?.dispose();
			registerAutoCheckout(scm);
		}),

		vscode.workspace.onDidCreateFiles(scm.refresh),
		vscode.workspace.onDidDeleteFiles(scm.refresh),
		vscode.workspace.onDidRenameFiles(scm.refresh),
		vscode.workspace.onDidSaveTextDocument(scm.refresh),
	);
}

function registerAutoCheckout(scm: SCM): vscode.Disposable {
	const autoCheckout = vscode.workspace.getConfiguration('tfvc').get<string>('autoCheckout');
	switch (autoCheckout) {
		case 'on edit':
			registeredAutoCheckout = vscode.workspace.onDidChangeTextDocument(event => scm.checkout(event.document.fileName, false));
			break;

		case 'on save':
			registeredAutoCheckout = vscode.workspace.onWillSaveTextDocument(event => scm.checkout(event.document.fileName, false));
			break;

		default:
			registeredAutoCheckout = new vscode.Disposable(() => { });
			break;
	}
	return registeredAutoCheckout;
}

export function deactivate() {
	registeredAutoCheckout.dispose();
	scm.dispose();
}
