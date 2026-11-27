/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Temporary helper on a test branch (not part of the pull request): opens a deleted and a
// staged-deleted file from Source Control and takes a screenshot of the window after each.

import * as cp from 'child_process';
import * as path from 'path';
import { commands, extensions, TabInputText, window, workspace } from 'vscode';
import type { GitExtension } from '../api/git';
import { Status } from '../api/git.constants';
import type { GitExtensionImpl } from '../api/extension';
import { eventToPromise } from '../util';

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function capture(name: string): void {
	const file = path.join(process.env['SCREENSHOT_DIR']!, `${process.env['SCREENSHOT_VARIANT'] ?? 'shot'}-${name}.png`);
	cp.execFileSync('import', ['-window', 'root', file], { env: { ...process.env, DISPLAY: process.env['DISPLAY'] ?? ':10' } });
	console.log(`SCREENSHOT: ${file}`);
}

function logTabs(): void {
	for (const tab of window.tabGroups.activeTabGroup.tabs) {
		console.log(`TAB: "${tab.label}"${tab.isActive ? ' (active)' : ''} ${tab.input instanceof TabInputText ? tab.input.uri.toString() : ''}`);
	}
}

export async function run(): Promise<void> {
	const cwd = workspace.workspaceFolders![0].uri.fsPath;
	const ext = extensions.getExtension<GitExtension>('vscode.git')!;
	await ext.activate();
	const git = ext.exports.getAPI(1);

	if (git.repositories.length === 0) {
		const onDidOpenRepository = eventToPromise(git.onDidOpenRepository);
		await commands.executeCommand('git.openRepository', cwd);
		await onDidOpenRepository;
	}

	await git.repositories[0].status();
	const repository = (ext.exports as GitExtensionImpl).model!.getRepository(cwd)!;

	await commands.executeCommand('workbench.action.closeAuxiliaryBar');
	await commands.executeCommand('workbench.action.closePanel');
	await commands.executeCommand('notifications.clearAll');
	await commands.executeCommand('workbench.view.scm');
	await sleep(3000);

	const deleted = repository.workingTreeChanges.find(r => r.type === Status.DELETED);
	const stagedDeleted = repository.indexChanges.find(r => r.type === Status.INDEX_DELETED);
	if (!deleted || !stagedDeleted) {
		throw new Error('The demo repository has no deleted and staged-deleted file');
	}

	// Open each file the way a click in Source Control does, as a pinned editor so both tabs stay
	for (const [name, resource] of [['1-deleted', deleted], ['2-staged-deleted', stagedDeleted]] as const) {
		console.log(`DIAG open ${name}: ${resource.command.command} ${resource.command.arguments?.[0]?.toString()} right=${resource.rightUri?.toString()}`);
		await commands.executeCommand(resource.command.command, ...(resource.command.arguments ?? []));
		await commands.executeCommand('workbench.action.keepEditor');
		await commands.executeCommand('notifications.clearAll');
		await sleep(3000);
		logTabs();
		capture(name);
	}

	// Wait longer in case a decoration arrives late, and capture again
	await sleep(8000);
	logTabs();
	capture('3-staged-deleted-later');
}
