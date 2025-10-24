import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, moveItemInArray, DragDropModule } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-move-queue',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './move-queue.component.html',
  styleUrls: ['./move-queue.component.css']
})
export class MoveQueueComponent {
  @Input() moveQueue: Map<string, { endRow: number; endCol: number }[]> = new Map();
  @Input() playerColor: 'white' | 'black' | 'spectator' | null = null;
  @Output() moveCancelled = new EventEmitter<{ pieceKey: string, moveIndex: number }>();
  @Output() moveReordered = new EventEmitter<{ pieceKey: string, previousIndex: number, currentIndex: number }>();


  get moveQueuesAsArray() {
    return Array.from(this.moveQueue.entries()).filter(entry => entry[1].length > 0);
  }

  trackByPieceKey(index: number, item: [string, any[]]): string {
    return item[0];
  }

  trackByMove(index: number, move: { endRow: number, endCol: number }): string {
    return `${move.endRow}-${move.endCol}`;
  }

  drop(event: CdkDragDrop<{ endRow: number; endCol: number }[]>, pieceKey: string) {
    this.moveReordered.emit({ pieceKey, previousIndex: event.previousIndex, currentIndex: event.currentIndex });
  }

  cancelMove(pieceKey: string, moveIndex: number) {
    console.log('MoveQueueComponent: Emitting moveCancelled', { pieceKey, moveIndex });
    this.moveCancelled.emit({ pieceKey, moveIndex });
  }

  moveUp(pieceKey: string, moveIndex: number) {
    if (moveIndex > 0) {
      this.moveReordered.emit({ pieceKey, previousIndex: moveIndex, currentIndex: moveIndex - 1 });
    }
  }

  moveDown(pieceKey: string, moveIndex: number) {
    const queue = this.moveQueue.get(pieceKey);
    if (queue && moveIndex < queue.length - 1) {
      this.moveReordered.emit({ pieceKey, previousIndex: moveIndex, currentIndex: moveIndex + 1 });
    }
  }

  getPieceNotation(pieceKey: string): string {
    const [row, col] = pieceKey.split('-').map(Number);
    let file: string;
    let rank: number;

    if (this.playerColor === 'black') {
      file = String.fromCharCode('h'.charCodeAt(0) - col);
      rank = 8 - row;
    } else { // white
      file = String.fromCharCode('a'.charCodeAt(0) + col);
      rank = 8 - row;
    }
    return `${file}${rank}`;
  }

  getMoveNotation(move: { endRow: number; endCol: number }): string {
    let file: string;
    let rank: number;

    if (this.playerColor === 'black') {
      file = String.fromCharCode('h'.charCodeAt(0) - move.endCol);
      rank = 8 - move.endRow;
    } else { // white
      file = String.fromCharCode('a'.charCodeAt(0) + move.endCol);
      rank = 8 - move.endRow;
    }
    return `${file}${rank}`;
  }
}
