# React Native Mobile App

This is the React Native mobile application for the Secure Chat system, implementing the same E2EE features as the web application.

## Features

- **End-to-End Encryption**: Uses `react-native-get-random-values` + TweetNaCl for cryptography
- **Secure Key Storage**: Identity keys stored in device Keychain (iOS) / Keystore (Android)
- **Push Notifications**: For presence and match events only (never for message content)
- **Offline Key Generation**: Pre-keys generated and stored securely offline
- **Mobile-Optimized Chat UI**: Touch-friendly interface with native feel
- **QR Code Verification**: Scan safety numbers via QR code for easy verification
- **In-Memory Session Keys**: Temporary session keys never persisted to disk

## Architecture

### Security Features

1. **Secure Random Generation**
   - Uses `react-native-get-random-values` polyfill for crypto.getRandomValues()
   - Provides cryptographically secure random number generation on mobile

2. **Key Storage**
   - Identity keys: Stored in iOS Keychain / Android Keystore (hardware-backed when available)
   - Pre-keys: Stored in secure storage with biometric protection
   - Session keys: Kept in memory only, never written to disk
   - All keys cleared on logout

3. **Push Notifications**
   - Only for presence updates (user online/offline)
   - Only for match found events
   - **NEVER** for message content (maintaining E2EE)
   - Uses Firebase Cloud Messaging (FCM)

4. **QR Code Verification**
   - Generate QR code containing safety number + user ID
   - Scan partner's QR code to verify connection
   - Time-limited QR codes (5 minutes expiry)
   - Visual confirmation of match/mismatch

## Setup Instructions

### Prerequisites

- Node.js >= 18
- React Native development environment
- Xcode (for iOS) or Android Studio (for Android)
- CocoaPods (for iOS)

### iOS Setup

1. Install dependencies:
```bash
cd mobile
npm install
cd ios && pod install && cd ..
```

2. Configure Firebase:
   - Download `GoogleService-Info.plist` from Firebase Console
   - Add to `ios/SecureChat/` directory

3. Run on iOS:
```bash
npm run ios
```

### Android Setup

1. Install dependencies:
```bash
cd mobile
npm install
```

2. Configure Firebase:
   - Download `google-services.json` from Firebase Console
   - Add to `android/app/` directory

3. Run on Android:
```bash
npm run android
```

## Project Structure

```
mobile/
├── src/
│   ├── config/           # Configuration files
│   ├── crypto/          # Cryptography engine
│   │   └── engine.ts    # Mobile crypto implementation
│   ├── screens/         # UI screens
│   │   ├── LoginScreen.tsx
│   │   ├── RegisterScreen.tsx
│   │   ├── DashboardScreen.tsx
│   │   ├── RandomMatchScreen.tsx
│   │   └── SafetyVerificationScreen.tsx
│   ├── services/        # API and service clients
│   │   ├── api.ts
│   │   ├── authService.ts
│   │   ├── websocketService.ts
│   │   └── pushService.ts
│   ├── stores/          # State management (Zustand)
│   │   ├── authStore.ts
│   │   └── chatStore.ts
│   ├── types/           # TypeScript type definitions
│   └── utils/           # Utility functions
├── App.tsx              # Root component
├── index.js             # Entry point
└── package.json
```

## Key Technologies

- **React Native 0.72**: Cross-platform mobile framework
- **React Navigation 6**: Navigation library
- **TweetNaCl**: Cryptography library
- **react-native-keychain**: Secure key storage
- **react-native-get-random-values**: Secure random generation
- **@notifee/react-native**: Local notifications
- **@react-native-firebase**: Push notifications
- **react-native-camera**: QR code scanning
- **react-native-qrcode-svg**: QR code generation
- **Zustand**: State management
- **AsyncStorage**: Non-sensitive data storage

## Security Considerations

### What's Stored Where

| Data Type | Storage Location | Security Level |
|-----------|-----------------|----------------|
| Identity Key | Keychain/Keystore | Hardware-backed encryption |
| Pre-keys | Keychain/Keystore | Hardware-backed encryption |
| Session Keys | Memory only | Cleared on app termination |
| Auth Token | AsyncStorage | Basic encryption |
| User ID | AsyncStorage | Basic encryption |
| Messages | Not stored | Ephemeral only |

### Session Key Management

```typescript
// Session keys stored in memory only
private sessionKeys: Map<string, Uint8Array> = new Map();

// Cleared when:
// 1. Chat session ends
// 2. App goes to background
// 3. User logs out
// 4. App is terminated
```

### Push Notification Privacy

```typescript
// ✅ Allowed notification types
{
  type: 'presence',
  message: 'A user is now online'
}

{
  type: 'match',
  message: 'You have been matched'
}

// ❌ NEVER sent
{
  type: 'message',  // Never happens
  content: '...'    // Message content never in notifications
}
```

## Development

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

### Building for Production

#### iOS
```bash
cd ios
xcodebuild -workspace SecureChat.xcworkspace -scheme SecureChat -configuration Release
```

#### Android
```bash
cd android
./gradlew assembleRelease
```

## Environment Variables

Create `.env` file:

```env
API_URL=http://localhost:8080
WS_URL=ws://localhost:8080
FCM_SENDER_ID=your-fcm-sender-id
```

For production, use:
```env
API_URL=https://api.yourdomain.com
WS_URL=wss://api.yourdomain.com
```

## Troubleshooting

### Common Issues

1. **Metro bundler issues**
```bash
npm start -- --reset-cache
```

2. **iOS pod installation fails**
```bash
cd ios
pod deintegrate
pod install
```

3. **Android build fails**
```bash
cd android
./gradlew clean
```

4. **Keychain access issues**
   - Ensure proper entitlements in Xcode
   - Check Keychain Sharing capability is enabled

## Performance Optimization

- Pre-keys generated offline during idle time
- WebSocket connection reused across app lifecycle
- Messages rendered with FlatList for efficient scrolling
- Cryptographic operations run on separate thread when possible

## Accessibility

- Full VoiceOver/TalkBack support
- Adjustable font sizes
- High contrast mode support
- Haptic feedback for important actions

## License

MIT License - See LICENSE file for details
