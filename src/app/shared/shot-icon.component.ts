import { Component, Input } from '@angular/core';
import { ShotType } from '../domain/models';

@Component({
  selector: 'app-shot-icon',
  template: `
    <span class="shot-icon" [class]="'shot-icon shot-icon-' + iconName" aria-hidden="true"></span>
  `,
})
export class ShotIconComponent {
  @Input() type: ShotType | null = null;

  get iconName(): string {
    if (this.type === 'lob') return 'trick';
    return this.type ?? 'fault';
  }
}
