const { app, BrowserWindow } = require('electron');

console.log('TEST: Electron starting...');

app.whenReady().then(() => {
  console.log('TEST: App ready, creating window...');
  
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'TEST WINDOW',
    show: true,
    center: true
  });
  
  console.log('TEST: Window created, loading content...');
  win.loadURL('https://www.google.com');
  
  win.on('ready-to-show', () => {
    console.log('TEST: Window ready-to-show fired');
  });
  
  win.on('show', () => {
    console.log('TEST: Window shown!');
  });
});
