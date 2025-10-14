import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router'; // Import Router
import { CommonModule } from '@angular/common';
import { ChessboardComponent } from '../chessboard/chessboard.component';
import { SocketService } from '../socket.service';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, ChessboardComponent],
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.css']
})
export class GameComponent implements OnInit, AfterViewInit {
  @ViewChild(ChessboardComponent) chessboard!: ChessboardComponent;

  roomCode: string | null = null;
  playerColor: 'white' | 'black' | null = null;
  opponentUsername: string = 'Waiting for opponent...';
  isGameOver: boolean = false;
  winner: 'white' | 'black' | null = null;
  rematchOffered: boolean = false;
  rematchRequested: boolean = false;
  playerWins: number = 0;
  playerLosses: number = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router, // Inject Router
    private socketService: SocketService
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.roomCode = params['room'];
      this.playerColor = params['color'];
    });

    this.socketService.listen('moveMade').subscribe((data: { move: any, board: string[][] }) => {
      if (this.chessboard) {
        this.chessboard.board = data.board;
      }
    });

    this.socketService.listen('playerJoined').subscribe((data: { username: string, players: any[] }) => {
      const opponent = data.players.find(p => p.color !== this.playerColor);
      if (opponent) {
        this.opponentUsername = opponent.username;
      }
    });

    this.socketService.listen('playerDisconnected').subscribe((data: { username: string }) => {
      this.opponentUsername = `${data.username} disconnected.`;
      // If opponent disconnects, and game is not over, you win
      if (!this.isGameOver) {
        this.isGameOver = true;
        this.winner = this.playerColor; // You win by default
        this.playerWins++;
        alert(`${data.username} disconnected. You win!`);
      }
    });

    this.socketService.listen('gameOver').subscribe((data: { winner: 'white' | 'black', board: string[][], records: { [key: string]: { wins: number, losses: number } } }) => {
      console.log('Game Over event received:', data);
      this.isGameOver = true;
      this.winner = data.winner;
      if (this.chessboard) {
        this.chessboard.board = data.board; // Update to final board state
      }
      // Update player records
      if (this.playerColor) {
        this.playerWins = data.records[this.playerColor].wins;
        this.playerLosses = data.records[this.playerColor].losses;
      }
    });

    this.socketService.listen('moveError').subscribe((message: string) => {
      alert(`Move Error: ${message}`);
    });

    this.socketService.listen('rematchRequest').subscribe(() => {
      console.log('Rematch request received!');
      this.rematchRequested = true;
    });

    this.socketService.listen('rematchAccepted').subscribe((data: { board: string[][], records: { [key: string]: { wins: number, losses: number } } }) => {
      this.resetGame(data.board, data.records);
      alert('Rematch accepted! New game starting.');
    });

    this.socketService.listen('rematchDeclined').subscribe(() => {
      this.rematchOffered = false;
      alert('Rematch declined.');
    });

    this.socketService.listen('gameReset').subscribe((data: { board: string[][], records: { [key: string]: { wins: number, losses: number } } }) => {
      this.resetGame(data.board, data.records);
    });
  }

  ngAfterViewInit() {
    if (this.chessboard) {
      this.chessboard.playerColor = this.playerColor;

      const originalMove = this.chessboard.move.bind(this.chessboard);
      this.chessboard.move = (startRow, startCol, endRow, endCol) => {
        if (this.roomCode && !this.isGameOver) {
          originalMove(startRow, startCol, endRow, endCol);

          this.socketService.emit('makeMove', {
            roomCode: this.roomCode,
            playerColor: this.playerColor,
            move: {
              startRow, startCol, endRow, endCol,
              newBoard: this.chessboard.board,
            }
          });
        } else if (this.isGameOver) {
          console.log("Game is over.");
        } else {
          console.log("Not in a multiplayer room.");
        }
      };
    }
  }

  resign() {
    if (confirm('Are you sure you want to resign?')) {
      this.socketService.emit('resign', { roomCode: this.roomCode, playerColor: this.playerColor });
    }
  }

  backToHome() {
    this.socketService.disconnect(); // Disconnect from the game room
    this.router.navigate(['/']); // Navigate back to the lobby
  }

  proposeRematch() {
    this.socketService.emit('rematchRequest', { roomCode: this.roomCode, playerColor: this.playerColor });
    this.rematchOffered = true;
  }

  acceptRematch() {
    this.socketService.emit('rematchAccept', { roomCode: this.roomCode, playerColor: this.playerColor });
    this.rematchRequested = false;
  }

  declineRematch() {
    this.socketService.emit('rematchDecline', { roomCode: this.roomCode, playerColor: this.playerColor });
    this.rematchRequested = false;
  }

  private resetGame(board: string[][], records: { [key: string]: { wins: number, losses: number } }) {
    this.isGameOver = false;
    this.winner = null;
    this.rematchOffered = false;
    this.rematchRequested = false;
    if (this.chessboard) {
      this.chessboard.board = board;
      this.chessboard.initializeBoard(); // Re-initialize other chessboard state if necessary
    }
    // Update player records
    if (this.playerColor) {
      this.playerWins = records[this.playerColor].wins;
      this.playerLosses = records[this.playerColor].losses;
    }
  }
}