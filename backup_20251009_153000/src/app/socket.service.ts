import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket;
  private readonly uri: string = 'http://192.168.17.107:3000'; // Backend server URL

  constructor() {
    this.socket = io(this.uri);
  }

  // Listen for events from the server
  listen(eventName: string): Observable<any> {
    return new Observable((subscriber) => {
      this.socket.on(eventName, (data: any) => {
        subscriber.next(data);
      });
    });
  }

  // Emit events to the server
  emit(eventName: string, data: any) {
    this.socket.emit(eventName, data);
  }

  // Disconnect from the server
  disconnect() {
    this.socket.disconnect();
  }
}