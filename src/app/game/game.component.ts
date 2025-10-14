import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
  customCooldowns: { [key: string]: number } | null = null;

  private initialBoard: string[][] | null = null;
  private initialPlayers: any[] | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private socketService: SocketService
  ) {
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras.state) {
      this.initialBoard = navigation.extras.state['board'];
      this.initialPlayers = navigation.extras.state['players'];
    }
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.roomCode = params['room'];
      this.playerColor = params['color'];
      if (params['customCooldowns']) {
        this.customCooldowns = JSON.parse(params['customCooldowns']);
      }
    });

    if (this.initialPlayers) {
        const opponent = this.initialPlayers.find(p => p.color !== this.playerColor);
        if (opponent) {
            this.opponentUsername = opponent.username;
        }
    }


    this.socketService.listen('moveMade').subscribe((data: { move: any, board: string[][] }) => {
      if (this.chessboard) {
        this.chessboard.board = data.board;
      }
    });

    this.socketService.listen('playerDisconnected').subscribe((data: { username: string }) => {
      this.opponentUsername = `${data.username} disconnected.`;
      if (!this.isGameOver) {
        this.isGameOver = true;
        this.winner = this.playerColor;
        this.playerWins++;
        alert(`${data.username} disconnected. You win!`);
      }
    });

    this.socketService.listen('gameOver').subscribe((data: { winner: 'white' | 'black', board: string[][], players: any[] }) => {
      console.log('Game Over event received:', data);
      this.isGameOver = true;
      this.winner = data.winner;
      if (this.chessboard) {
        this.chessboard.board = data.board;
      }
      const myPlayer = data.players.find(p => p.color === this.playerColor);
      if (myPlayer) {
          this.playerWins = myPlayer.wins;
          this.playerLosses = myPlayer.losses;
      }
    });

    this.socketService.listen('moveError').subscribe((message: string) => {
      alert(`Move Error: ${message}`);
    });

    this.socketService.listen('rematchRequest').subscribe(() => {
      console.log('Rematch request received!');
      this.rematchRequested = true;
    });

    this.socketService.listen('rematchAccepted').subscribe((data: any) => {
        this.resetGame(data.board, data.players);
        // The server now swaps colors, so we just need to update our local color
        const myNewPlayer = data.players.find((p:any) => p.id === this.socketService.id);
        this.playerColor = myNewPlayer.color;

        if (this.chessboard) {
          this.chessboard.playerColor = this.playerColor;
          this.chessboard.customCooldowns = data.customCooldowns;
        }
        alert('Rematch accepted! New game starting.');
    });

    this.socketService.listen('rematchDeclined').subscribe(() => {
      this.rematchOffered = false;
      alert('Rematch declined.');
    });
  }

  ngAfterViewInit() {
    if (this.chessboard) {
      if (this.initialBoard) {
        this.chessboard.board = this.initialBoard;
      }
      this.chessboard.playerColor = this.playerColor;
      this.chessboard.customCooldowns = this.customCooldowns;

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
    this.socketService.disconnect();
    this.router.navigate(['/']);
  }

  proposeRematch() {
    this.socketService.emit('rematchRequest', { roomCode: this.roomCode, playerColor: this.playerColor });
    this.rematchOffered = true;
  }

  acceptRematch() {
    this.socketService.emit('rematchAccept', { roomCode: this.roomCode });
    this.rematchRequested = false;
  }

  declineRematch() {
    this.socketService.emit('rematchDecline', { roomCode: this.roomCode, playerColor: this.playerColor });
    this.rematchRequested = false;
  }

  private resetGame(board: string[][], players: any[]) {
    this.isGameOver = false;
    this.winner = null;
    this.rematchOffered = false;
    this.rematchRequested = false;
    if (this.chessboard) {
      this.chessboard.board = board;
      this.chessboard.initializeBoard();
    }
    const myPlayer = players.find(p => p.color === this.playerColor);
    if (myPlayer) {
        this.playerWins = myPlayer.wins;
        this.playerLosses = myPlayer.losses;
    }
  }
}
