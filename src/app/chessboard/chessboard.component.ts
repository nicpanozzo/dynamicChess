import { Component, HostListener, OnDestroy, Input, Output, EventEmitter, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SocketService } from '../socket.service'; // Import SocketService

@Component({
  selector: 'app-chessboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chessboard.component.html',
  styleUrls: ['./chessboard.component.css']
})
export class ChessboardComponent implements OnDestroy {
  @Input() playerColor: 'white' | 'black' | 'spectator' | null = null;
  @Input() sharedCooldowns: boolean = false;
  @Output() moveMade = new EventEmitter<{ startRow: number, startCol: number, endRow: number, endCol: number }>();

  private _customCooldowns: { [key: string]: number } | null = null;

  @Input()
  get customCooldowns(): { [key: string]: number } | null {
    return this._customCooldowns;
  }

  set customCooldowns(value: { [key: string]: number } | null) {
    this._customCooldowns = value;
    if (value) {
      this.pieceCooldowns = { ...this.pieceCooldowns, ...value };
    }
  }

  @Input() board: string[][] = [];
  selectedPieces: { row: number, col: number, piece: string }[] = [];
  turn: 'white' | 'black' = 'white';
  numpadDirection: number | null = null;
  pressTimer: any;
  pressPercentage = 0;
  reachedCell: { row: number, col: number } | null = null;
  landingCell: { row: number, col: number } | null = null;
  landingCells: Map<string, { row: number, col: number }> = new Map();
  isLandingMoveLegal: boolean = false;
  isLandingMoveLegalMap: Map<string, boolean> = new Map();
  isMoveCanceled: boolean = false;
  cooldowns = new Map<string, number>();
  cooldownDisplay = new Map<string, { timeLeft: number, opacity: number }>();
  private animationFrameId: number | undefined;
  currentPieceIndex = 0;

