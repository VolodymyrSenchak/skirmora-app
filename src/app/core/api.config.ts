import { InjectionToken } from '@angular/core';

export interface AppConfig {
  /** Origin of skirmora-api, no trailing slash. HTTP and the socket share it. */
  apiUrl: string;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');
