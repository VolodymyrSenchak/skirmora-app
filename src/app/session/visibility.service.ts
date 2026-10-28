import { DestroyRef, DOCUMENT, inject, Injectable, signal } from '@angular/core';

/** `document.visibilityState` as a signal. The transport uses it to sleep a backgrounded tab. */
@Injectable({ providedIn: 'root' })
export class VisibilityService {
  private readonly doc = inject(DOCUMENT);
  private readonly _visible = signal(this.doc.visibilityState !== 'hidden');

  readonly visible = this._visible.asReadonly();

  constructor() {
    const onChange = () => this._visible.set(this.doc.visibilityState !== 'hidden');
    this.doc.addEventListener('visibilitychange', onChange);
    inject(DestroyRef).onDestroy(() => this.doc.removeEventListener('visibilitychange', onChange));
  }
}
