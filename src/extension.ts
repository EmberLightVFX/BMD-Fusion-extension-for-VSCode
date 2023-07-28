// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
const os = require('os');

function getFuscriptPath() {
	const platform = os.platform();
	if (platform === 'win32') {
		return 'C:\\Program Files\\Blackmagic Design\\Fusion 18\\fuscript.exe';
	} else if (platform === 'darwin') {
		// Replace this with the path for macOS
		return '/Applications/Blackmagic Fusion 18/Fusion.app/Contents/MacOS/fusionscript.so';
	} else if (platform === 'linux') {
		// Replace this with the path for Linux
		return '/opt/BlackmagicDesign/Fusion18/fusionscript.so';
	} else {
		// Unsupported platform
		return null;
	}
}


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "bmd-fusion" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('bmd-fusion.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from BMD Fusion!');
	});

	context.subscriptions.push(disposable);


	const createTaskName = "bmd-fusion.create-vscode-task";
	disposable = vscode.commands.registerCommand(createTaskName, async () => {
		const {workspaceFolders} = vscode.workspace;
		if (!workspaceFolders) {
		  	vscode.window.showErrorMessage('No workspace folder is open.');
		  	return;
		}
	
		const currentFolder = workspaceFolders[0].uri;
		let fuscriptPath = getFuscriptPath();

		if (!fuscriptPath) {
		  	vscode.window.showErrorMessage('Unsupported platform.');
		  	return;
		}
		

		// Prompt the user to choose between "local" and "custom" path
		let selection = await vscode.window.showQuickPick(['Default Path', 'Custom Path'], {
			placeHolder: 'Choose the Fusion executable path:'
		});
	
		if (selection === 'Custom Path') {
			const customPath = await vscode.window.showInputBox({
			prompt: 'Enter the path to fuscript (e.g. ' + fuscriptPath + ' )',
			validateInput: (value) => {
				if (!value.trim()) {
				return 'Please provide a valid path.';
				}
				return null;
			}
			});
	
			if (!customPath) {
			vscode.window.showErrorMessage('You must provide a valid path for fuscript.');
			return;
			}
	
			fuscriptPath = customPath;
		}
		else if (!selection) {
		  // User canceled the quick pick, exit early
		  return;
		}

		
		// Prompt the user to choose the host type
		let fusionHost = "localhost";
		selection = await vscode.window.showQuickPick(['Localhost', 'Custom Adress'], {
			placeHolder: 'Choose the host to connect to:'
		});
	
		if (selection === 'Custom Adress') {
			const customPath = await vscode.window.showInputBox({
			prompt: 'Enter the adress of the fusion host (e.g. 127.0.0.1 )',
			validateInput: (value) => {
				if (!value.trim()) {
				return 'Please provide a valid adress.';
				}
				return null;
			}
			});
	
			if (!customPath) {
			vscode.window.showErrorMessage('You must provide a valid adress for the fusion host.');
			return;
			}
	
			fusionHost = customPath;
		}
		else if (!selection) {
		  // User canceled the quick pick, exit early
		  return;
		}

		// Prompt the user to choose the host type
		let scriptingLanguage = await vscode.window.showQuickPick(['Lua', 'Python3'], {
			placeHolder: 'Choose the scripting language:'
		});

		if (!scriptingLanguage) {
		  // User canceled the quick pick, exit early
		  return;
		}
	
		// Select the type of init code
		let fusionInitCode = "";
		if (scriptingLanguage === "Lua") {
			fusionInitCode = 'fusion = bmd.scriptapp(\\\"Fusion\\\", \\\"' + fusionHost + '\\\");if fusion ~= nil then fu = fusion;app = fu;composition = fu.CurrentComp;comp = composition;SetActiveComp(comp) else print(\\\"[Error] Please open up the Fusion GUI before running this tool.\\\") end;';
		} else if (scriptingLanguage === "Python3") {
			fusionInitCode = `fusion = bmd.scriptapp(\\\"Fusion\\\", \\\"${fusionHost}\\\")
if fusion is not None:
    fu = fusion
    app = fu
    composition = fu.CurrentComp
    comp = composition
else:
    print(\\\"[Error] Please open up the Fusion GUI before running this tool.\\\")`;
		}

		const launchConfigurations = vscode.workspace.getConfiguration('launch');

		const launchConfiguration = {
			version: "0.2.0",
			configurations: [
			{
				"name": 'BMD Fusion ' + scriptingLanguage + '...',
				"type": "node",
				"request": "launch",
				"cwd": "${workspaceRoot}",
				"runtimeExecutable": fuscriptPath,
				"runtimeArgs": [
				  "-l", scriptingLanguage,
				  "-x", fusionInitCode,
				  "${file}"
				],
				"console": "integratedTerminal"
			}
			]
		};
	
		const existingConfigs = launchConfigurations.get<any[]>('configurations') || [];
		existingConfigs.push(launchConfiguration.configurations[0]);
		launchConfigurations.update('configurations', existingConfigs, vscode.ConfigurationTarget.Workspace);
	
		vscode.window.showInformationMessage('Launching Fusion script with ' + scriptingLanguage + '.');
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
