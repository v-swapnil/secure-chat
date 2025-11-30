#!/bin/bash

# React Native Mobile App Setup Script

set -e

echo "🚀 Setting up Secure Chat Mobile App..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the mobile directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the mobile directory."
    exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js >= 18"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version must be >= 18. Current version: $(node -v)"
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js $(node -v) found"

# Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install

# Check if running on macOS for iOS setup
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 Detected macOS - Setting up iOS..."
    
    # Check for CocoaPods
    if ! command -v pod &> /dev/null; then
        echo "${YELLOW}⚠${NC} CocoaPods not found. Installing..."
        sudo gem install cocoapods
    fi
    
    echo "📦 Installing iOS pods..."
    cd ios
    pod install
    cd ..
    
    echo -e "${GREEN}✓${NC} iOS setup complete"
else
    echo "${YELLOW}⚠${NC} Not on macOS - Skipping iOS setup"
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cat > .env << EOF
API_URL=http://localhost:8080
WS_URL=ws://localhost:8080
FCM_SENDER_ID=your-fcm-sender-id
EOF
    echo -e "${GREEN}✓${NC} .env file created"
    echo -e "${YELLOW}⚠${NC} Please update .env with your actual values"
else
    echo -e "${GREEN}✓${NC} .env file already exists"
fi

# Check for Firebase configuration
echo ""
echo "🔥 Firebase Configuration Check:"
if [ ! -f "ios/GoogleService-Info.plist" ]; then
    echo -e "${YELLOW}⚠${NC} ios/GoogleService-Info.plist not found"
    echo "   Download from Firebase Console and add to ios/ directory"
else
    echo -e "${GREEN}✓${NC} iOS Firebase config found"
fi

if [ ! -f "android/app/google-services.json" ]; then
    echo -e "${YELLOW}⚠${NC} android/app/google-services.json not found"
    echo "   Download from Firebase Console and add to android/app/ directory"
else
    echo -e "${GREEN}✓${NC} Android Firebase config found"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env file with your API URLs"
echo "2. Add Firebase configuration files (if not done)"
echo "3. Start the development server:"
echo "   npm start"
echo ""
echo "4. Run on device/simulator:"
echo "   iOS:     npm run ios"
echo "   Android: npm run android"
echo ""
echo "For production builds, see README.md"
