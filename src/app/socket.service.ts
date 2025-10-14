import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket;
  private readonly uri: string = 'http://192.168.17.107:3001'; // Backend server URL

  public get id(): string | undefined {
    return this.socket.id;
  }

  constructor() {
    this.socket = io(this.uri);
  }

  // Listen for events from the server
  listen(eventName: string): Observable<any> {
    console.log(`[SocketService] Listening for event: ${eventName}`);
    return new Observable((subscriber) => {
      this.socket.on(eventName, (data: any) => {
        console.log(`[SocketService] Received event: ${eventName} with data:`, data);
        subscriber.next(data);
      });
    });
  }

  // Emit events to the server
  emit(eventName: string, data: any) {
    console.log(`[SocketService] Emitting event: ${eventName} with data:`, data);
    this.socket.emit(eventName, data);
  }

  // Disconnect from the server
  disconnect() {
    this.socket.disconnect();
  }
}