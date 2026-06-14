import { Provider } from '@angular/core';
import { LocalMatchRepository } from './local-match-repository';
import { MATCH_REPOSITORY } from './match-repository';

export const provideMatchRepository = (): Provider[] => [
  LocalMatchRepository,
  {
    provide: MATCH_REPOSITORY,
    useExisting: LocalMatchRepository,
  },
];