  pieceCooldowns: { [key: string]: number } = {
    p: 2000,
    n: 6000,
    b: 6000,
    r: 9000,
    q: 0,
    k: 0
  };

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement) {
      return;
    }
    if (event.key === '5' && this.pressTimer) { // Cancel move with '5'
      this.isMoveCanceled = true;
      this.resetMoveState(); // Reset state immediately
      this.applyCooldown(false, this.selectedPieces); // Apply half cooldown
      event.preventDefault(); // Prevent default '5' behavior
      return;
    }

    if (event.key >= '1' && event.key <= '9') {
      if (!this.pressTimer) {
        this.pressTimer = Date.now();
        this.numpadDirection = parseInt(event.key, 10);
        this.updatePressPercentage();
      }
      return;
    }

    const pieceType = event.key.toLowerCase();
    const pieces = this.getPiecesOfType(pieceType);

    if (pieces.length > 0) {
      if (event.shiftKey) {
        this.selectedPieces = pieces;
      } else {
        if (this.selectedPieces.length === 1 && this.selectedPieces[0].piece.toLowerCase() === pieceType) {
          this.currentPieceIndex = (this.currentPieceIndex + 1) % pieces.length;
        } else {
          this.currentPieceIndex = 0;
        }
        this.selectedPieces = [pieces[this.currentPieceIndex]];
      }
    }
  }

  @HostListener('document:keyup', ['$event'])
  handleKeyupEvent(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement) {
      return;
    }
    if (this.pressTimer && this.numpadDirection) {
      const pressDuration = Date.now() - this.pressTimer;

      if (this.isMoveCanceled) {
        this.applyCooldown(false, this.selectedPieces);
      } else {
        const piecesToMove: { row: number, col: number, piece: string }[] = [];
        const piecesToCooldown: { row: number, col: number, piece: string }[] = [];

        this.selectedPieces.forEach(piece => {
          const pieceKey = `${piece.row}-${piece.col}`;
          if (this.isLandingMoveLegalMap.get(pieceKey)) {
            piecesToMove.push(piece);
          } else {
            piecesToCooldown.push(piece);
          }
        });

        if (piecesToMove.length > 0) {
          this.movePiece(this.numpadDirection, pressDuration, piecesToMove);
        }
        if (piecesToCooldown.length > 0) {
          this.applyCooldown(true, piecesToCooldown);
        }
      }
      this.resetMoveState();
    }
  }

  constructor(private socketService: SocketService, private zone: NgZone) {
    this.socketService.listen('cooldownsUpdated').subscribe((cooldowns: any) => {
      this.cooldowns = new Map(Object.entries(cooldowns));
      if (!this.animationFrameId) {
        this.updateCooldowns();
      }
    });
  }

  ngOnDestroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  updateCooldowns() {
    if (!this.board || this.board.length === 0) {
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.cooldowns.forEach((cooldown, key) => {
        const remaining = cooldown - Date.now();
        if (remaining > 0) {
          const [row, col] = key.split('-').map(Number);
          const piece = this.board[row][col];
          if (piece) {
            const totalCooldown = this.pieceCooldowns[piece.toLowerCase() as keyof typeof this.pieceCooldowns];
            const opacity = remaining / totalCooldown;
            const timeLeft = Math.ceil(remaining / 1000);
            this.cooldownDisplay.set(key, { timeLeft, opacity });
          }
        } else {
          this.cooldownDisplay.delete(key);
        }
      });

      this.zone.run(() => {
        // This will trigger change detection
      });

      this.animationFrameId = requestAnimationFrame(() => this.updateCooldowns());
    });
  }

  initializeBoard() {
    this.board = [
      ['r', 'n', 'b', 'k', 'q', 'b', 'n', 'r'],
      ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
      ['R', 'N', 'B', 'K', 'Q', 'B', 'N', 'R']
    ];
    this.turn = 'white'; // Still here, but not used for multiplayer logic
    this.cooldowns.clear();
  }

  onCellClick(row: number, col: number) {
    const piece = this.board[row][col];

    if (this.selectedPieces.length > 0) {
      const pieceToMove = this.selectedPieces[0];
      this.move(pieceToMove.row, pieceToMove.col, row, col);
      this.selectedPieces = [];
    } else if (piece) {
      const isWhitePiece = piece === piece.toUpperCase();
      const isBlackPiece = piece === piece.toLowerCase();

      if ((this.playerColor === 'white' && isWhitePiece) || (this.playerColor === 'black' && isBlackPiece)) {
        this.selectedPieces = [{ row, col, piece }];
      }
    }
  }

  isValidMove(startRow: number, startCol: number, endRow: number, endCol: number): boolean {
    const piece = this.board[startRow][startCol];
    const targetPiece = this.board[endRow][endCol];

    const movingPieceIsWhite = piece === piece.toUpperCase();
    const movingPieceIsBlack = piece === piece.toLowerCase();

    if (targetPiece) {
      const targetPieceIsWhite = targetPiece === targetPiece.toUpperCase();
      const targetPieceIsBlack = targetPiece === targetPiece.toLowerCase();

      if ((movingPieceIsWhite && targetPieceIsWhite) || (movingPieceIsBlack && targetPieceIsBlack)) {
        return false;
      }
    }

    if (endRow < 0 || endRow > 7 || endCol < 0 || endCol > 7) {
      return false;
    }

    switch (piece.toLowerCase()) {
      case 'p': // Pawn
        const direction = piece === 'p' ? 1 : -1;
        const initialRow = piece === 'p' ? 1 : 6;

        if (startCol === endCol) {
          if (startRow === initialRow && endRow === startRow + 2 * direction && !this.board[startRow + direction][endCol] && !this.board[endRow][endCol]) {
            return true; // Double move
          }
          if (endRow === startRow + direction && !this.board[endRow][endCol]) {
            return true; // Single move
          }
        } else if (Math.abs(startCol - endCol) === 1 && endRow === startRow + direction && targetPiece) {
          return true; // Capture
        }
        break;
      case 'r': // Rook
        if (startRow === endRow) {
          const step = endCol > startCol ? 1 : -1;
          for (let col = startCol + step; col !== endCol; col += step) {
            if (this.board[startRow][col]) {
              return false; // Collision
            }
          }
          return true;
        }
        if (startCol === endCol) {
          const step = endRow > startRow ? 1 : -1;
          for (let row = startRow + step; row !== endRow; row += step) {
            if (this.board[row][startCol]) {
              return false; // Collision
            }
          }
          return true;
        }
        break;
      case 'n': // Knight
        const dx = Math.abs(startRow - endRow);
        const dy = Math.abs(startCol - endCol);
        return (dx === 2 && dy === 1) || (dx === 1 && dy === 2);
      case 'b': // Bishop
        if (Math.abs(startRow - endRow) === Math.abs(startCol - endCol)) {
          const rowStep = endRow > startRow ? 1 : -1;
          const colStep = endCol > startCol ? 1 : -1;
          let row = startRow + rowStep;
          let col = startCol + colStep;
          while (row !== endRow) {
            if (this.board[row][col]) {
              return false; // Collision
            }
            row += rowStep;
            col += colStep;
          }
          return true;
        }
        break;
      case 'q': // Queen
        if (startRow === endRow || startCol === endCol || Math.abs(startRow - endRow) === Math.abs(startCol - endCol)) {
          const rowStep = startRow === endRow ? 0 : (endRow > startRow ? 1 : -1);
          const colStep = startCol === endCol ? 0 : (endCol > startCol ? 1 : -1);
          let row = startRow + rowStep;
          let col = startCol + colStep;
          while (row !== endRow || col !== endCol) {
            if (this.board[row][col]) {
              return false; // Collision
            }
            row += rowStep;
            col += colStep;
          }
          return true;
        }
        break;
      case 'k': // King
        const dxk = Math.abs(startRow - endRow);
        const dyk = Math.abs(startCol - endCol);
        return dxk <= 1 && dyk <= 1;
    }

    return false;
  }

  getPiecesOfType(pieceType: string): { row: number, col: number, piece: string }[] {
    const pieces: { row: number, col: number, piece: string }[] = [];
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = this.board[i][j];
        const isWhitePiece = piece === piece.toUpperCase();
        const isBlackPiece = piece === piece.toLowerCase();

        if (piece.toLowerCase() === pieceType && ((this.playerColor === 'white' && isWhitePiece) || (this.playerColor === 'black' && isBlackPiece))) {
          const cooldown = this.cooldowns.get(`${i}-${j}`);
          if (!cooldown || cooldown < Date.now()) {
            pieces.push({ row: i, col: j, piece });
          }
        }
      }
    }
    return pieces;
  }

  movePiece(direction: number, pressDuration: number, piecesToMove: { row: number, col: number, piece: string }[]) {
    if (piecesToMove.length === 0) {
      return;
    }

    piecesToMove.forEach(selectedPiece => {
      const { row, col, piece } = selectedPiece;
      const pieceKey = `${row}-${col}`;
      const landing = this.landingCells.get(pieceKey);

      if (!landing) {
        console.warn(`No landing cell found for piece at ${pieceKey}`);
        return;
      }

      this.move(row, col, landing.row, landing.col);
    });
    this.selectedPieces = [];
  }

  move(startRow: number, startCol: number, endRow: number, endCol: number) {
    this.moveMade.emit({ startRow, startCol, endRow, endCol });
  }

  updatePressPercentage() {
    if (this.pressTimer) {
      this.zone.run(() => {
        const pressDuration = Date.now() - this.pressTimer;
        this.pressPercentage = Math.min(100, (pressDuration / 2000) * 100);

        this.landingCells.clear();
        this.isLandingMoveLegalMap.clear();

        this.selectedPieces.forEach(piece => {
          const { row, col, piece: pieceName } = piece;
          const pieceKey = `${row}-${col}`;
          const pieceType = pieceName.toLowerCase();
          let rowStep = 0;
          let colStep = 0;

          let targetRow: number | undefined;
          let targetCol: number | undefined;

          if (pieceType === 'n') {
            const longPress = pressDuration > 1000;
            let newRow1: number | undefined = undefined;
            let newCol1: number | undefined = undefined;
            let newRow2: number | undefined = undefined;
            let newCol2: number | undefined = undefined;

            switch (this.numpadDirection) {
              case 1: newRow1 = row + 1; newCol1 = col - 2; newRow2 = row + 2; newCol2 = col - 1; break;
              case 2: newRow1 = row + 2; newCol1 = col - 1; newRow2 = row + 2; newCol2 = col + 1; break;
              case 3: newRow1 = row + 1; newCol1 = col + 2; newRow2 = row + 2; newCol2 = col + 1; break;
              case 4: newRow1 = row - 1; newCol1 = col - 2; newRow2 = row + 1; newCol2 = col - 2; break;
              case 6: newRow1 = row - 1; newCol1 = col + 2; newRow2 = row + 1; newCol2 = col + 2; break;
              case 7: newRow1 = row - 1; newCol1 = col - 2; newRow2 = row - 2; newCol2 = col - 1; break;
              case 8: newRow1 = row - 2; newCol1 = col - 1; newRow2 = row - 2; newCol2 = col + 1; break;
              case 9: newRow1 = row - 1; newCol1 = col + 2; newRow2 = row - 2; newCol2 = col + 1; break;
            }

            if (newRow1 !== undefined && newCol1 !== undefined && newRow2 !== undefined && newCol2 !== undefined) {
              targetRow = longPress ? newRow2 : newRow1;
              targetCol = longPress ? newCol2 : newCol1;
            }

          } else {
            switch (this.numpadDirection) {
              case 1: rowStep = 1; colStep = -1; break;
              case 2: rowStep = 1; break;
              case 3: rowStep = 1; colStep = 1; break;
              case 4: colStep = -1; break;
              case 6: colStep = 1; break;
              case 7: rowStep = -1; colStep = -1; break;
              case 8: rowStep = -1; break;
              case 9: rowStep = -1; colStep = 1; break;
            }

            const distance = Math.floor(pressDuration / 500) + 1;
            let newRow = row;
            let newCol = col;
            for (let i = 0; i < distance; i++) {
              const tempRow = newRow + rowStep;
              const tempCol = newCol + colStep;
              // We need to check isValidMove from the original position
              if (this.isValidMove(row, col, tempRow, tempCol)) {
                newRow = tempRow;
                newCol = tempCol;
              } else {
                // If the next step is invalid, stop.
                break;
              }
            }
            targetRow = newRow;
            targetCol = newCol;
          }

          if (targetRow !== undefined && targetCol !== undefined) {
            // Boundary check before storing
            if (targetRow >= 0 && targetRow <= 7 && targetCol >= 0 && targetCol <= 7) {
              this.landingCells.set(pieceKey, { row: targetRow, col: targetCol });
              const isLegal = this.isValidMove(row, col, targetRow, targetCol);
              this.isLandingMoveLegalMap.set(pieceKey, isLegal);

              // For single piece selection, keep the old properties for UI feedback
              if (this.selectedPieces.length === 1) {
                this.landingCell = { row: targetRow, col: targetCol };
                this.isLandingMoveLegal = isLegal;
              }
            } else {
              // Mark as illegal if out of bounds
              this.isLandingMoveLegalMap.set(pieceKey, false);
              if (this.selectedPieces.length === 1) {
                this.isLandingMoveLegal = false;
              }
            }
          } else {
            // If targetRow or targetCol are undefined, it's an invalid move
            this.isLandingMoveLegalMap.set(pieceKey, false);
            if (this.selectedPieces.length === 1) {
              this.isLandingMoveLegal = false;
            }
          }
        });
      });

      requestAnimationFrame(() => this.updatePressPercentage());
    }
  }

  getDirectionIcon(direction: number): string {
    switch (direction) {
      case 1: return '⇙';
      case 2: return '↓';
      case 3: return '⇘';
      case 4: return '←';
      case 6: return '→';
      case 7: return '⇖';
      case 8: return '↑';
      case 9: return '⇗';
      default: return '';
    }
  }

  getCooldownTimeLeft(row: number, col: number): number {
    const display = this.cooldownDisplay.get(`${row}-${col}`);
    return display ? display.timeLeft : 0;
  }

  getCooldownOpacity(row: number, col: number): number {
    const display = this.cooldownDisplay.get(`${row}-${col}`);
    return display ? display.opacity : 0;
  }

  isSelected(row: number, col: number): boolean {
    return this.selectedPieces.some(p => p.row === row && p.col === col);
  }

  isReached(row: number, col: number): boolean {
    return this.reachedCell?.row === row && this.reachedCell?.col === col;
  }

  isLanding(row: number, col: number): boolean {
    // Check if any of the selected pieces have this cell as a landing cell
    for (const [key, landing] of this.landingCells.entries()) {
      if (landing.row === row && landing.col === col) {
        return true;
      }
    }
    return false;
  }

  isIllegalLanding(row: number, col: number): boolean {
    // Check if this cell is a landing cell for any piece and if that move is illegal
    for (const [key, landing] of this.landingCells.entries()) {
      if (landing.row === row && landing.col === col) {
        return !this.isLandingMoveLegalMap.get(key);
      }
    }
    return false;
  }

  getPieceSymbol(piece: string): string {
    switch (piece) {
      case 'p': return '♟';
      case 'r': return '♜';
      case 'n': return '♞';
      case 'b': return '♝';
      case 'q': return '♛';
      case 'k': return '♚';
      case 'P': return '♙';
      case 'R': return '♖';
      case 'N': return '♘';
      case 'B': return '♗';
      case 'Q': return '♕';
      case 'K': return '♔';
      default: return '';
    }
  }

  private applyCooldown(full: boolean, pieces: { row: number, col: number, piece: string }[]) {
    pieces.forEach(selectedPiece => {
      const { row, col, piece } = selectedPiece;
      const pieceType = piece.toLowerCase() as keyof typeof this.pieceCooldowns;
      const cooldownDuration = this.pieceCooldowns[pieceType];
      const actualCooldown = full ? cooldownDuration : cooldownDuration / 2;
      if (actualCooldown > 0) {
        this.cooldowns.set(`${row}-${col}`, Date.now() + actualCooldown);
      }
    });
  }

  private resetMoveState() {
    this.pressTimer = null;
    this.numpadDirection = null;
    this.pressPercentage = 0;
    this.landingCell = null;
    this.isLandingMoveLegal = false;
    this.isMoveCanceled = false;
    this.selectedPieces = [];
    this.landingCells.clear();
    this.isLandingMoveLegalMap.clear();
    setTimeout(() => this.reachedCell = null, 1000);
  }
}