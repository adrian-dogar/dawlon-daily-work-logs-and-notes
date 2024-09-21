const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

let debounceTimer;

function debounce(func, delay) {
    return function (...args) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(this, args), delay);
    };
}

function activate(context) {
	console.log('Extension is now active!');
    let disposable = vscode.commands.registerCommand('extension.createTimestampedNote', createTimestampedNote);
    context.subscriptions.push(disposable);
}

function deactivate() {}

async function createTimestampedNote() {
    let editor = vscode.window.activeTextEditor;

	if (!editor) {
        console.log('No editor found, creating a new one');
        const document = await vscode.workspace.openTextDocument({ content: '' });
        editor = await vscode.window.showTextDocument(document);
    }

    let workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        console.log('No workspace folder found, prompting to create one');
        const folderUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Folder for Workspace'
        });

        if (folderUri && folderUri[0]) {
            await vscode.workspace.updateWorkspaceFolders(0, 0, { uri: folderUri[0] });
            workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        }
    }

	// TODO : en caso de que no tienes ningun folder abierto. aunque lo deberia abrir el bloque anterior
	// que falla porque no espera que se abra uno (mira el await anterior), asi que se dispara este sigueinte  error
    if (!workspaceFolder) {
        console.log('Workspace folder creation cancelled');
        vscode.window.showInformationMessage('A workspace folder is required for this feature.');
        return;
    }

    const projectRoot = workspaceFolder.uri.fsPath;
    const vscodeFolder = path.join(projectRoot, '.vscode');
    const markerFile = path.join(vscodeFolder, 'dawlon.json');

    if (!fs.existsSync(vscodeFolder)) {
        fs.mkdirSync(vscodeFolder, { recursive: true });
    }

    if (!fs.existsSync(markerFile)) {
        console.log('Marker file not found, creating it');
        fs.writeFileSync(markerFile, JSON.stringify({ enabled: true }));
    }

    const today = new Date();
    const dateFolder = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const folderPath = path.join(projectRoot, dateFolder);

    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }

    const timestamp = `${String(today.getHours()).padStart(2, '0')}-${String(today.getMinutes()).padStart(2, '0')}-${String(today.getSeconds()).padStart(2, '0')}`;
    const fileName = `${timestamp}.md`;
    const filePath = path.join(folderPath, fileName);

    fs.writeFileSync(filePath, '');

    const doc = await vscode.workspace.openTextDocument(filePath);
    const newEditor = await vscode.window.showTextDocument(doc);

    console.log('New file created:', filePath);

    const debouncedUpdateFileName = debounce(updateFileName, 1000);

    const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document === newEditor.document) {
            debouncedUpdateFileName(newEditor);
        }
    });

    const cursorListener = vscode.window.onDidChangeTextEditorSelection((event) => {
        if (event.textEditor === newEditor) {
            const firstLineRange = newEditor.document.lineAt(0).range;
            if (!firstLineRange.contains(event.selections[0].active)) {
                debouncedUpdateFileName(newEditor);
            }
        }
    });

    // Dispose of the listeners when the editor is closed
    const closeListener = vscode.workspace.onDidCloseTextDocument((closedDoc) => {
        if (closedDoc === newEditor.document) {
            changeListener.dispose();
            cursorListener.dispose();
            closeListener.dispose();
        }
    });
}

async function updateFileName(editor) {
    console.log('Updating file name');
    const doc = editor.document;
    const firstLine = doc.lineAt(0).text.trim();
    if (!firstLine) {
        console.log('First line is empty, not updating file name');
        return;
    }

    const slugifiedTitle = slugify(firstLine);
    const currentFilePath = doc.uri.fsPath;
    const currentFileName = path.basename(currentFilePath);
    const timestamp = currentFileName.split('.')[0].split('-').slice(0, 3).join('-');
    const newFileName = `${timestamp}-${slugifiedTitle}.md`;
    const newFilePath = path.join(path.dirname(currentFilePath), newFileName);

    if (currentFilePath === newFilePath) {
        console.log('File name unchanged');
        return;
    }

    try {
        // Check if the new file already exists
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(newFilePath));
            console.log('File already exists, not renaming');
            return;
        } catch (error) {
            // File doesn't exist, we can proceed with renaming
        }

        // Close the current document to avoid conflicts
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

        // Perform the rename
        await vscode.workspace.fs.rename(doc.uri, vscode.Uri.file(newFilePath));
        console.log('File renamed to:', newFileName);

        // Open the renamed file and show it in the same editor
        const newDoc = await vscode.workspace.openTextDocument(newFilePath);
        await vscode.window.showTextDocument(newDoc, editor.viewColumn);

    } catch (error) {
        console.error('Error renaming file:', error);
        vscode.window.showErrorMessage(`Failed to rename file: ${error.message}`);
    }
}

function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

module.exports = {
    activate,
    deactivate
};