import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { SocketService } from './socket.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet, RouterLink],
  templateUrl: './app.component.html', // Will update app.component.html next
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'Dynamic Chess';
  username: string = '';
  roomCode: string = '';
  isInLobby: boolean = true;
  playerColor: 'white' | 'black' | null = null;
  currentRoomCode: string | null = null;
  joinError: string | null = null;

  constructor(private socketService: SocketService, private router: Router) {}

  ngOnInit() {
    this.socketService.listen('roomCreated').subscribe((data: { roomCode: string, color: 'white' | 'black' }) => {
      this.currentRoomCode = data.roomCode;
      this.playerColor = data.color;
      this.isInLobby = false;
      this.router.navigate(['/game'], { queryParams: { room: data.roomCode, color: data.color } });
    });

    this.socketService.listen('roomJoined').subscribe((data: { roomCode: string, color: 'white' | 'black' }) => {
      this.currentRoomCode = data.roomCode;
      this.playerColor = data.color;
      this.isInLobby = false;
      this.router.navigate(['/game'], { queryParams: { room: data.roomCode, color: data.color } });
    });

    this.socketService.listen('joinError').subscribe((message: string) => {
      this.joinError = message;
    });
  }

  createRoom() {
    if (this.username) {
      this.socketService.emit('createRoom', { username: this.username });
      this.joinError = null;
    } else {
      this.joinError = 'Please enter a username.';
    }
  }

  joinRoom() {
    if (this.username && this.roomCode) {
      this.socketService.emit('joinRoom', { username: this.username, roomCode: this.roomCode });
      this.joinError = null;
    } else {
      this.joinError = 'Please enter a username and room code.';
    }
  }
}