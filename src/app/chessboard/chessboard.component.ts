import { Component, HostListener, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-chessboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chessboard.component.html',
  styleUrls: ['./chessboard.component.css']
})
export class ChessboardComponent implements OnDestroy {
  @Input() playerColor: 'white' | 'black' | null = null;

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

  board: string[][] = [];
  selectedPieces: { row: number, col: number, piece: string }[] = [];
  turn: 'white' | 'black' = 'white';
  numpadDirection: number | null = null;
  pressTimer: any;
  pressPercentage = 0;
  reachedCell: { row: number, col: number } | null = null;
  landingCell: { row: number, col: number } | null = null;
  isLandingMoveLegal: boolean = false; // New property
  isMoveCanceled: boolean = false; // New property
  cooldowns = new Map<string, number>();
  currentPieceIndex = 0;
  cooldownInterval: any;

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
    if (event.key === '5' && this.pressTimer) { // Cancel move with '5'
      this.isMoveCanceled = true;
      this.resetMoveState(); // Reset state immediately
      this.applyCooldown(false); // Apply half cooldown
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
    if (this.pressTimer && this.numpadDirection) {
      const pressDuration = Date.now() - this.pressTimer;

      if (this.isMoveCanceled) {
        this.applyCooldown(false); // Half cooldown for canceled move
      } else if (this.isLandingMoveLegal) {
        this.movePiece(this.numpadDirection, pressDuration);
      } else {
        // Move was illegal, apply full cooldown without moving piece
        this.applyCooldown(true);
      }
      this.resetMoveState();
    }
  }

  constructor() {
    this.initializeBoard();
    this.cooldownInterval = setInterval(() => {
      // This will trigger change detection
    }, 100);
  }

  ngOnDestroy() {
    clearInterval(this.cooldownInterval);
  }

  initializeBoard() {
    this.board = [
      ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
      ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
      ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
    ];
    this.turn = 'white'; // Still here, but not used for multiplayer logic
    this.cooldowns.clear();
  }

