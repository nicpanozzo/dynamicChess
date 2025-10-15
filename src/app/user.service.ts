import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly USERNAME_KEY = 'chess-app-username';

  constructor() { }

  setUsername(username: string): void {
    localStorage.setItem(this.USERNAME_KEY, username);
  }

  getUsername(): string | null {
    return localStorage.getItem(this.USERNAME_KEY);
  }

  hasUsername(): boolean {
    return !!this.getUsername();
  }

  clearUsername(): void {
    localStorage.removeItem(this.USERNAME_KEY);
  }
}
