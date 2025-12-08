import { Component, ChangeDetectionStrategy } from '@angular/core';
import { StudioComponent } from './components/chat/chat.component';

@Component({
  selector: 'app-root',
  template: `<app-studio></app-studio>`,
  styles: [':host { display: block; height: 100vh; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StudioComponent]
})
export class AppComponent {}