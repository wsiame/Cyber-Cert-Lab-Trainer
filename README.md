# Cyber Cert Lab Trainer

Cyber Cert Lab Trainer is an offline study application for networking and cybersecurity fundamentals. One React and TypeScript codebase can run in a browser, as a Windows desktop application through Electron, or as an Android application through Capacitor.

## Learning content

- Subnetting calculations and address ranges
- VLANs and trunking
- Common ports and protocols
- Security concepts, threats, architecture, operations, and governance
- Immediate answer feedback and explanations
- Local progress tracking

The included questions and explanations are original practice content. This project is not affiliated with or endorsed by CompTIA, Google, or any certification provider.

## Technology

- React and TypeScript
- Vite
- Electron for Windows packaging
- Capacitor for Android packaging
- Vitest and Testing Library

## Run locally

Install a current Node.js release, then run:

```powershell
npm install
npm run dev
```

## Test and build

```powershell
npm test
npm run build
```

## Desktop application

```powershell
npm run electron:dev
npm run electron:pack
```

## Android application

Android Studio and a configured Android SDK are required.

```powershell
npm run android:sync
npm run android:open
```

## Data and privacy

The trainer works offline after installation. Progress is stored locally. It does not require an account or send study results to a server.

## Project status

Personal learning and portfolio project. Content is educational and should not be treated as an official exam question bank.
