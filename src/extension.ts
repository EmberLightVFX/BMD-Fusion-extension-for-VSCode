// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
const os = require('os');
import * as fs from 'fs';
import * as path from 'path';


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


function copyFolderRecursiveSync(source: string, target: string) {
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target);
    }

    fs.readdirSync(source).forEach((file) => {
        const sourcePath = path.join(source, file);
        const targetPath = path.join(target, file);

        if (fs.lstatSync(sourcePath).isDirectory()) {
            copyFolderRecursiveSync(sourcePath, targetPath);
        } else {
            fs.copyFileSync(sourcePath, targetPath);
        }
    });
}


function updateVScodeSetting(config: string, setting: string, fusionTypingsPath: string) {
    const configObj = vscode.workspace.getConfiguration(config, vscode.workspace.workspaceFolders?.[0]);
    const extraPaths = configObj.get<string[]>(setting, []);

    if (!extraPaths.includes(fusionTypingsPath)) {
        extraPaths.push(fusionTypingsPath);
        configObj.update(setting, extraPaths, vscode.ConfigurationTarget.Workspace);
    }
}


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "bmd-fusion-scripting" is now active!');

    let disposable = vscode.commands.registerCommand('bmd-fusion-scripting.copyFusionStubsToWorkspace', () => {
        const sourceFolderPath = path.join(context.extensionPath, 'BMD-Fusion-Scripting-Stubs', '.fusion_typings');
        const {workspaceFolders} = vscode.workspace;

        if (!workspaceFolders) {
            vscode.window.showErrorMessage("Please open a workspace before using this command.");
            return;
        }
		const currentWorkspaceFolder = workspaceFolders[0].uri.fsPath;
        try {
            copyFolderRecursiveSync(sourceFolderPath, path.join(currentWorkspaceFolder,'.fusion_typings'));
			updateVScodeSetting('python', 'analysis.extraPaths', "./.fusion_typings");
            vscode.window.showInformationMessage("Folder copied successfully!");
        } catch (error) {
			if (error instanceof Error) {
				vscode.window.showErrorMessage("Error copying folder: " + error.message);
			}
        }
    });
	context.subscriptions.push(disposable);

	const createTaskName = "bmd-fusion-scripting.createVscodeLaunchConfig";
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


		// Ask the user to enter the name of the configuration with a default value
		const configName = await vscode.window.showInputBox({
			placeHolder: 'Enter the name of the configuration',
			prompt: 'Please enter the name of the configuration.',
			value: 'Run ' + scriptingLanguage + ' script in BMD Fusion',
		});
		
		if (!configName) {
			vscode.window.showErrorMessage('Configuration name is required.');
			return;
		}

	
		// Create the type of init code
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
				"name": configName,
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

		// Check if the configuration already exists
		const configAlreadyExists = existingConfigs.some(config => {
			return config.name === launchConfiguration.configurations[0].name;
		});

		if (!configAlreadyExists) {
			existingConfigs.push(launchConfiguration.configurations[0]);
			launchConfigurations.update('configurations', existingConfigs, vscode.ConfigurationTarget.Workspace);
			vscode.window.showInformationMessage('Launching Fusion script with ' + scriptingLanguage + '.');
		} else {
			console.log('Configuration already exists.');
			vscode.window.showInformationMessage('Configuration already exists.');
		}

	});
	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
