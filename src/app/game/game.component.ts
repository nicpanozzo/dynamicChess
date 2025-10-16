import { Component, OnInit, OnDestroy, ViewChild, AfterViewInit, NgZone } from '@angular/core';
import { Subscription } from 'rxjs';
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
export class GameComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild(ChessboardComponent) chessboard!: ChessboardComponent;

  roomCode: string | null = null;
  playerColor: 'white' | 'black' | 'spectator' | null = null;
  opponentUsername: string = 'Waiting for opponent...';
  isGameOver: boolean = false;
  winner: 'white' | 'black' | null = null;
  playerWins: number = 0;
  playerLosses: number = 0;
  customCooldowns: { [key: string]: number } | null = null;

  private initialBoard: string[][] | null = null;
  private initialPlayers: any[] | null = null;
  private subscriptions = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private socketService: SocketService,
    private zone: NgZone
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


    this.subscriptions.add(this.socketService.listen('moveMade').subscribe((data: { move: any, board: string[][] }) => {
      console.log('[DEBUG] moveMade event received by client.', data);
      this.zone.run(() => {
        if (this.chessboard) {
          this.chessboard.board = data.board;
        }
      });
    }));

    this.subscriptions.add(this.socketService.listen('playerDisconnected').subscribe((data: { username: string }) => {
      this.zone.run(() => {
        this.opponentUsername = `${data.username} disconnected.`;
        // The server will send a 'gameOver' event to handle the game end state.
      });
    }));

    this.subscriptions.add(this.socketService.listen('gameOver').subscribe((data: { winner: 'white' | 'black', board: string[][], players: any[] }) => {
      this.zone.run(() => {
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
    }));

    this.subscriptions.add(this.socketService.listen('moveError').subscribe((message: string) => {
      this.zone.run(() => {
        alert(`Move Error: ${message}`);
      });
    }));
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
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

  backToLobby() {
    this.router.navigate(['/lobby', this.roomCode]);
  }

  leaveGameAndDisconnect() {
    this.socketService.disconnect();
    this.router.navigate(['/']);
  }

}
