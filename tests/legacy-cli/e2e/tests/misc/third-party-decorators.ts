import { writeMultipleFiles } from '../../utils/fs';
import { installWorkspacePackages } from '../../utils/packages';
import { ng } from '../../utils/process';
import { updateJsonFile } from '../../utils/project';

export default async function () {
  await updateJsonFile('package.json', (packageJson) => {
    // Install NGRX
    packageJson['dependencies']['@ngrx/effects'] = '^14.3.0';
    packageJson['dependencies']['@ngrx/schematics'] = '^14.3.0';
    packageJson['dependencies']['@ngrx/store'] = '^14.3.0';
    packageJson['dependencies']['@ngrx/store-devtools'] = '^14.3.0';
  });

  // Force is need to prevent npm 7+ from failing due to potential peer dependency resolution range errors.
  // This is especially common when testing snapshot builds for new prereleases.
  await installWorkspacePackages({ force: true });

  await updateJsonFile('tsconfig.json', (tsconfig) => {
    tsconfig.compilerOptions.useDefineForClassFields = false;
  });

  // Create an app that uses ngrx decorators and has e2e tests.
  await writeMultipleFiles({
    './e2e/src/app.po.ts': `
      import { browser, by, element } from 'protractor';
      export class AppPage {
        async navigateTo() {    return browser.get('/');  }
        getIncrementButton() { return element(by.buttonText('Increment')); }
        getDecrementButton() { return element(by.buttonText('Decrement')); }
        getResetButton() { return element(by.buttonText('Reset Counter')); }
        async getCounter() { return element(by.xpath('/html/body/app-root/div/span')).getText(); }
      }
    `,
    './e2e/src/app.e2e-spec.ts': `
      import { AppPage } from './app.po';

      describe('workspace-project App', () => {
        let page: AppPage;

        beforeEach(() => {
          page = new AppPage();
        });

        it('should operate counter', async () => {
          await page.navigateTo();
          await page.getIncrementButton().click();
          await page.getIncrementButton().click();
          expect(await page.getCounter()).toEqual('2');
          await page.getDecrementButton().click();
          expect(await page.getCounter()).toEqual('1');
          await page.getResetButton().click();
          expect(await page.getCounter()).toEqual('0');
        });
      });
    `,
    './src/app/app.component.ts': `
      import { Component } from '@angular/core';
      import { CommonModule } from '@angular/common';
      import { Store, select } from '@ngrx/store';
      import { Observable } from 'rxjs';
      import { INCREMENT, DECREMENT, RESET } from './counter.reducer';

      interface AppState {
        count: number;
      }

      @Component({
        standalone: true,
        selector: 'app-root',
        imports: [CommonModule],
        template: \`
          <button (click)="increment()">Increment</button>
          <div>Current Count: <span>{{ count$ | async }}</span></div>
          <button (click)="decrement()">Decrement</button>

          <button (click)="reset()">Reset Counter</button>
        \`,
      })
      export class AppComponent {
        count$: Observable<number>;

        constructor(private store: Store<AppState>) {
          this.count$ = store.pipe(select(state => state.count));
        }

        increment() {
          this.store.dispatch({ type: INCREMENT });
        }

        decrement() {
          this.store.dispatch({ type: DECREMENT });
        }

        reset() {
          this.store.dispatch({ type: RESET });
        }
      }
    `,
    './src/app/app.effects.ts': `
        import { Injectable } from '@angular/core';
        import { Actions, Effect } from '@ngrx/effects';
        import { filter, map, tap } from 'rxjs/operators';

        @Injectable()
        export class AppEffects {

          @Effect()
          mapper$ = this.actions$.pipe(map(() => ({ type: 'ANOTHER'})), filter(() => false));

          @Effect({ dispatch: false })
          logger$ = this.actions$.pipe(tap(console.log));

          constructor(private actions$: Actions) {}
        }
      `,
    './src/app/app.config.ts': `
      import { ApplicationConfig, importProvidersFrom } from '@angular/core';
      import { provideRouter } from '@angular/router';
      import { provideProtractorTestingSupport } from '@angular/platform-browser';
      import { AppComponent } from './app.component';
      import { StoreModule } from '@ngrx/store';
      import { StoreDevtoolsModule } from '@ngrx/store-devtools';
      import { EffectsModule } from '@ngrx/effects';
      import { AppEffects } from './app.effects';
      import { counterReducer } from './counter.reducer';

      import { routes } from './app.routes';

      export const appConfig: ApplicationConfig = {
        providers: [
          provideProtractorTestingSupport(),
          provideRouter(routes),
          importProvidersFrom(StoreModule.forRoot({ count: counterReducer })),
          importProvidersFrom(StoreDevtoolsModule.instrument()),
          importProvidersFrom(EffectsModule.forRoot([AppEffects])),
        ]
      };
    `,
    './src/app/counter.reducer.ts': `
      import { Action } from '@ngrx/store';

      export const INCREMENT = 'INCREMENT';
      export const DECREMENT = 'DECREMENT';
      export const RESET = 'RESET';

      const initialState = 0;

      export function counterReducer(state: number = initialState, action: Action) {
        switch (action.type) {
          case INCREMENT:
            return state + 1;

          case DECREMENT:
            return state - 1;

          case RESET:
            return 0;

          default:
            return state;
        }
      }
    `,
  });

  // Run the e2e tests against a production build.
  await ng('e2e', '--configuration=production');
}
