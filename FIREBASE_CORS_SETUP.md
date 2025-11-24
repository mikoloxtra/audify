# Firebase Storage CORS Configuration

## Issue
Firebase Storage blocks cross-origin requests from your Vercel deployment when using `fetch()` API.

## Solution Implemented
✅ **Using Firebase Storage SDK (`getBytes()`) instead of `fetch()`**

The app now uses Firebase Storage SDK's `getBytes()` method to retrieve cached audio files, which bypasses CORS restrictions since it uses Firebase's authentication.

## Changes Made
1. **Player.tsx**: Uses `getBytes(storageRef)` instead of `fetch(url)`
2. **types.ts**: Added `audioPaths` field to store Firebase Storage paths
3. **storageService.ts**: Returns both storage path and download URL

## Alternative: Manual CORS Configuration (If Needed)

If you need to use direct HTTP requests to Firebase Storage URLs, configure CORS:

### Option 1: Google Cloud Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `audify-2a916`
3. Navigate to **Storage**
4. Configure CORS to allow your Vercel domain

### Option 2: Using gsutil CLI

1. Install Google Cloud SDK:
   ```bash
   curl https://sdk.cloud.google.com | bash
   exec -l $SHELL
   gcloud init
   ```

2. Apply CORS configuration:
   ```bash
   gsutil cors set cors.json gs://audify-2a916.firebasestorage.app
   ```

The `cors.json` file is already created in the project root with the following configuration:
```json
[
  {
    "origin": ["https://audify-taupe.vercel.app", "http://localhost:5173", "http://localhost:4173"],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"],
    "maxAgeSeconds": 3600
  }
]
```

## Current Status
✅ **No manual CORS configuration needed** - The Firebase SDK handles authentication and access automatically.

## Notes
- The Firebase Storage SDK approach is more secure and reliable
- Download URLs are still stored for potential future use (sharing, exports, etc.)
- Storage paths are used for internal app access via SDK
