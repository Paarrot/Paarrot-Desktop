# Paarrot

Paarrot is a Matrix client focusing primarily on simple, elegant and secure interface. The desktop app is built with Electron and based on Cinny.
 
## Download

Installers for Windows and Linux can be downloaded from [releases](http://synbox.ruv.wtf:8418/litruv/cinny-desktop/releases).
 
Operating System | Download
---|---
Windows (x64) | <a href='http://synbox.ruv.wtf:8418/litruv/cinny-desktop/releases'>Get it on Windows</a>
Linux (AppImage) | <a href='http://synbox.ruv.wtf:8418/litruv/cinny-desktop/releases'>Get it on Linux</a>

### Linux Installation

For the best AppImage experience, we recommend using [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) which automatically integrates AppImages into your system.

## Local development

To setup development locally run the following commands:
* `git clone --recursive http://synbox.ruv.wtf:8418/litruv/cinny-desktop.git`
* `cd cinny-desktop/cinny`
* `npm ci`
* `cd ..`
* `npm ci`

To build the app locally, run:
* `npm run build`

To start local dev server, run:
* `npm run dev`
