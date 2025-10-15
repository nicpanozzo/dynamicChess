import { Component, OnDestroy, OnInit, NgZone } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SocketService } from '../socket.service';
import { LobbyService } from '../lobby.service';
import { UserService } from '../user.service'; // Import UserService
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, FormsModule, CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, OnDestroy {
  savedUsername: string | null = null;
  newUsername: string = '';
  roomCode: string = '';
  pawnCooldown: number = 2000;
  knightCooldown: number = 6000;
  bishopCooldown: number = 6000;
  rookCooldown: number = 9000;
  queenCooldown: number = 0;
  kingCooldown: number = 0;

  private subscriptions: Subscription = new Subscription();

  constructor(
    private socketService: SocketService,
    private router: Router,
    private zone: NgZone,
    private lobbyService: LobbyService,
    private userService: UserService // Inject UserService
  ) {}

  ngOnInit() {
    this.savedUsername = this.userService.getUsername();

    this.subscriptions.add(
      this.socketService.listen('lobbyState').subscribe((data: any) => {
        if (data && data.roomCode) {
          this.lobbyService.lobbyState = data;
          this.zone.run(() => {
            this.router.navigate(['/lobby', data.roomCode]);
          });
        }
      })
    );

    this.subscriptions.add(
      this.socketService.listen('joinError').subscribe((message: string) => {
        alert(`Join Error: ${message}`);
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  saveUsername() {
    if (this.newUsername.trim()) {
      this.userService.setUsername(this.newUsername.trim());
      this.savedUsername = this.newUsername.trim();
      this.newUsername = '';
    }
  }

  changeUsername() {
    this.savedUsername = null;
  }

  createRoom() {
    if (this.savedUsername) {
      const customCooldowns = {
        p: this.pawnCooldown,
        n: this.knightCooldown,
        b: this.bishopCooldown,
        r: this.rookCooldown,
        q: this.queenCooldown,
        k: this.kingCooldown,
      };
      this.socketService.emit('createRoom', { username: this.savedUsername, customCooldowns });
    } else {
      alert('Please set a username.');
    }
  }

  joinRoom() {
    if (this.savedUsername && this.roomCode) {
      this.socketService.emit('joinRoom', { username: this.savedUsername, roomCode: this.roomCode });
    } else {
      alert('Please set a username and enter a room code.');
    }
  }
}
