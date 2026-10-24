import { createApp } from 'vue';
import ContentApp from './ContentApp.vue';

export default defineContentScript({
  matches: ['*://chat.deepseek.com/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'deepseek-studio-root',
      position: 'overlay',
      alignment: 'bottom-right',
      append: 'body',
      onMount: (container) => {
        const app = createApp(ContentApp);
        app.mount(container);
        return app;
      },
      onRemove: (app) => {
        app?.unmount();
      },
    });

    ui.mount();
  },
});
