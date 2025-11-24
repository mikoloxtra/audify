# Completed Tasks

1. **Task 1 – Rename the app to Audify**
   - Updated package name, metadata, UI labels, and local storage keys to reflect the new "Audify" branding.
2. **Task 2 – Set up Firebase auth, Firestore, and storage integration**
   - Added Firebase client initialization, replaced localStorage services with Firestore/Storage helpers, rewired auth flow (email/password + Google), and updated components to use async Firestore APIs.

# Todo   
- Make the slider more granular 0.2X speed increments
- Increse the size of the yellow note markers for ease of use on mobile
- Sum the timeline of each page into the slider, the playback slider should reflect the time for a page not a paragraph.
- Allow Editing the Document name after it's been scanned and or saved.
- Add PDF upload support
- Add Testing for all the features so far
- Add a link to ilovepdf to convert pdf to images or shrink document size or any other thing users might need before uploading to audify
- Add share link feature for users to share the link of audify with others
- Save user notes and timestamp to firebase
- Playback should autocontinue after user saves a note
- audio note feature should work, recording should work the way voice notes work in whatsapp all data should be stored in db, lets brainstorm how transcribing should work whether to use gemini or some API
- For multiple books/pages, do a pro/con list of allowing users batch upload multiple files and making the logic to scan all of them or calling smallpdf api to sqash them into one file and then scanning it.