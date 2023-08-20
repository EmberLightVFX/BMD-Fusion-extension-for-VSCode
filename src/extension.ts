// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { registerLogger, traceError, traceInfo, traceLog, traceVerbose, traceWarn } from './common/logging';
import { loadStubsDefaults } from './common/setup';
import { createOutputChannel } from './common/vscodeapi';

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

async function getInstalledStubsVersion() {
	const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath; // Assumes the first workspace folder is the root

	if (rootPath) {
		const fusionTypingsPath = path.join(rootPath, '.fusion_typings/__builtins__.pyi');
		try {
			const content = await fs.promises.readFile(fusionTypingsPath, 'utf8');
			const lines = content.split('\n');
			if (lines.length >= 2) {
				const version = parseFloat(lines[1].trim().substring(1));
				traceLog(`Found stubs version: v${version}`);
				return version;
			}
		} catch (err: any) {
			vscode.window.showErrorMessage(`Error reading __builtins__.pyi file:\n${err.message}`);
			traceError(`Error reading __builtins__.pyi file:\n${err.message}`);
		}
	}
	return null;
}

async function installStubs(context: vscode.ExtensionContext) {
	const sourceFolderPath = path.join(context.extensionPath, 'BMD-Fusion-Scripting-Stubs', '.fusion_typings');
	const {workspaceFolders} = vscode.workspace;

	if (!workspaceFolders) {
		vscode.window.showErrorMessage("Please open a workspace before using this command.");
		traceError("Please open a workspace before using this command.");
		return;
	}
	const currentWorkspaceFolder = workspaceFolders[0].uri.fsPath;
	try {
		copyFolderRecursiveSync(sourceFolderPath, path.join(currentWorkspaceFolder,'.fusion_typings'));
		updateVScodeSetting('python', 'analysis.extraPaths', "./.fusion_typings");

		const stubsVersion = await getInstalledStubsVersion();

		vscode.window.showInformationMessage(`Stubs ${stubsVersion} installed successfully!`);
		traceInfo(`Stubs ${stubsVersion} installed successfully!`);
	} catch (err) {
		if (err instanceof Error) {
			vscode.window.showErrorMessage(`Error installing stubs:\n${err.message}`);
			traceError(`Error installing stubs:\n${err.message}`);
		}
	}
}

async function checkStubsForUpdates(stubsVersion: number, context: vscode.ExtensionContext) {
	const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath; // Assumes the first workspace folder is the root

	if (rootPath) {
		const installedStubsVersion = await getInstalledStubsVersion();
		if (installedStubsVersion !== null) {
			if (installedStubsVersion === stubsVersion) {
				// Show a message with an "Update stubs" button
				traceLog(`Workspace contains latest stubs-version: v${stubsVersion}`);
			} else {
				vscode.window.showWarningMessage(`The workspace does not run the latest stubs-version for Fusion Studio.\nInstalled: v${installedStubsVersion}\nAvailable: v${stubsVersion}`, 'Update Stubs')
				.then(selection => {
					if (selection === 'Update Stubs') {
						installStubs(context);
					}
				});
				traceWarn(`The workspace does not run the latest stubs-version for Fusion Studio.\nInstalled: v${installedStubsVersion}\nAvailable: v${stubsVersion}`);
			}
		}
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // This is required to get server name and module. This should be
    // the first thing that we do in this extension.
    const stubsInfo = loadStubsDefaults();
	// Setup logging
    const outputChannel = createOutputChannel(stubsInfo.name);
    context.subscriptions.push(outputChannel, registerLogger(outputChannel));
	traceLog("BMD Fusion Scripting is activated");
	traceLog(`Name: ${stubsInfo.name}`);
    traceLog(`Available stubs version: v${stubsInfo.version}`);
	outputChannel.show();
	checkStubsForUpdates(stubsInfo.version, context);

    let disposable = vscode.commands.registerCommand('bmd-fusion-scripting.copyFusionStubsToWorkspace', () => installStubs(context));
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand("bmd-fusion-scripting.createVscodeLaunchConfig", async () => {
		const {workspaceFolders} = vscode.workspace;
		if (!workspaceFolders) {
		  	vscode.window.showErrorMessage('No workspace folder is open.');
		  	return;
		}
	
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
