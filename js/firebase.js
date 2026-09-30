import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  enableIndexedDbPersistence,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

let db = null;
let auth = null;
let currentUid = null;
let unsubscribeSnapshot = null;

// Show/hide sync bar
function setSyncBar(visible, text = 'Syncing...') {
  const bar = document.getElementById('syncBar');
  const txt = document.getElementById('syncBarText');
  if (!bar) return;
  if (visible) {
    bar.classList.remove('hidden');
    if (txt) txt.textContent = text;
  } else {
    bar.classList.add('hidden');
  }
}

// Show sync-fail toast briefly
function showSyncFail() {
  const toast = document.getElementById('syncFailToast');
  if (!toast) return;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// Returns the Firestore collection ref for the current user's tasks
function tasksRef() {
  if (!db || !currentUid) return null;
  return collection(db, 'users', currentUid, 'tasks');
}

// Initialize Firebase and sign in anonymously.
// onReady(uid) is called once auth is confirmed.
export function initFirebase(onReady) {
  const config = window.FIREBASE_CONFIG;
  if (!config || !config.projectId) {
    console.error('Lucky: Firebase config missing from window.FIREBASE_CONFIG');
    return;
  }

  const app = initializeApp(config);
  db = getFirestore(app);
  auth = getAuth(app);

  // Enable offline persistence
  enableIndexedDbPersistence(db).catch(err => {
    if (err.code === 'failed-precondition') {
      console.warn('Lucky: Offline persistence disabled — multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Lucky: Offline persistence not supported in this browser');
    }
  });

  setSyncBar(true, 'Connecting...');

  onAuthStateChanged(auth, user => {
    if (user) {
      currentUid = user.uid;
      setSyncBar(false);
      if (onReady) onReady(user.uid);
    } else {
      signInAnonymously(auth).catch(err => {
        console.error('Lucky: Anonymous sign-in failed', err);
        setSyncBar(false);
      });
    }
  });
}

// Listen to all tasks in real time. callback(tasksArray) fires on every change.
export function onTasksChange(callback) {
  if (!tasksRef()) {
    console.warn('Lucky: onTasksChange called before auth ready');
    return;
  }

  // Unsubscribe any previous listener
  if (unsubscribeSnapshot) unsubscribeSnapshot();

  setSyncBar(true, 'Syncing...');

  const q = query(tasksRef(), orderBy('createdAt', 'desc'));
  unsubscribeSnapshot = onSnapshot(
    q,
    snapshot => {
      const tasks = [];
      snapshot.forEach(docSnap => tasks.push(docSnap.data()));
      setSyncBar(false);
      callback(tasks);
    },
    err => {
      console.error('Lucky: Firestore snapshot error', err);
      setSyncBar(false);
      showSyncFail();
    }
  );
}

// Add a new task document
export async function addTask(task) {
  const ref = tasksRef();
  if (!ref) { showSyncFail(); return; }
  try {
    await setDoc(doc(ref, task.id), task);
  } catch (err) {
    console.error('Lucky: addTask failed', err);
    showSyncFail();
  }
}

// Update specific fields on an existing task
export async function updateTask(id, fields) {
  const ref = tasksRef();
  if (!ref) { showSyncFail(); return; }
  try {
    await updateDoc(doc(ref, id), fields);
  } catch (err) {
    console.error('Lucky: updateTask failed', err);
    showSyncFail();
  }
}

// Delete a task document
export async function deleteTask(id) {
  const ref = tasksRef();
  if (!ref) { showSyncFail(); return; }
  try {
    await deleteDoc(doc(ref, id));
  } catch (err) {
    console.error('Lucky: deleteTask failed', err);
    showSyncFail();
  }
}
