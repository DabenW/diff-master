// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { linesDiffComputers as LinesDiffComputers } from './vs/editor/common/diff/linesDiffComputers';
import { getDiffState } from './inlineDiffServiceUtils';
import { Range } from './vs/editor/common/core/range';
import { LineRange } from './vs/editor/common/core/lineRange';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "diff-master" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('diff-master.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from diff-master!');
	});

	const diffComputer = LinesDiffComputers.getDefault();

	const originalLines: string[] = ["ddddddd", "ccccc", "aaaaa"];
	const modifiedLines: string[] = ["ddddddd", "aa"];

	const diffResult = diffComputer.computeDiff(originalLines, modifiedLines, {
		ignoreTrimWhitespace: false,
		maxComputationTimeMs: 200,
		computeMoves: false,
		// onlyCareAboutPrefixOfOriginalLines: true,
		// shouldGracefullyFallBackOnTimeout: true
	});
	console.log("=====diff diffResult", diffResult);

	const result = getDiffState(originalLines, modifiedLines, false, false);
	console.log("=====diff getDiffState result", result);


	const diff: InlineDiff = {
		uri: vscode.Uri.parse(""),
		generationUUID: "",
		currentRange: LineRange.fromRange(new Range(1, 1, 3, 6)),
		originalTextLines: ["ddddddd", "ccccc", "aaaaa"],
		originalLineTokens: [],
		prompt: "prompt",
		isHidden: false,
		hideDeletionViewZones: false,
		attachedToPromptBar: false,
		extraContextLinesAbove: 0,
		extraContextLinesBelow: 0
	};
	
	const handler = new InlineDiffHandler(diff);

	for (const line of modifiedLines) {
		handler.addLinesToDiff([line]);
	}

	handler.handleDiffState(result, diff);

	context.subscriptions.push(disposable);
}

interface InlineDiffChange {
	addedRange: { startLineNumber: number; endLineNumberExclusive: number };
	removedTextLines: string[];
	removedLinesOriginalRange: { startLineNumber: number; endLineNumberExclusive: number };
	relativeInnerChanges?: { modifiedRange: Range }[];
}

interface InlineDiff {
	id?: string;
	changes?: InlineDiffChange[];
	activeLine?: number;
	pendingRange?: { startLineNumber: number; endLineNumberExclusive: number };
	newTextLines?: string[];
	isHidden?: boolean;
	onAccept?: () => void;
	onReject?: () => void;
	canUndoUpdates?: boolean;
	showNativeAcceptReject?: boolean;
	uri: vscode.Uri;
	generationUUID: string;
	currentRange: LineRange;
	originalTextLines: string[];
	originalLineTokens: string[];
	prompt: string;
	hideDeletionViewZones: boolean;
	attachedToPromptBar: boolean;
	extraContextLinesAbove: number;
	extraContextLinesBelow: number;
}

export class InlineDiffHandler {

	constructor(public inlineDiff: InlineDiff) {
		this.inlineDiff = {
			id: "",
      changes: [],
      activeLine: undefined,
      pendingRange: {
        startLineNumber: 1,
        endLineNumberExclusive: inlineDiff.currentRange.endLineNumberExclusive - inlineDiff.currentRange.startLineNumber + 1
      },
			newTextLines: [],
			isHidden: false,
      onAccept: undefined,
      onReject: undefined,
      canUndoUpdates: true,
      showNativeAcceptReject: false,
      ...inlineDiff
		}
	}

	addLinesToDiff(lines: string[], isUndoRedo = false): void {
		const cleanedLines: string[] = [];
    for (const line of lines) {
      if (line.includes('\n') || line.includes('\r')) {
        console.warn("InlineDiffService#addLine: line contains newline characters, which is not supported");
      }
      let cleanedLine = line.replace(/\r/g, "");
      cleanedLine = cleanedLine.replace(/\n/g, "");
      cleanedLines.push(cleanedLine);
    }

    const oldDiff = cloneInlineDiff(this.inlineDiff);
    this.inlineDiff?.newTextLines?.push(...cleanedLines);
    const diffState = getDiffState(this.inlineDiff.originalTextLines, this.inlineDiff?.newTextLines!!, false, this.inlineDiff.isHidden);
    this.handleDiffState(diffState, oldDiff, isUndoRedo);
	}

	public handleDiffState(diffState: ReturnType<typeof getDiffState>, oldDiff: InlineDiff, isUndoRedo = false): void {

		let range = this.inlineDiff.currentRange.startLineNumber < this.inlineDiff.currentRange.endLineNumberExclusive
      ? new Range(this.inlineDiff.currentRange.startLineNumber, 1, this.inlineDiff.currentRange.endLineNumberExclusive - 1, model.getLineMaxColumn(this.inlineDiff.currentRange.endLineNumberExclusive - 1))
      : new Range(this.inlineDiff.currentRange.startLineNumber, 1, this.inlineDiff.currentRange.startLineNumber, 1);

		// const oldLines = range.isEmpty() ? [] : model.getValueInRange(range).split(model.getEOL());
		const oldLines = ["ddddddd", "ccccc", "aaaaa"];
		const diffComputer = LinesDiffComputers.getDefault().computeDiff(oldLines, diffState.newFullRangeTextLines, {
      ignoreTrimWhitespace: false,
      computeMoves: false,
      maxComputationTimeMs: 200
    });

		for (const change of diffComputer.changes) {
			let text = diffState.newFullRangeTextLines.slice(change.modified.startLineNumber - 1, change.modified.endLineNumberExclusive - 1).join("\n");
			let changeRange: Range;

			if (change.original.isEmpty) {
				changeRange = new Range(range.startLineNumber + change.original.startLineNumber - 1, 1, range.startLineNumber + change.original.startLineNumber - 1, 1);
				// text += model.getEOL();
				text += "\n";
			} else if (change.modified.isEmpty) {
				changeRange = new Range(range.startLineNumber + change.original.startLineNumber - 1, 1, range.startLineNumber + change.original.endLineNumberExclusive - 1, 1);
				if (changeRange.endLineNumber > model.getLineCount()) {
					let endLineNumber = model.getLineCount();
					let startColumn = 1;
					let startLineNumber = changeRange.startLineNumber;
					if (startLineNumber > 1) {
						startLineNumber--;
						startColumn = this.modelReference.object.textEditorModel.getLineMaxColumn(startLineNumber);
					}
					changeRange = new Range(startLineNumber, startColumn, endLineNumber, this.modelReference.object.textEditorModel.getLineMaxColumn(endLineNumber));
				}
				text = null;
			} else {
				changeRange = new Range(
					range.startLineNumber + change.original.startLineNumber - 1,
					1,
					range.startLineNumber + change.original.endLineNumberExclusive - 1 - 1,
					model.getLineMaxColumn(range.startLineNumber + change.original.endLineNumberExclusive - 1 - 1)
				);
			}

			const edit = {
				range: changeRange,
				text,
				forceMoveMarkers: true
			};
			edits.push(edit);

		}


		const workspaceEdit = new vscode.WorkspaceEdit();
		workspaceEdit.set(document.uri, [edit]);
		vscode.workspace.applyEdit(workspaceEdit);
	}
}

function cloneInlineDiff(diff: InlineDiff): InlineDiff {
  return JSON.parse(JSON.stringify(diff));
}

// This method is called when your extension is deactivated
export function deactivate() { }
