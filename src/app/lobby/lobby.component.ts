import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SocketService } from '../socket.service';
import { LobbyService } from '../lobby.service';
import { UserService } from '../user.service'; // Import UserService
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lobby.component.html',
  styleUrls: ['./lobby.component.css']
})
export class LobbyComponent implements OnInit, OnDestroy {
  lobby: any = null;
  roomCode: string = '';
  myPlayerId: string | undefined = '';
  showCopyMessage = false;
  private subscriptions = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private socketService: SocketService,
    private zone: NgZone,
    private lobbyService: LobbyService, // Inject LobbyService
    private userService: UserService
  ) {
    this.myPlayerId = this.socketService.id;
    // Read the initial state directly from the service
    this.lobby = this.lobbyService.lobbyState;
  }

  ngOnInit() {
    this.roomCode = this.route.snapshot.paramMap.get('roomCode')!;

    const username = this.userService.getUsername();

    if (username) {
      this.socketService.emit('enterRoom', { roomCode: this.roomCode, username: username });
    } else {
      // If for some reason there is no username, go back to home to create one.
      this.router.navigate(['/']);
      return;
    }

    this.subscriptions.add(
      this.socketService.listen('lobbyState').subscribe((lobbyState: any) => {
        this.zone.run(() => {
          this.lobby = lobbyState;
        });
      })
    );

    this.subscriptions.add(
      this.socketService.listen('gameStarted').subscribe((gameState: any) => {
        this.zone.run(() => {
          this.router.navigate(['/game'], { 
            queryParams: { 
              room: gameState.roomCode, 
              color: this.getMyPlayer()?.color, 
              customCooldowns: JSON.stringify(gameState.customCooldowns) 
            },
            state: { board: gameState.board, players: gameState.players } 
          });
        });
      })
    );

    this.subscriptions.add(
      this.socketService.listen('teamError').subscribe((message: string) => {
        alert(message);
      })
    );

    this.subscriptions.add(
      this.socketService.listen('startError').subscribe((message: string) => {
        alert(message);
      })
    );

    this.subscriptions.add(
      this.socketService.listen('roomCancelled').subscribe(() => {
        alert('The room owner has cancelled the room.');
        this.zone.run(() => {
          this.router.navigate(['/']);
        });
      })
    );
  }

  ngOnDestroy() {
    this.socketService.emit('leaveLobby', { roomCode: this.roomCode });
    this.subscriptions.unsubscribe();
  }

  getMyPlayer() {
    return this.lobby?.players.find((p: any) => p.id === this.myPlayerId);
  }

  getTeam(team: string) {
    return this.lobby?.players.filter((p: any) => p.color === team);
  }

  isOwner() {
    return this.lobby?.roomOwnerId === this.myPlayerId;
  }

  isSpectator() {
      const myPlayer = this.getMyPlayer();
      return myPlayer && myPlayer.color === 'spectator';
  }

  isPlayerReady() {
    const myPlayer = this.getMyPlayer();
    return myPlayer ? myPlayer.isReady : false;
  }

  canStartGame() {
    if (!this.lobby) return false;
    if (this.lobby.winner) return true; // Always allow starting a new match if there is a winner
    const whitePlayer = this.lobby.players.find((p: any) => p.color === 'white');
    const blackPlayer = this.lobby.players.find((p: any) => p.color === 'black');
    if (!whitePlayer || !blackPlayer) return false;

    const allPlayersReady = this.lobby.players
      .filter((p: any) => p.color !== 'spectator')
      .every((p: any) => p.isReady);
    return allPlayersReady;
  }

  changeTeam(team: 'white' | 'black' | 'spectator') {
    this.socketService.emit('changeTeam', { roomCode: this.roomCode, team });
  }

  toggleReady() {
    const myPlayer = this.getMyPlayer();
    if (myPlayer && myPlayer.color !== 'spectator') {
      this.socketService.emit('setReady', { roomCode: this.roomCode, isReady: !myPlayer.isReady });
    }
  }

  updateSettings() {
    if (this.isOwner()) {
      this.socketService.emit('updateSettings', { roomCode: this.roomCode, customCooldowns: this.lobby.customCooldowns });
    }
  }

  startGame() {
    if (this.lobby.winner) {
      this.socketService.emit('startNewMatch', { roomCode: this.roomCode });
    } else {
      this.socketService.emit('startGame', { roomCode: this.roomCode });
    }
  }

  copyRoomCode() {
    if (!this.roomCode) return;
    navigator.clipboard.writeText(this.roomCode).then(() => {
      this.showCopyMessage = true;
      setTimeout(() => this.showCopyMessage = false, 2000); // Hide after 2 seconds
    }, (err) => {
      console.error('Could not copy text: ', err);
    });
  }

  leaveLobby() {
    if (this.isOwner()) {
        if (confirm('As the owner, leaving the lobby will cancel the room for everyone. Are you sure?')) {
            this.socketService.emit('cancelRoom', { roomCode: this.roomCode });
            this.router.navigate(['/']);
        }
    } else {
        this.router.navigate(['/']);
    }
  }
}