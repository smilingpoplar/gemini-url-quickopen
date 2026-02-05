#!/bin/bash

EXTENSION_NAME="gemini-url-quickopen"
VERSION="1.0.0"

if [ "$1" != "chrome" ] && [ "$1" != "firefox" ]; then
    echo "Usage: ./build.sh [chrome|firefox]"
    exit 1
fi

BROWSER=$1
BUILD_DIR="dist/${BROWSER}"
OUTPUT_FILE="${EXTENSION_NAME}-${VERSION}-${BROWSER}.zip"

echo "Building for ${BROWSER}..."

rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

cp background.js "${BUILD_DIR}/"
cp options.html "${BUILD_DIR}/"
cp options.js "${BUILD_DIR}/"
cp content.js "${BUILD_DIR}/"
cp -r icons "${BUILD_DIR}/"
cp "${BROWSER}/manifest.json" "${BUILD_DIR}/manifest.json"

cd "${BUILD_DIR}"
zip -r "../../${OUTPUT_FILE}" .
cd ../..

echo "Build complete: ${OUTPUT_FILE}"
echo ""
echo "To install:"
if [ "${BROWSER}" = "chrome" ]; then
    echo "1. Open chrome://extensions"
    echo "2. Enable Developer mode"
    echo "3. Click 'Load unpacked' and select the dist/chrome folder"
else
    echo "TEMPORARY LOAD (for development/testing):"
    echo "1. Open Firefox, go to about:debugging"
    echo "2. Click 'This Firefox' on the left"
    echo "3. Click 'Load Temporary Add-on...'"
    echo "4. Select dist/firefox/manifest.json"
    echo ""
    echo "Note: Firefox requires signed extensions for permanent installation."
    echo "Temporary extensions will be removed when Firefox restarts."
    echo "For permanent use, submit to addons.mozilla.org or use Firefox Developer Edition."
fi
