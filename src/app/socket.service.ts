import { Injectable, isDevMode } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | undefined;

  public get id(): string | undefined {
    return this.socket?.id;
  }

  constructor() { }

  connect(): void {
    if (!this.socket) {
      const uri = isDevMode() ? 'http://localhost:3000' : '';
      this.socket = io(uri);
    }
  }

  // Listen for events from the server
  listen(eventName: string): Observable<any> {
    return new Observable((subscriber) => {
      this.socket?.on(eventName, (data: any) => {
        console.log(`[SocketService] Received event: ${eventName} with data:`, data);
        subscriber.next(data);
      });
    });
  }

  // Emit events to the server
  emit(eventName: string, data: any) {
    this.socket?.emit(eventName, data);
  }

  // Disconnect from the server
  disconnect() {
    this.socket?.disconnect();
  }

  getEvents(): Observable<{type: string, data: any}> {
    return new Observable(observer => {
      this.socket?.onAny((event, ...args) => {
        observer.next({ type: event, data: args[0] });
      });
    });
  }
}