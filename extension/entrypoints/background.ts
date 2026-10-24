export default defineBackground(() => {
  console.log("[DeepSeek Studio Vue] Service worker initialized.");

  chrome.runtime.onInstalled.addListener(() => {
    console.log("[DeepSeek Studio Vue] Extension installed/updated.");
  });
});
