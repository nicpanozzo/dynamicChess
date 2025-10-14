import { TestBed } from '@angular/core/testing';

import { Lobby } from './lobby';

describe('Lobby', () => {
  let service: Lobby;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Lobby);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
