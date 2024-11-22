import { LineRange } from './vs/editor/common/core/lineRange';
import { linesDiffComputers as LinesDiffComputers } from './vs/editor/common/diff/linesDiffComputers';
import { DetailedLineRangeMapping as RangeMapping } from './vs/editor/common/diff/rangeMapping';

export interface DiffResult {
    newFullRangeTextLines: string[];
    changes: DiffChange[];
    activeLine?: number;
    pendingRange: LineRange;
}

interface DiffChange {
    removedTextLines: string[];
    removedLinesOriginalRange: LineRange;
    addedRange: LineRange;
    relativeInnerChanges: { originalRange: LineRange; modifiedRange: LineRange }[] | undefined;
}

export function getDiffState(originalLines: string[], modifiedLines: string[], isLegacy: boolean, swapOriginalAndModified: boolean = false): DiffResult {
    if (swapOriginalAndModified) {
      const temp = originalLines;
      originalLines = modifiedLines;
      modifiedLines = temp;
    }
  
    const diffComputer = LinesDiffComputers.getDefault();
    const diffResult = diffComputer.computeDiff(originalLines, modifiedLines, {
      ignoreTrimWhitespace: false,
      maxComputationTimeMs: 200,
      computeMoves: false,
    //   onlyCareAboutPrefixOfOriginalLines: !isLegacy,
    //   shouldGracefullyFallBackOnTimeout: !isLegacy
    });
  
    let changes = diffResult.changes;
    if (diffResult.hitTimeout) {
      console.warn("diff computation quit early, not sure what to do here");
      changes = [new RangeMapping(new LineRange(1, originalLines.length + 1), new LineRange(1, modifiedLines.length + 1), undefined)];
    }
  
    const diffChanges: DiffChange[] = [];
    let pendingLines: string[] = [];
  
    for (const change of changes) {
      if (change.modified.endLineNumberExclusive === modifiedLines.length + 1 && !isLegacy) {
        pendingLines = originalLines.slice(change.original.startLineNumber - 1, change.original.endLineNumberExclusive - 1);
        if (change.modified.isEmpty) {
          continue;
        }
        diffChanges.push({
          removedTextLines: [],
          removedLinesOriginalRange: new LineRange(change.original.startLineNumber, change.original.startLineNumber),
          addedRange: change.modified,
          relativeInnerChanges: undefined
        });
      } else {
        diffChanges.push({
          removedTextLines: originalLines.slice(change.original.startLineNumber - 1, change.original.endLineNumberExclusive - 1),
          removedLinesOriginalRange: change.original,
          addedRange: change.modified,
          relativeInnerChanges: change.innerChanges?.map(innerChange => {
            const originalRange = innerChange.originalRange.delta(-change.original.startLineNumber + 1);
            const modifiedRange = innerChange.modifiedRange.delta(-change.modified.startLineNumber + 1);
            return {
                originalRange: LineRange.fromRange(originalRange),
                modifiedRange: LineRange.fromRange(modifiedRange)
            }
          })
        });
      }
    }
  
    const newFullRangeTextLines = [...modifiedLines, ...pendingLines];
    let activeLine: number | undefined;
    let pendingRange = new LineRange(1, 1);
  
    if (pendingLines.length > 0) {
      activeLine = modifiedLines.length + 1;
      pendingRange = new LineRange(modifiedLines.length + 1, modifiedLines.length + 1 + pendingLines.length);
    }
  
    return {
      newFullRangeTextLines,
      changes: diffChanges,
      activeLine,
      pendingRange
    };
  }
  