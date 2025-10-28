import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LobbyService {
  public lobbyState = new BehaviorSubject<any>(null);

  constructor() { }
}
