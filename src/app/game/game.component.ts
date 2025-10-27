import { Component, OnInit, OnDestroy, ViewChild, AfterViewInit, NgZone } from '@angular/core';
import { Subscription } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ChessboardComponent } from '../chessboard/chessboard.component';
import { MoveQueueComponent } from './move-queue/move-queue.component';
import { SocketService } from '../socket.service';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, ChessboardComponent, MoveQueueComponent],
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.css']
})
export class GameComponent implements OnInit, AfterViewInit, OnDestroy {
  public showCommands = false;

  @ViewChild(ChessboardComponent) chessboard!: ChessboardComponent;

  roomCode: string | null = null;
  playerColor: 'white' | 'black' | 'spectator' | null = null;
  opponentUsername: string = 'Waiting for opponent...';
  isGameOver: boolean = false;
  winner: 'white' | 'black' | null = null;
  playerWins: number = 0;
  playerLosses: number = 0;
  customCooldowns: { [key: string]: number } | null = null;
  sharedCooldowns: boolean = false;
  moveQueue: Map<string, { endRow: number; endCol: number }[]> = new Map();
  commandError: string | null = null;

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
    this.roomCode = this.route.snapshot.queryParams['room'];
    this.playerColor = this.route.snapshot.queryParams['color'];
    const customCooldownsParam = this.route.snapshot.queryParams['customCooldowns'];
    if (customCooldownsParam) {
      this.customCooldowns = JSON.parse(customCooldownsParam);
    }
    this.sharedCooldowns = this.route.snapshot.queryParams['sharedCooldowns'] === 'true';

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
        console.log('Move Error received:', message);
        this.commandError = message;
        setTimeout(() => this.commandError = null, 3000);
      });
    }));

    this.subscriptions.add(this.socketService.listen('commandError').subscribe((message: string) => {
      this.zone.run(() => {
        console.log('Command Error received:', message);
        this.commandError = message;
        setTimeout(() => this.commandError = null, 3000);
      });
    }));

    this.subscriptions.add(this.socketService.listen('queueUpdated').subscribe((queue: any) => {
      this.zone.run(() => {
        this.moveQueue = new Map(Object.entries(queue));
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
      this.chessboard.sharedCooldowns = this.sharedCooldowns;

      this.chessboard.moveMade.subscribe(move => {
        if (this.roomCode && !this.isGameOver) {
          this.socketService.emit('makeMove', {
            roomCode: this.roomCode,
            playerColor: this.playerColor,
            move: move
          });
        }
      });
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

  onMoveReordered(event: { pieceKey: string, previousIndex: number, currentIndex: number }) {
    if (this.roomCode) {
      this.socketService.emit('reorderQueue', { ...event, roomCode: this.roomCode });
    }
  }

  onMoveCancelled(event: { pieceKey: string, moveIndex: number }) {
    if (this.roomCode) {
      this.socketService.emit('cancelFromQueue', { ...event, roomCode: this.roomCode });
    }
  }

  executeCommand(command: string) {
    if (this.roomCode && command) {
      this.socketService.emit('executeCommand', { roomCode: this.roomCode, command });
    }
  }





}
