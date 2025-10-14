import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { GameComponent } from './game/game.component';
import { RulesComponent } from './rules/rules.component';
import { LobbyComponent } from './lobby/lobby.component';

const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'lobby/:roomCode', component: LobbyComponent },
  { path: 'game', component: GameComponent },
  { path: 'rules', component: RulesComponent }
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes)
  ]
};
