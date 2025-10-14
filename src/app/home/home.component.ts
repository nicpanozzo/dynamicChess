import { Component, OnDestroy, NgZone } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SocketService } from '../socket.service';
import { LobbyService } from '../lobby.service'; // Import LobbyService
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnDestroy {
  username: string = '';
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
    private lobbyService: LobbyService // Inject LobbyService
  ) {
    this.subscriptions.add(
      this.socketService.listen('lobbyState').subscribe((data: any) => {
        if (data && data.roomCode) {
          // Set the state in the service before navigating
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

  createRoom() {
    if (this.username) {
      const customCooldowns = {
        p: this.pawnCooldown,
        n: this.knightCooldown,
        b: this.bishopCooldown,
        r: this.rookCooldown,
        q: this.queenCooldown,
        k: this.kingCooldown,
      };
      // Corrected emit call with 2 arguments
      this.socketService.emit('createRoom', { username: this.username, customCooldowns });
    } else {
      alert('Please enter a username.');
    }
  }

  joinRoom() {
    if (this.username && this.roomCode) {
      // Corrected emit call with 2 arguments
      this.socketService.emit('joinRoom', { username: this.username, roomCode: this.roomCode });
    } else {
      alert('Please enter a username and room code.');
    }
  }
}
