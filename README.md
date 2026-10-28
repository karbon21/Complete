# Complete

A fast, minimalist, dark-themed personal web task list built with vanilla HTML5, CSS3, and modern JavaScript. It connects directly to Google Cloud Firestore for real-time task synchronization and uses Firebase Authentication to secure access for a single owner.

Designed to run entirely client-side with zero custom backend infrastructure, making it ready for instant deployment to static hosting providers like GitHub Pages.

---

## Features

- **Deadline-Based Organization**: Tasks are automatically categorized by deadline day (Due Today, Tomorrow, Upcoming dates, or Overdue).
- **Expandable Task Cards**: Clean card layout displaying task title and deadline, expanding on click to reveal full task details and actions.
- **Real-Time Database Sync**: Powered by Firestore real-time listeners (`onSnapshot`) for instant cross-device updates without page refreshes.
- **Active & Completed Lifecycle**: Complete active tasks with a single click to archive them to the **Past** page, or restore completed tasks back to the active list anytime.
- **Edit Mode**: Dedicated editing state to quickly update task titles, descriptions, and deadlines, or delete tasks.
- **Single-User Security**: Strict access control via Firebase Authentication and Cloud Firestore Security Rules, ensuring only the verified owner can view or edit tasks.
- **Zero Build Tools Required**: Pure native ES modules and CSS variables—no npm build steps, webpack, or external build dependencies required.

---

## Project Structure

```text
├── index.html              # Core application markup
├── css/
│   └── styles.css          # Dark-theme stylesheet and responsive layout
├── js/
│   ├── app.js              # Application controller and UI interactions
│   ├── auth.js             # Authentication state observer & access control
│   ├── db.js               # Firestore real-time listeners and database operations
│   └── firebase-config.js  # Firebase SDK configuration and local credentials store
└── firestore.rules         # Security rules enforcing single-owner access
```

---

## Getting Started

### Local Preview
Open `index.html` directly in any modern browser. The application includes an offline demo mode that lets you test creating, editing, completing, and organizing tasks locally before connecting a database.

---

## Firebase Setup

To connect your own live Firestore database and enable authentication:

### 1. Create a Firebase Project
1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a project.
2. In the left menu, navigate to **Build > Authentication**, enable **Email/Password**, and add your account under the **Users** tab.
3. Navigate to **Build > Firestore Database**, click **Create database**, and start in production mode.

### 2. Deploy Security Rules
In your Firestore Database, open the **Rules** tab, replace the contents with the rules below (using your email), and click **Publish**:

```firestore
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function isOwner() {
      return request.auth != null && 
             request.auth.token.email.lower() == "your-email@example.com";
    }

    match /tasks/{taskId} {
      allow read, write: if isOwner();
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### 3. Connect Credentials
In your browser, open the app, click the **Settings (⚙️)** icon in the top header, paste your Firebase web config values, enter your authorized email, and click **Save & Connect**.

Alternatively, you can edit `js/firebase-config.js` and set your credentials directly in `DEFAULT_FIREBASE_CONFIG`.

---

## Deployment (GitHub Pages)

This project is built with static files and relative paths, ready for GitHub Pages:

1. Push the code to a GitHub repository:
   ```bash
   git add .
   git commit -m "Deploy task manager"
   git push origin main
   ```
2. In your GitHub repository, go to **Settings > Pages**.
3. Under **Build and deployment > Branch**, select `main` and `/ (root)`, then click **Save**.
4. In the Firebase Console under **Authentication > Settings > Authorized domains**, add your GitHub Pages domain (`<username>.github.io`) so Firebase permits sign-ins from your deployed site.