  onCellClick(row: number, col: number) {
    const piece = this.board[row][col];

    if (this.selectedPieces.length > 0) {
      this.selectedPieces.forEach(selectedPiece => {
        if (this.isValidMove(selectedPiece.row, selectedPiece.col, row, col)) {
          this.move(selectedPiece.row, selectedPiece.col, row, col);
        }
      });
      this.selectedPieces = [];
    } else if (piece) {
      const isWhitePiece = piece === piece.toUpperCase();
      const isBlackPiece = piece === piece.toLowerCase();

      if ((this.playerColor === 'white' && isWhitePiece) || (this.playerColor === 'black' && isBlackPiece)) {
        const cooldown = this.cooldowns.get(`${row}-${col}`);
        if (!cooldown || cooldown < Date.now()) {
          this.selectedPieces = [{ row, col, piece }];
        }
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

  movePiece(direction: number, pressDuration: number) {
    if (this.selectedPieces.length === 0) {
      return;
    }

    this.selectedPieces.forEach(selectedPiece => {
      const { row, col, piece } = selectedPiece;
      const pieceType = piece.toLowerCase() as keyof typeof this.pieceCooldowns;

      let rowStep = 0;
      let colStep = 0;

      if (pieceType === 'n') {
        const longPress = pressDuration > 1000;
        let newRow1: number, newCol1: number, newRow2: number, newCol2: number;

        switch (direction) {
          case 1: newRow1 = row + 1; newCol1 = col - 2; newRow2 = row + 2; newCol2 = col - 1; break;
          case 2: newRow1 = row + 2; newCol1 = col - 1; newRow2 = row + 2; newCol2 = col + 1; break;
          case 3: newRow1 = row + 1; newCol1 = col + 2; newRow2 = row + 2; newCol2 = col + 1; break;
          case 4: newRow1 = row - 1; newCol1 = col - 2; newRow2 = row + 1; newCol2 = col - 2; break;
          case 6: newRow1 = row - 1; newCol1 = col + 2; newRow2 = row + 1; newCol2 = col + 2; break;
          case 7: newRow1 = row - 1; newCol1 = col - 2; newRow2 = row - 2; newCol2 = col - 1; break;
          case 8: newRow1 = row - 2; newCol1 = col - 1; newRow2 = row - 2; newCol2 = col + 1; break;
          case 9: newRow1 = row - 1; newCol1 = col + 2; newRow2 = row - 2; newCol2 = col + 1; break;
          default: return;
        }

        const targetRow = longPress ? newRow2 : newRow1;
        const targetCol = longPress ? newCol2 : newCol1;

        if (this.isValidMove(row, col, targetRow, targetCol)) {
          this.move(row, col, targetRow, targetCol);
        }
        return;
      }

      switch (direction) {
        case 1: rowStep = 1; colStep = -1; break;
        case 2: rowStep = 1; break;
        case 3: rowStep = 1; colStep = 1; break;
        case 4: colStep = -1; break;
        case 6: colStep = 1; break;
        case 7: rowStep = -1; colStep = -1; break;
        case 8: rowStep = -1; break;
        case 9: rowStep = -1; colStep = 1; break;
      }

      if (pieceType === 'p') {
        if (this.landingCell && this.isLandingMoveLegal) {
          this.move(row, col, this.landingCell.row, this.landingCell.col);
        } else {
          // Fallback to original logic if landingCell is not valid or move is illegal
          const maxDistance = (row === 1 && piece === 'p') || (row === 6 && piece === 'P') ? 2 : 1;
          const distance = pressDuration > 2000 ? maxDistance : 1;
          const newRow = row + rowStep * distance;
          const newCol = col + colStep * distance;
          if (this.isValidMove(row, col, newRow, newCol)) {
            this.move(row, col, newRow, newCol);
          }
        }
      } else if (pieceType === 'r' || pieceType === 'b' || pieceType === 'q') {
        const distance = Math.floor(pressDuration / 500) + 1;
        let newRow = row;
        let newCol = col;
        for (let i = 0; i < distance; i++) {
          const tempRow = newRow + rowStep;
          const tempCol = newCol + colStep;
          if (this.isValidMove(row, col, tempRow, tempCol)) {
            newRow = tempRow;
            newCol = tempCol;
          } else {
            break;
          }
        }
        if (newRow !== row || newCol !== col) {
          this.move(row, col, newRow, newCol);
        }
      }
    });
    this.selectedPieces = [];
  }

  move(startRow: number, startCol: number, endRow: number, endCol: number) {
    let piece = this.board[startRow][startCol];
    this.board[endRow][endCol] = piece;
    this.board[startRow][startCol] = '';
    this.reachedCell = { row: endRow, col: endCol };

    if (piece.toLowerCase() === 'p') {
      if ((piece === 'P' && endRow === 0) || (piece === 'p' && endRow === 7)) {
        this.board[endRow][endCol] = (piece === 'P' ? 'Q' : 'q');
      }
    }

    this.turn = 'white'; // No longer used for multiplayer logic
    const cooldown = this.pieceCooldowns[piece.toLowerCase() as keyof typeof this.pieceCooldowns];
    if (cooldown > 0) {
      this.cooldowns.set(`${endRow}-${endCol}`, Date.now() + cooldown);
    }
  }

  updatePressPercentage() {
    if (this.pressTimer) {
      const pressDuration = Date.now() - this.pressTimer;
      this.pressPercentage = Math.min(100, (pressDuration / 2000) * 100);

      if (this.selectedPieces.length === 1) {
        const { row, col, piece } = this.selectedPieces[0];
        const pieceType = piece.toLowerCase();
        let rowStep = 0;
        let colStep = 0;

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
            this.landingCell = longPress ? { row: newRow2, col: newCol2 } : { row: newRow1, col: newCol1 };
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
            if (this.isValidMove(row, col, tempRow, tempCol)) {
              newRow = tempRow;
              newCol = tempCol;
            } else {
              break;
            }
          }
          this.landingCell = { row: newRow, col: newCol };
        }

        // Check legality of the landing cell
        if (this.selectedPieces.length > 0 && this.landingCell) {
          const { row: startR, col: startC } = this.selectedPieces[0];
          this.isLandingMoveLegal = this.isValidMove(startR, startC, this.landingCell.row, this.landingCell.col);
        }
      }

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
    const cooldown = this.cooldowns.get(`${row}-${col}`);
    if (cooldown) {
      const remaining = cooldown - Date.now();
      return Math.ceil(remaining / 1000); // Return seconds, rounded up
    }
    return 0;
  }

  getCooldownOpacity(row: number, col: number): number {
    const cooldown = this.cooldowns.get(`${row}-${col}`);
    if (cooldown) {
      const remaining = cooldown - Date.now();
      if (remaining > 0) {
        const piece = this.board[row][col];
        if (piece) {
          const totalCooldown = this.pieceCooldowns[piece.toLowerCase() as keyof typeof this.pieceCooldowns];
          return (remaining / totalCooldown);
        }
      }
    }
    return 0;
  }

  isSelected(row: number, col: number): boolean {
    return this.selectedPieces.some(p => p.row === row && p.col === col);
  }

  isReached(row: number, col: number): boolean {
    return this.reachedCell?.row === row && this.reachedCell?.col === col;
  }

  isLanding(row: number, col: number): boolean {
    return this.landingCell?.row === row && this.landingCell?.col === col;
  }

  isIllegalLanding(row: number, col: number): boolean {
    return this.isLanding(row, col) && !this.isLandingMoveLegal;
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

  private applyCooldown(full: boolean) {
    this.selectedPieces.forEach(selectedPiece => {
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
    setTimeout(() => this.reachedCell = null, 1000);
  }
}