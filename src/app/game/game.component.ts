import { Component, OnInit, OnDestroy, ViewChild, AfterViewInit, NgZone, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChessboardComponent } from '../chessboard/chessboard.component';
import { SocketService } from '../socket.service';
import { ActivatedRoute, Router } from '@angular/router';
import { MoveQueueComponent } from './move-queue/move-queue.component';
import { UserService } from '../user.service';
import { LobbyService } from '../lobby.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, ChessboardComponent, MoveQueueComponent],
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.css']
})
export class GameComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('chessboard') chessboard!: ChessboardComponent;
  @ViewChild('commandInput') commandInputField!: ElementRef;

  roomCode: string | null = null;
  playerColor: 'white' | 'black' | 'spectator' | null = null;
  board: string[][] = [];
  moveQueue: Map<string, { endRow: number; endCol: number }[]> = new Map();
  cooldowns: { [key: string]: number } = {};
  customCooldowns: { [key: string]: number } = {};
  sharedCooldowns: boolean = false;
  winner: 'white' | 'black' | null = null;
  players: { id: string, username: string, color: 'white' | 'black' | 'spectator', wins: number, losses: number }[] = [];
  commandError: string | null = null;
  commandHistory: string[] = [];
  historyIndex: number = -1;
  opponentUsername: string = '';
  playerWins: number = 0;
  playerLosses: number = 0;
  showCommands: boolean = false;
  isGameOver: boolean = false;

  private socketSubscription: Subscription | undefined;
  private lobbySubscription: Subscription | undefined;

  constructor(
    private socketService: SocketService,
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService,
    private lobbyService: LobbyService,
    private zone: NgZone
  ) { }

  ngOnInit(): void {
    this.socketSubscription = this.socketService.getEvents().subscribe(event => {
      this.zone.run(() => {
        if (event.type === 'gameStarted') {
          this.board = event.data.board;
          this.playerColor = event.data.players.find((p: any) => p.id === this.socketService.id)?.color || 'spectator';
          console.log('--- GAME COMPONENT: gameStarted, playerColor ---', this.playerColor);
          this.players = event.data.players;
          this.updatePlayerStats();
          this.moveQueue = new Map(Object.entries(event.data.moveQueue || {}));
          this.cooldowns = event.data.cooldowns;
          this.winner = event.data.winner;
          this.isGameOver = !!event.data.winner;
          this.customCooldowns = event.data.customCooldowns;
          this.sharedCooldowns = event.data.sharedCooldowns;
        } else if (event.type === 'moveMade') {
          this.board = event.data.board;
          this.moveQueue = new Map(Object.entries(event.data.moveQueue || {}));
        } else if (event.type === 'queueUpdated') {
          this.moveQueue = new Map(Object.entries(event.data || {}));
        } else if (event.type === 'cooldownsUpdated') {
          this.cooldowns = event.data;
        } else if (event.type === 'gameOver') {
          this.winner = event.data.winner;
          this.board = event.data.board;
          this.players = event.data.players;
          this.updatePlayerStats();
          this.isGameOver = true;
        } else if (event.type === 'gameUpdate') {
          this.board = event.data.board;
          this.moveQueue = new Map(Object.entries(event.data.moveQueue || {}));
          this.cooldowns = event.data.cooldowns;
          this.winner = event.data.winner;
          this.players = event.data.players;
          this.playerColor = event.data.players.find((p: any) => p.id === this.socketService.id)?.color || 'spectator';
          console.log('--- GAME COMPONENT: gameUpdate, playerColor ---', this.playerColor);
          this.customCooldowns = event.data.customCooldowns;
          this.sharedCooldowns = event.data.sharedCooldowns;
        } else if (event.type === 'commandError') {
          this.commandError = event.data;
          setTimeout(() => this.commandError = null, 3000);
        }
      });
    });

    this.route.paramMap.subscribe(params => {
      this.roomCode = params.get('roomCode');
      const username = this.userService.getUsername();
      if (this.roomCode && username) {
        this.socketService.emit('enterRoom', { roomCode: this.roomCode, username: username });
      }
    });

    this.lobbySubscription = this.lobbyService.lobbyState.subscribe((lobbyState: any) => {
      if (lobbyState) {
        this.customCooldowns = lobbyState.customCooldowns;
        this.sharedCooldowns = lobbyState.sharedCooldowns;
        if (lobbyState.board) {
          this.board = lobbyState.board;
          this.playerColor = lobbyState.players.find((p: any) => p.id === this.socketService.id)?.color || 'spectator';
          console.log('--- GAME COMPONENT: lobbyState, playerColor ---', this.playerColor);
          this.players = lobbyState.players;
          this.updatePlayerStats();
          this.moveQueue = new Map(Object.entries(lobbyState.moveQueue || {}));
          this.cooldowns = lobbyState.cooldowns;
          this.winner = lobbyState.winner;
          this.isGameOver = !!lobbyState.winner;
        }
      }
    });
  }

  ngAfterViewInit(): void {
    // Focus the command input field after the view has initialized
    if (this.commandInputField) {
      this.commandInputField.nativeElement.focus();
    }
  }

  ngOnDestroy(): void {
    this.socketSubscription?.unsubscribe();
    this.lobbySubscription?.unsubscribe();
  }

  executeCommand(command: string) {
    if (this.roomCode && command) {
      this.socketService.emit('executeCommand', { roomCode: this.roomCode, command });
      this.commandHistory.unshift(command); // Add to the beginning of the history
      this.historyIndex = -1; // Reset history index
      this.commandInputField.nativeElement.value = ''; // Clear input after command
    }
  }

  onMoveMade(move: { startRow: number, startCol: number, endRow: number, endCol: number }) {
    if (this.roomCode) {
      this.socketService.emit('makeMove', { roomCode: this.roomCode, move, playerColor: this.playerColor });
    }
  }

  @HostListener('keydown.arrowup', ['$event'])
  onArrowUp(event: any) {
    const keyboardEvent = event as KeyboardEvent;
    if (this.commandInputField && this.commandInputField.nativeElement === document.activeElement) {
      keyboardEvent.preventDefault(); // Prevent cursor from moving in the input
      if (this.commandHistory.length > 0) {
        this.historyIndex = Math.min(this.commandHistory.length - 1, this.historyIndex + 1);
        this.commandInputField.nativeElement.value = this.commandHistory[this.historyIndex];
      }
    }
  }

  @HostListener('keydown.arrowdown', ['$event'])
  onArrowDown(event: any) {
    const keyboardEvent = event as KeyboardEvent;
    if (this.commandInputField && this.commandInputField.nativeElement === document.activeElement) {
      keyboardEvent.preventDefault(); // Prevent cursor from moving in the input
      if (this.commandHistory.length > 0) {
        this.historyIndex = Math.max(-1, this.historyIndex - 1);
        if (this.historyIndex === -1) {
          this.commandInputField.nativeElement.value = '';
        } else {
          this.commandInputField.nativeElement.value = this.commandHistory[this.historyIndex];
        }
      }
    }
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

  onClearQueueForPiece(pieceKey: string) {
    if (this.roomCode) {
      this.socketService.emit('cancelFromQueue', { roomCode: this.roomCode, pieceKey, moveIndex: -1 });
    }
  }

  updatePlayerStats() {
    const username = this.userService.getUsername();
    const player = this.players.find(p => p.username === username);
    if (player) {
      this.playerWins = player.wins;
      this.playerLosses = player.losses;
    }
  }

  leaveRoom(): void {
    if (this.roomCode) {
      this.socketService.emit('leaveRoom', { roomCode: this.roomCode });
      this.router.navigate(['/home']);
    }
  }

  resign(): void {
    if (this.roomCode) {
      this.socketService.emit('resign', { roomCode: this.roomCode });
    }
  }

  backToLobby(): void {
    this.router.navigate(['/lobby', this.roomCode]);
  }
}