#!/bin/bash
# Build script for Adventure Bird Android APK
# Usage: ./build-apk.sh [debug|release]

set -e

MODE="${1:-debug}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

export JAVA_HOME=/opt/android-studio/jbr
export ANDROID_SDK_ROOT=/home/cbueno/Android/Sdk

echo "🔄 Syncing web assets to Android project..."
cd "$SCRIPT_DIR"

# Copy web files to www/
mkdir -p www
cp index.html style.css game.js manifest.webmanifest www/
cp -r assets www/
cp -r icons www/

# Sync with Capacitor
npx cap sync android

# Build APK
echo "🔨 Building $MODE APK..."
cd android

if [ "$MODE" = "release" ]; then
    ./gradlew assembleRelease
    APK_PATH="app/build/outputs/apk/release/app-release-unsigned.apk"
    OUTPUT_NAME="AdventureBird-v1.0-release.apk"
else
    ./gradlew assembleDebug
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
    OUTPUT_NAME="AdventureBird-v1.0-debug.apk"
fi

cd "$SCRIPT_DIR"
cp "android/$APK_PATH" "$OUTPUT_NAME"

echo ""
echo "✅ APK built successfully!"
echo "📦 Output: $SCRIPT_DIR/$OUTPUT_NAME"
echo "📏 Size: $(du -h "$OUTPUT_NAME" | cut -f1)"
echo ""
echo "📱 To install on your device:"
echo "   adb install $OUTPUT_NAME"
echo ""
echo "   Or transfer the file to your phone and install it."
