# Personal Task Manager (To-Do List)

A static frontend web application for personal task management, styled identically to the reference design. Built entirely client-side using standard web technologies (HTML5, CSS3, modern ES6+ JavaScript) interfacing directly with **Google Cloud Firestore** and **Firebase Authentication** via the Firebase Web SDK v10. Zero custom backend servers (Node.js or Python) are required, making the application 100% ready for deployment on static hosting platforms like **GitHub Pages**.

---

## 🎨 Visual Design & Features

- **Identical Reference Styling**:
  - Deep charcoal theme (`#373737` canvas, `#4b4b4b` card headers, `#2f2f2f` expanded card bodies).
  - Bold, clean typography using Google Fonts **Poppins** and **Inter**.
  - Distinctive `Complete Task` button with exact olive-green border (`#516622`) and vibrant green text (`#579c18`).
  - Sleek top header with `To-Do List` title and `Past →` navigation button.
  - Collapsible task accordion cards showing the task title, `Deadline: [Date] · [Time]`, and chevron indicators (`⌵` / `>`).
- **Grouping by Deadline Day**:
  - All tasks are grouped strictly by their **deadline day** (e.g., *Today*, *Tomorrow*, specific calendar dates, or *Overdue*).
  - Each day section displays a day header and task count badge, with the respective task cards listed underneath.
- **Task Schema (Title & Description)**:
  - Each task consists of a **Title**, a **Description**, a **Deadline**, and a boolean **Completed** status.
  - Card headers display the task title on the left and the formatted deadline on the right.
  - Clicking any task card smoothly expands it to reveal its full description and the action buttons (`Complete Task`, `Edit`, `Delete`).
- **Task Lifecycle & Real-Time Sync**:
  - **Complete Task Button**: Clicking `Complete Task` executes an atomic Firestore `updateDoc` payload toggling `completed: true`. Firestore's real-time `onSnapshot` listener automatically moves the task to the **Past** page.
  - **Past Page & Uncomplete Button**: Completed tasks are listed on the Past page. Clicking `Uncomplete` updates the Firestore status to `completed: false`, returning the item to the active to-do list.
- **Edit Mode**:
  - The `Edit` header button toggles **Edit Mode**.
  - In Edit Mode, users can edit task titles, descriptions, and deadlines, delete tasks, or insert new tasks via inline day buttons or the modal form.
- **Single Authorized User Restriction**:
  - Firebase Authentication restricts app access to a single authorized user email or UID.
  - Unauthorized sign-ins are immediately blocked on the client side with a clear lock notice, and strictly prevented on the database level via Cloud Firestore Security Rules.

---

## 📁 Project Structure

```text
D:\Complete/
├── index.html              # Main application markup & modal templates
├── css/
│   └── styles.css          # Pixel-perfect styles sampled from the reference design
├── js/
│   ├── firebase-config.js  # Firebase modular SDK initialization & config store
│   ├── auth.js             # Authentication logic & single authorized user validation
│   ├── db.js               # Firestore interface (onSnapshot real-time listeners & CRUD)
│   └── app.js              # Application controller & state management
├── firestore.rules         # Security rules restricting database access to single user
├── reference picture.png   # Original reference design image
└── README.md               # Documentation & deployment guide
```

---

## 🚀 Quick Start (Local Preview)

The application includes a built-in **Local Demo Mode** so you can preview and test every feature immediately without creating a Firebase account beforehand:

1. Open `index.html` in any modern web browser.
2. The initial view displays tasks grouped by deadline day with the exact dark aesthetic from the reference picture.
3. Click any task header to expand/collapse its description and `Complete Task` button.
4. Click `Complete Task` — notice it moves instantly to the `Past` page.
5. Click `Past →` in the top right to see completed tasks with their `Uncomplete` button.
6. Click `Edit` to enter edit mode, update descriptions, add tasks, or delete tasks.

---

## ☁️ Connecting to Live Firebase

### 1. Create a Firebase Project
1. Go to the [Firebase Console](https://console.firebase.google.com/) and click **Add Project**.
2. Enable **Cloud Firestore**:
   - Go to **Build > Firestore Database** and click **Create Database**.
3. Enable **Firebase Authentication**:
   - Go to **Build > Authentication** and enable **Email/Password**.
   - Create your authorized user account (e.g. `student@university.edu`).

### 2. Configure Credentials in the App
You can connect live Firebase credentials in either of two ways:

#### Option A: In the Web UI (Recommended)
1. Click the **Settings (⚙️)** button or the **Demo Mode** pill in the top header.
2. Paste your Firebase credentials (`apiKey`, `projectId`, `authDomain`, etc.).
3. Set your **Single Authorized User Email** (e.g. `student@university.edu`).
4. Click **Save & Connect**. Credentials are stored securely in local storage and the app connects live to Firestore.

#### Option B: In `js/firebase-config.js`
Edit `js/firebase-config.js` and update `DEFAULT_FIREBASE_CONFIG` and `DEFAULT_AUTHORIZED_EMAIL`.

---

## 🔒 Firestore Security Rules

Deploy the provided `firestore.rules` file to your Firebase project:

```firestore
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isSingleAuthorizedUser() {
      return request.auth != null && (
        request.auth.token.email.lower() == "student@university.edu" ||
        request.auth.uid == "YOUR_AUTHORIZED_USER_UID_HERE"
      );
    }

    match /tasks/{taskId} {
      allow read, write: if isSingleAuthorizedUser();
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 🌐 Deploying to GitHub Pages

1. Push your code to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Personal Task Manager"
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git branch -M main
   git push -u origin main
   ```
2. In your GitHub repository, navigate to **Settings > Pages**.
3. Under **Build and deployment > Branch**, select `main` and `/ (root)`.
4. Click **Save**. The app is instantly live at `https://<your-username>.github.io/<your-repo-name>/`.
